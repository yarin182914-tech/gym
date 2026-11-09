// The sleep card: last night in two seconds. Until it's logged, two clocks
// already set to the usual times and a save button; once logged, the times,
// a ring of hours against the minimum, the streak and an edit button.
// Underneath, this week's seven nights — tap one to log or fix it.
//
// Lives on the "היום" screen (js/pages/today.js), under the next step.
// Owns its element, like the body-weight card: the screen re-attaches it on
// every render. The rules themselves are in js/lib/sleep.js.

import { setSleep, deleteSleep, updateUserSettings } from '../lib/firestore.js';
import {
  buildNight, evaluateNight, nightGrade, nightRules, usualTimes, sleepSettings, sleepStreak,
  clockOf, formatDuration, shiftDays, parseKey, dateKey,
} from '../lib/sleep.js';
import { mountTimeField } from './date-time-picker.js';
import { mountNumericField } from './numeric-input.js';
import { openBottomSheet } from './bottom-sheet.js';
import { confirmDialog } from './confirm-dialog.js';
import { showToast } from './toast.js';
import { icon } from './icon.js';
import { esc } from '../core/dom.js';

const WEEKDAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const WEEKDAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const todayKey = () => dateKey(new Date());

const ON_TIME_TEXT = { full: 'נרדמת בזמן', close: 'קרוב לזמן', miss: 'מאוחר' };
const DURATION_TEXT = { full: 'שעות מלאות', close: 'כמעט', miss: 'קצר' };

// nights: sleep docs (any order); userDoc: users/{uid} (sleep settings);
// onChange(nights) after a night is saved or deleted.
export function createSleepCard(nights, userDoc, { onChange } = {}) {
  let settings = sleepSettings(userDoc);
  let list = [...nights];
  const el = document.createElement('div');
  el.className = 'card sleep-card';

  const nightOn = (key) => list.find((n) => n.date === key);

  // "ליל ה׳" — a night is named by its evening.
  const nightName = (morningKey) => `ליל ${WEEKDAY_NAMES[parseKey(shiftDays(morningKey, -1)).getDay()]}`;

  async function save(key, bed, wake) {
    const night = buildNight(key, bed, wake);
    if (!night) {
      showToast('שעת הקימה צריכה להיות אחרי שעת ההירדמות');
      return false;
    }
    const isNew = !nightOn(key);
    try {
      await setSleep(key, { ...night, source: 'manual' }, { isNew });
    } catch (err) {
      console.error('[sleep] save failed', err);
      showToast('השמירה נכשלה — נסה שוב');
      return false;
    }
    list = list.filter((n) => n.date !== key).concat({ id: key, ...night, source: 'manual' });
    onChange?.(list);
    render();
    return true;
  }

  // Duration and verdict for two clock values, before saving.
  function preview(key, bed, wake) {
    const night = buildNight(key, bed, wake);
    if (!night) return 'הקימה לפני ההירדמות';
    const ev = evaluateNight(night, settings);
    return `${formatDuration(night.durationMin)} שעות · ${DURATION_TEXT[ev.duration]}`;
  }

  function verdictChips(ev) {
    const chip = (grade, text) => `<span class="sleep-chip sleep-chip--${grade}">${text}</span>`;
    return [
      ev.flexible ? chip('flex', 'לילה גמיש') : chip(ev.onTime, ON_TIME_TEXT[ev.onTime]),
      chip(ev.duration, DURATION_TEXT[ev.duration]),
    ].join('');
  }

  function ring(night, ev) {
    const r = 18;
    const c = 2 * Math.PI * r;
    const progress = Math.min(1, night.durationMin / nightRules(night.date, settings).minMin);
    return `
      <svg class="sleep-ring sleep-ring--${ev.duration}" viewBox="0 0 44 44" aria-hidden="true">
        <circle class="sleep-ring-track" cx="22" cy="22" r="${r}"></circle>
        <circle class="sleep-ring-fill" cx="22" cy="22" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - progress)}"></circle>
      </svg>`;
  }

  function weekStrip() {
    const today = todayKey();
    const keys = Array.from({ length: 7 }, (_, i) => shiftDays(today, i - 6));
    return `
      <div class="sleep-week" role="list" aria-label="השבוע">
        ${keys.map((key) => {
          const n = nightOn(key);
          const ev = n ? evaluateNight(n, settings) : null;
          const grade = ev ? nightGrade(ev) : 'none';
          const flexible = nightRules(key, settings).flexible;
          const evening = parseKey(shiftDays(key, -1)).getDay();
          return `
          <button type="button" class="sleep-day sleep-day--${grade}${flexible ? ' sleep-day--flexible' : ''}${key === today ? ' sleep-day--last' : ''}" data-night="${key}" role="listitem"
            aria-label="${esc(nightName(key))}${n ? ` · ${formatDuration(n.durationMin)} שעות` : ' · לא נרשם'}">
            <span class="sleep-day-label">${WEEKDAY_LETTERS[evening]}</span>
            <span class="sleep-day-dot"></span>
            <span class="sleep-day-dur num">${n ? formatDuration(n.durationMin) : '–'}</span>
          </button>`;
        }).join('')}
      </div>`;
  }

  function render() {
    const key = todayKey();
    const last = nightOn(key);
    const streak = sleepStreak(list, settings, key);
    const usual = usualTimes(key, settings);

    el.innerHTML = `
      <div class="sleep-head">
        <span class="sleep-title">${icon('moon', { className: 'icon--sm' })} שינה</span>
        <span class="sleep-sub">אתמול בלילה${nightRules(key, settings).flexible ? ' · גמיש' : ''}</span>
        ${streak ? `<span class="sleep-streak" aria-label="${streak} לילות ברצף">${icon('flame', { className: 'icon--sm' })}<span class="num">${streak}</span></span>` : ''}
        <button type="button" class="app-bar-btn sleep-settings-btn" data-sleep-settings aria-label="הגדרות שינה">${icon('settings', { className: 'icon--sm' })}</button>
      </div>
      ${last ? (() => {
        const ev = evaluateNight(last, settings);
        return `
        <div class="sleep-summary">
          ${ring(last, ev)}
          <div class="sleep-summary-text">
            <div class="sleep-times num"><bdi>${clockOf(last.bedtime)}</bdi> ← <bdi>${clockOf(last.wakeTime)}</bdi></div>
            <div class="sleep-verdict"><span class="num">${formatDuration(last.durationMin)}</span> שעות ${verdictChips(ev)}</div>
          </div>
          <button type="button" class="bw-edit" data-night-edit="${key}">עריכה</button>
        </div>`;
      })() : `
        <div class="sleep-clocks">
          <div><div class="sheet-field-label">נרדמתי</div><div data-sleep-bed></div></div>
          <div><div class="sheet-field-label">קמתי</div><div data-sleep-wake></div></div>
        </div>
        <div class="sleep-save-row">
          <span class="sleep-preview text-muted" data-sleep-preview>${esc(preview(key, usual.bed, usual.wake))}</span>
          <button type="button" class="btn btn-primary" data-sleep-save>שמירה</button>
        </div>`}
      ${weekStrip()}`;

    el.querySelector('[data-sleep-settings]').addEventListener('click', openSettingsSheet);
    el.querySelector('[data-night-edit]')?.addEventListener('click', () => openNightSheet(key));
    el.querySelectorAll('[data-night]').forEach((btn) => {
      btn.addEventListener('click', () => openNightSheet(btn.dataset.night));
    });

    if (!last) {
      let bed = usual.bed;
      let wake = usual.wake;
      const previewEl = el.querySelector('[data-sleep-preview]');
      const refresh = () => { previewEl.textContent = preview(key, bed, wake); };
      mountTimeField(el.querySelector('[data-sleep-bed]'), { value: bed, clearable: false, ariaLabel: 'שעת הירדמות', onChange: (v) => { bed = v; refresh(); } });
      mountTimeField(el.querySelector('[data-sleep-wake]'), { value: wake, clearable: false, ariaLabel: 'שעת קימה', onChange: (v) => { wake = v; refresh(); } });
      const saveBtn = el.querySelector('[data-sleep-save]');
      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        if (!(await save(key, bed, wake))) saveBtn.disabled = false;
      });
    }
  }

  // Log or fix any night of the week; delete a logged one.
  function openNightSheet(key) {
    const existing = nightOn(key);
    const usual = usualTimes(key, settings);
    let bed = existing ? clockOf(existing.bedtime) : usual.bed;
    let wake = existing ? clockOf(existing.wakeTime) : usual.wake;
    const morning = parseKey(key).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
    openBottomSheet({
      ariaLabel: nightName(key),
      render(body, sheetApi) {
        body.innerHTML = `
          <h3 style="margin:0 0 4px; color:var(--text);">${esc(nightName(key))}</h3>
          <p class="text-muted" style="margin:0; font-size:0.8rem;">עד הבוקר של ${esc(morning)}${nightRules(key, settings).flexible ? ' · לילה גמיש: נספר רק המשך' : ''}</p>
          <div class="sleep-clocks">
            <div><div class="sheet-field-label">נרדמתי</div><div data-n-bed></div></div>
            <div><div class="sheet-field-label">קמתי</div><div data-n-wake></div></div>
          </div>
          <p class="text-muted" data-n-preview style="margin:10px 0 0; font-size:0.85rem;"></p>
          <div class="sheet-actions">
            ${existing ? '<button type="button" class="btn btn-danger" data-n-delete>מחיקה</button>' : ''}
            <button type="button" class="btn btn-secondary" data-n-cancel>ביטול</button>
            <button type="button" class="btn btn-primary" data-n-save>שמירה</button>
          </div>`;
        const previewEl = body.querySelector('[data-n-preview]');
        const refresh = () => { previewEl.textContent = preview(key, bed, wake); };
        refresh();
        mountTimeField(body.querySelector('[data-n-bed]'), { value: bed, clearable: false, ariaLabel: 'שעת הירדמות', onChange: (v) => { bed = v; refresh(); } });
        mountTimeField(body.querySelector('[data-n-wake]'), { value: wake, clearable: false, ariaLabel: 'שעת קימה', onChange: (v) => { wake = v; refresh(); } });
        body.querySelector('[data-n-cancel]').addEventListener('click', () => sheetApi.close());
        body.querySelector('[data-n-save]').addEventListener('click', async () => {
          if (await save(key, bed, wake)) sheetApi.close();
        });
        body.querySelector('[data-n-delete]')?.addEventListener('click', async () => {
          const ok = await confirmDialog({
            title: 'למחוק את הלילה?',
            message: `${nightName(key)} · ${formatDuration(existing.durationMin)} שעות`,
            confirmLabel: 'מחיקה',
            danger: true,
          });
          if (!ok) return;
          try {
            await deleteSleep(key);
          } catch (err) {
            console.error('[sleep] delete failed', err);
            showToast('המחיקה נכשלה — נסה שוב');
            return;
          }
          list = list.filter((n) => n.date !== key);
          onChange?.(list);
          sheetApi.close();
          render();
        });
      },
    });
  }

  // Bedtime target and latest, wake time, minimum hours and flexible
  // nights — the full settings screen comes in M8.
  function openSettingsSheet() {
    const draft = { ...settings, sleepFlexibleNights: [...settings.sleepFlexibleNights] };
    openBottomSheet({
      ariaLabel: 'הגדרות שינה',
      render(body, sheetApi) {
        const flexPills = () => WEEKDAY_NAMES.map((name, i) => `
          <button type="button" class="pill${draft.sleepFlexibleNights.includes(i) ? ' active' : ''}" data-flex="${i}" aria-pressed="${draft.sleepFlexibleNights.includes(i)}">${WEEKDAY_LETTERS[i]}׳</button>`).join('');
        body.innerHTML = `
          <h3 style="margin:0 0 4px; color:var(--text);">הגדרות שינה</h3>
          <div class="sleep-clocks">
            <div><div class="sheet-field-label">יעד שינה</div><div data-s-target></div></div>
            <div><div class="sheet-field-label">לכל המאוחר</div><div data-s-latest></div></div>
          </div>
          <div class="sleep-clocks">
            <div><div class="sheet-field-label">שעת קימה רגילה</div><div data-s-wake></div></div>
            <div><div class="sheet-field-label">מינימום שעות</div><div data-s-min></div></div>
          </div>
          <div class="sheet-field-label">לילות גמישים (לפי ערב) — נספר רק המשך</div>
          <div class="pill-row" data-s-flex>${flexPills()}</div>
          <div class="sheet-actions">
            <button type="button" class="btn btn-secondary" data-s-cancel>ביטול</button>
            <button type="button" class="btn btn-primary" data-s-save>שמירה</button>
          </div>`;
        mountTimeField(body.querySelector('[data-s-target]'), { value: draft.sleepBedtimeTarget, clearable: false, ariaLabel: 'יעד שינה', onChange: (v) => { draft.sleepBedtimeTarget = v; } });
        mountTimeField(body.querySelector('[data-s-latest]'), { value: draft.sleepBedtimeLatest, clearable: false, ariaLabel: 'שעת שינה מקסימלית', onChange: (v) => { draft.sleepBedtimeLatest = v; } });
        mountTimeField(body.querySelector('[data-s-wake]'), { value: draft.sleepWakeTime, clearable: false, ariaLabel: 'שעת קימה רגילה', onChange: (v) => { draft.sleepWakeTime = v; } });
        mountNumericField(body.querySelector('[data-s-min]'), { value: draft.sleepMinHours, unitLabel: 'שעות', ariaLabel: 'מינימום שעות שינה', onCommit: (v) => { draft.sleepMinHours = v; } });
        const flexEl = body.querySelector('[data-s-flex]');
        flexEl.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-flex]');
          if (!btn) return;
          const day = Number(btn.dataset.flex);
          const set = new Set(draft.sleepFlexibleNights);
          if (set.has(day)) set.delete(day); else set.add(day);
          draft.sleepFlexibleNights = [...set].sort();
          flexEl.innerHTML = flexPills();
        });
        body.querySelector('[data-s-cancel]').addEventListener('click', () => sheetApi.close());
        body.querySelector('[data-s-save]').addEventListener('click', async () => {
          if (!draft.sleepMinHours) {
            showToast('יש להזין מינימום שעות');
            return;
          }
          const patch = {
            sleepBedtimeTarget: draft.sleepBedtimeTarget,
            sleepBedtimeLatest: draft.sleepBedtimeLatest,
            sleepWakeTime: draft.sleepWakeTime,
            sleepMinHours: draft.sleepMinHours,
            sleepFlexibleNights: draft.sleepFlexibleNights,
          };
          try {
            await updateUserSettings(patch);
          } catch (err) {
            console.error('[sleep] settings save failed', err);
            showToast('השמירה נכשלה — נסה שוב');
            return;
          }
          settings = sleepSettings({ ...settings, ...patch });
          sheetApi.close();
          render();
        });
      },
    });
  }

  render();
  return el;
}
