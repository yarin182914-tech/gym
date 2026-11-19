// The sleep settings as a block any sheet or screen can hold: bedtime
// target and latest, wake time, minimum hours and flexible nights. Used by
// the sleep card's settings sheet (js/ui/sleep-card.js) and the first-login
// questionnaire (js/ui/onboarding.js). The rules are in js/lib/sleep.js.

import { mountTimeField } from './date-time-picker.js';
import { mountNumericField } from './numeric-input.js';

const WEEKDAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

// The five fields as saved on users/{uid}.
export const SLEEP_FIELDS = ['sleepBedtimeTarget', 'sleepBedtimeLatest', 'sleepWakeTime', 'sleepMinHours', 'sleepFlexibleNights'];

// Fills `el`; `draft` (sleepSettings() shape) is changed in place.
export function mountSleepFields(el, draft) {
  draft.sleepFlexibleNights = [...(draft.sleepFlexibleNights || [])];
  const flexPills = () => WEEKDAY_LETTERS.map((letter, i) => `
    <button type="button" class="pill${draft.sleepFlexibleNights.includes(i) ? ' active' : ''}" data-flex="${i}" aria-pressed="${draft.sleepFlexibleNights.includes(i)}">${letter}׳</button>`).join('');
  el.innerHTML = `
    <div class="sleep-clocks">
      <div><div class="sheet-field-label">יעד שינה</div><div data-s-target></div></div>
      <div><div class="sheet-field-label">לכל המאוחר</div><div data-s-latest></div></div>
    </div>
    <div class="sleep-clocks">
      <div><div class="sheet-field-label">שעת קימה רגילה</div><div data-s-wake></div></div>
      <div><div class="sheet-field-label">מינימום שעות</div><div data-s-min></div></div>
    </div>
    <div class="sheet-field-label">לילות גמישים (לפי ערב) — נספר רק המשך</div>
    <div class="pill-row" data-s-flex>${flexPills()}</div>`;
  mountTimeField(el.querySelector('[data-s-target]'), { value: draft.sleepBedtimeTarget, clearable: false, ariaLabel: 'יעד שינה', onChange: (v) => { draft.sleepBedtimeTarget = v; } });
  mountTimeField(el.querySelector('[data-s-latest]'), { value: draft.sleepBedtimeLatest, clearable: false, ariaLabel: 'שעת שינה מקסימלית', onChange: (v) => { draft.sleepBedtimeLatest = v; } });
  mountTimeField(el.querySelector('[data-s-wake]'), { value: draft.sleepWakeTime, clearable: false, ariaLabel: 'שעת קימה רגילה', onChange: (v) => { draft.sleepWakeTime = v; } });
  mountNumericField(el.querySelector('[data-s-min]'), { value: draft.sleepMinHours, unitLabel: 'שעות', ariaLabel: 'מינימום שעות שינה', onCommit: (v) => { draft.sleepMinHours = v; } });
  const flexEl = el.querySelector('[data-s-flex]');
  flexEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-flex]');
    if (!btn) return;
    const day = Number(btn.dataset.flex);
    const set = new Set(draft.sleepFlexibleNights);
    if (set.has(day)) set.delete(day); else set.add(day);
    draft.sleepFlexibleNights = [...set].sort();
    flexEl.innerHTML = flexPills();
  });
}

// The patch to save from a draft, or null while the minimum is missing.
export function sleepPatch(draft) {
  if (!draft.sleepMinHours) return null;
  return Object.fromEntries(SLEEP_FIELDS.map((k) => [k, draft[k]]));
}
