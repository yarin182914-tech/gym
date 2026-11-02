// "משקל בוקר" — the daily weigh-in card at the top of Nutrition.
//
// One entry per calendar day (see setBodyWeight). Until today's is in, the
// card is an entry row pre-filled with the last weight, so the usual
// weigh-in is a ±0.1 nudge and שמירה; once it's in, it shrinks to a single
// line with the change since the previous weigh-in.
//
// Owns its element, like numeric-input: Nutrition's render() rebuilds the
// whole screen on every change, so it re-attaches this same element instead
// of re-creating it — an edit in progress survives opening the meal form.

import { setBodyWeight } from '../lib/firestore.js';
import { dateInputValue, parseDateInputValue, formatDayMonthHe } from '../lib/format.js';
import { mountNumericField } from './numeric-input.js';
import { confirmDialog } from './confirm-dialog.js';
import { showToast } from './toast.js';

const STEP = 0.1;
// A jump this big from the previous weigh-in is more likely a typo (87.4
// for 78.4) than a real change, so it asks before saving.
const SUSPICIOUS_JUMP_KG = 5;

const round2 = (n) => Math.round(n * 100) / 100;

function todayKey() {
  return dateInputValue(new Date());
}

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

// weights: newest day first (listBodyWeights); kept up to date in place.
export function createBodyWeightCard(weights) {
  const el = document.createElement('div');
  el.className = 'card bw-card';
  let editing = false;
  let draft = null;
  let saving = false;

  const today = () => weights.find((w) => w.date === todayKey());
  const previous = () => weights.find((w) => w.date < todayKey());

  function render() {
    const entry = today();
    if (entry && !editing) renderLogged(entry);
    else renderEntry(entry);
  }

  function renderLogged(entry) {
    const change = changeText(entry.kg, previous());
    el.innerHTML = `
      <div class="bw-logged">
        <span class="bw-label">משקל בוקר</span>
        <span class="bw-value num">${entry.kg}<span class="bw-unit">ק"ג</span></span>
        ${change ? `<span class="bw-change num">${change}</span>` : ''}
        <button type="button" class="bw-edit" data-bw-edit>עריכה</button>
      </div>`;
    el.querySelector('[data-bw-edit]').addEventListener('click', () => {
      editing = true;
      render();
      el.querySelector('.numeric-field-input')?.focus();
    });
  }

  function renderEntry(entry) {
    const prev = previous();
    draft = entry?.kg ?? prev?.kg ?? null;
    el.innerHTML = `
      <div class="bw-head">
        <span class="bw-label">משקל בוקר</span>
        ${prev ? `<span class="bw-last">אחרון: <span class="num">${prev.kg}</span> · ${relativeDay(prev.date)}</span>` : ''}
      </div>
      <div class="bw-entry">
        <div class="bw-stepper">
          <button type="button" class="bw-step" data-bw-step="-1" aria-label="פחות 0.1">−</button>
          <div class="bw-field" data-bw-field></div>
          <button type="button" class="bw-step" data-bw-step="1" aria-label="עוד 0.1">+</button>
        </div>
        ${editing ? '<button type="button" class="btn btn-secondary" data-bw-cancel>ביטול</button>' : ''}
        <button type="button" class="btn btn-primary" data-bw-save>שמירה</button>
      </div>`;

    const field = mountNumericField(el.querySelector('[data-bw-field]'), {
      value: draft,
      unitLabel: 'ק"ג',
      ariaLabel: 'משקל גוף',
      nullable: true,
      onCommit: (v) => { draft = v; },
    });
    field.setPlaceholder('0.0');

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
    const kg = round2(draft);
    const prev = previous();
    if (prev && Math.abs(kg - prev.kg) >= SUSPICIOUS_JUMP_KG) {
      const ok = await confirmDialog({
        title: 'לשמור את המשקל?',
        message: `${kg} ק"ג — שינוי של ${round2(Math.abs(kg - prev.kg))} ק"ג מהשקילה הקודמת (${prev.kg}).`,
        confirmLabel: 'שמירה',
      });
      if (!ok) return;
    }

    const key = todayKey();
    const note = today()?.note || '';
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
    const saved = { id: key, date: key, kg, note };
    const i = weights.findIndex((w) => w.date === key);
    if (i >= 0) weights[i] = saved;
    else weights.unshift(saved);
    editing = false;
    render();
  }

  render();
  return el;
}
