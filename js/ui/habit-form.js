// Add or edit one habit in a bottom sheet: name, icon, area, how often,
// what counts as done (full and short), and pause. The 6-question wizard
// with templates comes in M5; so does the routine ("רשימת צעדים") measure,
// which this form keeps untouched on a habit that already has it.

import { AREAS, AUTO_STEPS, normalizeHabit } from '../lib/habits.js';
import { openBottomSheet } from './bottom-sheet.js';
import { confirmDialog } from './confirm-dialog.js';
import { mountNumericField } from './numeric-input.js';
import { showToast } from './toast.js';
import { icon } from './icon.js';
import { esc } from '../core/dom.js';

export const WEEKDAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

// icon name → what a screen reader says for it.
const ICONS = {
  check: 'וי', 'book-open': 'ספר', footprints: 'צעדים', 'phone-off': 'בלי טלפון', droplet: 'מים', brain: 'מוח',
  heart: 'לב', languages: 'שפות', apple: 'תפוח', leaf: 'עלה', moon: 'ירח', sun: 'שמש', dumbbell: 'משקולת',
  pencil: 'עיפרון', sparkles: 'ניצוצות',
};
const UNITS = ['דקות', 'עמודים', 'פעמים', 'צעדים'];
const SCHEDULES = { daily: 'כל יום', weekly: 'פעמים בשבוע', days: 'ימים קבועים' };
const MEASURES = { yesno: 'כן / לא', quantity: 'כמות', limit: 'מגבלה' };
const MAX_VALUE = 100000;

// habit: an existing (normalized) habit, or null for a new one.
// onSave(fields) gets the habit's fields (no id/order); onDelete() only
// for an existing habit. Both run after the sheet has closed.
export function openHabitForm({ habit = null, onSave, onDelete }) {
  const d = normalizeHabit(habit || { name: '', measure: 'yesno', unit: 'דקות', full: null, short: null });
  const draft = {
    name: habit ? d.name : '',
    icon: d.icon,
    area: d.area,
    schedule: d.schedule,
    measure: d.measure,
    unit: d.unit || 'דקות',
    full: d.full,
    short: d.short,
    autoSource: d.autoSource,
    active: d.active,
  };
  const perWeek = () => (draft.schedule.type === 'weekly' ? draft.schedule.perWeek : 3);
  const days = () => (draft.schedule.type === 'days' ? draft.schedule.days : []);

  openBottomSheet({
    ariaLabel: habit ? 'עריכת הרגל' : 'הרגל חדש',
    render(body, sheetApi) {
      const pill = (attr, value, label, active) => `<button type="button" class="pill${active ? ' active' : ''}" ${attr}="${value}" aria-pressed="${active}">${label}</button>`;

      function paint() {
        const fullLabel = { quantity: 'מלא (היעד)', limit: 'מלא: עד' }[draft.measure] || 'מלא';
        const shortLabel = { quantity: 'מקוצר (המינימום)', limit: 'מקוצר: עד' }[draft.measure] || 'מקוצר';
        body.innerHTML = `
          <h3 style="margin:0 0 4px; color:var(--text);">${habit ? 'עריכת הרגל' : 'הרגל חדש'}</h3>
          <input type="text" class="search-bar" data-h-name placeholder="שם ההרגל" value="${esc(draft.name)}" maxlength="40" style="margin-top:10px;">

          <div class="sheet-field-label">אייקון</div>
          <div class="pill-row habit-icon-row">${Object.entries(ICONS).map(([name, label]) => `
            <button type="button" class="pill habit-icon-pill${draft.icon === name ? ' active' : ''}" data-h-icon="${name}" aria-pressed="${draft.icon === name}" aria-label="${label}">${icon(name, { className: 'icon--sm' })}</button>`).join('')}
          </div>

          <div class="sheet-field-label">תחום</div>
          <div class="pill-row">${Object.entries(AREAS).map(([k, label]) => pill('data-h-area', k, label, draft.area === k)).join('')}</div>

          <div class="sheet-field-label">כל כמה זמן</div>
          <div class="pill-row">${Object.entries(SCHEDULES).map(([k, label]) => pill('data-h-sched', k, label, draft.schedule.type === k)).join('')}</div>
          ${draft.schedule.type === 'weekly' ? `
            <div class="pill-row">${[1, 2, 3, 4, 5, 6].map((n) => pill('data-h-per', n, `${n}×`, perWeek() === n)).join('')}</div>` : ''}
          ${draft.schedule.type === 'days' ? `
            <div class="pill-row">${WEEKDAY_LETTERS.map((l, i) => pill('data-h-day', i, `${l}׳`, days().includes(i))).join('')}</div>` : ''}

          <div class="sheet-field-label">מה נחשב ביצוע</div>
          ${draft.measure === 'steps'
            ? '<p class="text-muted" style="margin:0; font-size:0.85rem;">רשימת צעדים — נערכת באשף ההרגלים (בקרוב).</p>'
            : `<div class="pill-row">${Object.entries(MEASURES).map(([k, label]) => pill('data-h-measure', k, label, draft.measure === k)).join('')}</div>
          <div class="pill-row">${UNITS.map((u) => pill('data-h-unit', u, u, draft.unit === u)).join('')}</div>
          <div class="sleep-clocks">
            <div><div class="sheet-field-label">${fullLabel}</div><div data-h-full></div></div>
            <div><div class="sheet-field-label">${shortLabel}</div><div data-h-short></div></div>
          </div>
          ${draft.measure === 'yesno' ? '<p class="text-muted habit-form-hint">בכן/לא המספרים רק מתארים. בלי "מקוצר" — לחיצה אחת מסמנת.</p>' : ''}
          ${draft.measure === 'quantity' && draft.unit === 'צעדים' ? `
            <div class="pill-row" style="margin-top:10px;">${pill('data-h-auto', '1', 'נספר אוטומטית מהצעדים היומיים', draft.autoSource === AUTO_STEPS)}</div>` : ''}`}

          <div class="pill-row" style="margin-top:14px;">${pill('data-h-paused', '1', 'מושהה', !draft.active)}</div>

          <div class="sheet-actions">
            ${habit ? '<button type="button" class="btn btn-danger" data-h-delete>מחיקה</button>' : ''}
            <button type="button" class="btn btn-secondary" data-h-cancel>ביטול</button>
            <button type="button" class="btn btn-primary" data-h-save>שמירה</button>
          </div>`;

        body.querySelector('[data-h-name]').addEventListener('input', (e) => { draft.name = e.target.value; });
        const fullHost = body.querySelector('[data-h-full]');
        if (fullHost) {
          mountNumericField(fullHost, { value: draft.full, unitLabel: draft.unit, ariaLabel: 'יעד מלא', nullable: true, max: MAX_VALUE, onCommit: (v) => { draft.full = v; } });
          mountNumericField(body.querySelector('[data-h-short]'), { value: draft.short, unitLabel: draft.unit, ariaLabel: 'יעד מקוצר', nullable: true, max: MAX_VALUE, onCommit: (v) => { draft.short = v; } });
        }
        body.querySelector('[data-h-cancel]').addEventListener('click', () => sheetApi.close());
        body.querySelector('[data-h-save]').addEventListener('click', () => save(sheetApi));
        body.querySelector('[data-h-delete]')?.addEventListener('click', async () => {
          const ok = await confirmDialog({
            title: 'למחוק את ההרגל?',
            message: `${esc(habit.name)} — הוא ייעלם מהמסך. אפשר גם להשהות במקום.`,
            confirmLabel: 'מחיקה',
            danger: true,
          });
          if (!ok) return;
          sheetApi.close();
          onDelete?.();
        });
      }

      // One delegated listener for every pill, so paint() can redraw freely.
      body.addEventListener('click', (e) => {
        const btn = e.target.closest('.pill');
        if (!btn) return;
        const { hIcon, hArea, hSched, hPer, hDay, hMeasure, hUnit, hAuto, hPaused } = btn.dataset;
        if (hIcon) draft.icon = hIcon;
        else if (hArea) draft.area = hArea;
        else if (hSched === 'daily') draft.schedule = { type: 'daily' };
        else if (hSched === 'weekly') draft.schedule = { type: 'weekly', perWeek: perWeek() };
        else if (hSched === 'days') draft.schedule = { type: 'days', days: days().length ? days() : [new Date().getDay()] };
        else if (hPer) draft.schedule = { type: 'weekly', perWeek: Number(hPer) };
        else if (hDay !== undefined) {
          const set = new Set(days());
          const day = Number(hDay);
          if (set.has(day)) set.delete(day); else set.add(day);
          draft.schedule = { type: 'days', days: [...set].sort() };
        } else if (hMeasure) draft.measure = hMeasure;
        else if (hUnit) draft.unit = hUnit;
        else if (hAuto) draft.autoSource = draft.autoSource ? null : AUTO_STEPS;
        else if (hPaused) draft.active = !draft.active;
        else return;
        paint();
      });

      paint();
    },
  });

  function save(sheetApi) {
    const name = draft.name.trim();
    if (!name) return showToast('צריך שם להרגל');
    if (draft.schedule.type === 'days' && !draft.schedule.days.length) return showToast('בחרו לפחות יום אחד');
    const counts = draft.measure === 'quantity' || draft.measure === 'limit';
    if (counts && draft.full === null) return showToast('צריך יעד "מלא"');
    if (counts && draft.short !== null) {
      if (draft.measure === 'quantity' && draft.short >= draft.full) return showToast('"מקוצר" צריך להיות פחות מ"מלא"');
      if (draft.measure === 'limit' && draft.short <= draft.full) return showToast('במגבלה, "מקוצר" מרשה יותר מ"מלא"');
    }
    const fields = {
      name,
      icon: draft.icon,
      area: draft.area,
      schedule: draft.schedule,
      measure: draft.measure,
      unit: draft.unit,
      full: draft.full,
      short: draft.short,
      autoSource: draft.measure === 'quantity' && draft.unit === 'צעדים' ? draft.autoSource : null,
      active: draft.active,
    };
    sheetApi.close();
    onSave(fields);
  }
}
