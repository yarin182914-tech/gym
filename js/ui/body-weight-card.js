// "משקל בוקר" — the daily weigh-in card at the top of Nutrition.
//
// One entry per calendar day (see setBodyWeight). Until today's is in, the
// card is an entry row pre-filled with the last weight, so the usual
// weigh-in is a ±0.1 nudge and שמירה; once it's in, it shrinks to a single
// line with the change since the previous weigh-in. The entry row has a
// date, today by default, for filling in a morning that was missed.
//
// Owns its element, like numeric-input: Nutrition's render() rebuilds the
// whole screen on every change, so it re-attaches this same element instead
// of re-creating it — an edit in progress survives opening the meal form.

import { setBodyWeight } from '../lib/firestore.js';
import { parseDateInputValue, formatDayMonthHe } from '../lib/format.js';
import { todayKey, round2, upsertWeight } from '../lib/body-weight.js';
import { mountNumericField } from './numeric-input.js';
import { mountDateField } from './date-time-picker.js';
import { confirmDialog } from './confirm-dialog.js';
import { showToast } from './toast.js';

const STEP = 0.1;
// A jump this big from the previous weigh-in is more likely a typo (87.4
// for 78.4) than a real change, so it asks before saving.
const SUSPICIOUS_JUMP_KG = 5;


// "אתמול", "לפני 3 ימים", "28 באוק"
function relativeDay(key) {
  const days = Math.round((parseDateInputValue(todayKey()) - parseDateInputValue(key)) / 86400000);
  if (days === 1) return 'אתמול';
  if (days < 7) return `לפני ${days} ימים`;
  return formatDayMonthHe(parseDateInputValue(key));
}

// "−0.3 מאתמול" — U+2212 minus, matching the steppers.
function changeText(kg, prev) {
  if (!prev) return '';
  const d = round2(kg - prev.kg);
  const sign = d > 0 ? '+' : d < 0 ? '−' : '±';
  const when = relativeDay(prev.date);
  const from = when === 'אתמול' ? 'מאתמול' : when.startsWith('לפני') ? `מ${when}` : `מ-${when}`;
  return `<bdi dir="ltr">${sign}${Math.abs(d)}</bdi> ${from}`;
}

// weights: newest day first (listBodyWeights); kept that way in place.
export function createBodyWeightCard(weights) {
  const el = document.createElement('div');
  el.className = 'card bw-card';
  let editing = false;
  let dateKey = todayKey(); // the day being entered — today unless changed
  let draft = null;
  let saving = false;

  const entryFor = (key) => weights.find((w) => w.date === key);
  // Newest-first, so the first one earlier than `key` is the nearest.
  const previousBefore = (key) => weights.find((w) => w.date < key);

  function render() {
    const entry = entryFor(todayKey());
    if (entry && !editing) renderLogged(entry);
    else renderEntry();
  }

  function renderLogged(entry) {
    const change = changeText(entry.kg, previousBefore(entry.date));
    el.innerHTML = `
      <div class="bw-logged">
        <span class="bw-label">משקל בוקר</span>
        <span class="bw-value num">${entry.kg}<span class="bw-unit">ק"ג</span></span>
        ${change ? `<span class="bw-change num">${change}</span>` : ''}
        <button type="button" class="bw-edit" data-bw-edit>עריכה</button>
      </div>`;
    el.querySelector('[data-bw-edit]').addEventListener('click', () => {
      editing = true;
      dateKey = todayKey();
      render();
      el.querySelector('.numeric-field-input')?.focus();
    });
  }

  function renderEntry() {
    const isToday = dateKey === todayKey();
    const existing = entryFor(dateKey);
    const prev = previousBefore(dateKey);
    // That day's own weight if it has one; otherwise the closest weigh-in —
    // before it, or (filling in an older gap) the first one after it.
    draft = existing?.kg ?? prev?.kg ?? [...weights].reverse().find((w) => w.date > dateKey)?.kg ?? null;
    const hint = existing && !isToday
      ? `כבר נשמר ליום הזה: <span class="num">${existing.kg}</span> — שמירה תחליף`
      : prev ? `אחרון: <span class="num">${prev.kg}</span> · ${relativeDay(prev.date)}` : '';
    el.innerHTML = `
      <div class="bw-head">
        <span class="bw-label">משקל בוקר</span>
        <div data-bw-date></div>
      </div>
      <div class="bw-entry">
        <div class="bw-stepper">
          <button type="button" class="bw-step" data-bw-step="-1" aria-label="פחות 0.1">−</button>
          <div class="bw-field" data-bw-field></div>
          <button type="button" class="bw-step" data-bw-step="1" aria-label="עוד 0.1">+</button>
        </div>
        ${editing || !isToday ? '<button type="button" class="btn btn-secondary" data-bw-cancel>ביטול</button>' : ''}
        <button type="button" class="btn btn-primary" data-bw-save>שמירה</button>
      </div>
      ${hint ? `<div class="bw-last">${hint}</div>` : ''}`;

    const field = mountNumericField(el.querySelector('[data-bw-field]'), {
      value: draft,
      unitLabel: 'ק"ג',
      ariaLabel: 'משקל גוף',
      nullable: true,
      onCommit: (v) => { draft = v; },
    });
    field.setPlaceholder('0.0');

    mountDateField(el.querySelector('[data-bw-date]'), {
      value: dateKey,
      ariaLabel: 'תאריך השקילה',
      compact: true,
      accent: !isToday, // a past day is the unusual case — make it obvious
      onChange: (v) => {
        dateKey = v;
        renderEntry();
      },
    });
    el.querySelectorAll('[data-bw-step]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (draft === null) return;
        draft = Math.max(0, round2(draft + Number(btn.dataset.bwStep) * STEP));
        field.setValue(draft);
      });
    });
    // Enter commits the field (numeric-input blurs on it), then saves.
    el.querySelector('.numeric-field-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save();
    });
    el.querySelector('[data-bw-cancel]')?.addEventListener('click', () => {
      editing = false;
      dateKey = todayKey();
      render();
    });
    el.querySelector('[data-bw-save]').addEventListener('click', save);
  }

  async function save() {
    if (saving) return;
    if (!draft) {
      showToast('יש להזין משקל');
      return;
    }
    const key = dateKey;
    const kg = round2(draft);
    const prev = previousBefore(key);
    if (prev && Math.abs(kg - prev.kg) >= SUSPICIOUS_JUMP_KG) {
      const ok = await confirmDialog({
        title: 'לשמור את המשקל?',
        message: `${kg} ק"ג — שינוי של ${round2(Math.abs(kg - prev.kg))} ק"ג מהשקילה הקודמת (${prev.kg}).`,
        confirmLabel: 'שמירה',
      });
      if (!ok) return;
    }

    const note = entryFor(key)?.note || '';
    saving = true;
    el.querySelector('[data-bw-save]')?.setAttribute('disabled', '');
    try {
      await setBodyWeight(key, { kg, note });
    } catch (err) {
      console.error('[body-weight] save failed', err);
      showToast('השמירה נכשלה — נסה שוב');
      el.querySelector('[data-bw-save]')?.removeAttribute('disabled');
      return;
    } finally {
      saving = false;
    }
    upsertWeight(weights, { id: key, date: key, kg, note });

    if (key !== todayKey()) showToast(`נשמר ל-${formatDayMonthHe(parseDateInputValue(key))}`);
    editing = false;
    dateKey = todayKey();
    render();
  }

  render();
  return el;
}
