// The task form (M6) in a bottom sheet: add or edit one task. Also the
// one-line quick capture the + button opens ("רישום מהיר → משימה"), which
// drops a line into the inbox for the evening check to fill in.
//
// The sheet only builds the data; saving is the caller's (onSave gets
// { id, data, isNew }) so the screen can show it at once.

import { openBottomSheet } from './bottom-sheet.js';
import { mountDateField, mountTimeField } from './date-time-picker.js';
import { confirmDialog } from './confirm-dialog.js';
import { icon } from './icon.js';
import { esc } from '../core/dom.js';
import { dateKey } from '../lib/sleep.js';
import { toDate } from '../lib/format.js';
import {
  AREAS, OWNERS, SIZES, SIZE_HINTS, TYPES, TIMINGS, normalizeTask, noonOf, atTime, weekOf, importantOn,
  scheduledKey, dueKey,
} from '../lib/tasks.js';
import { TASKS } from '../lib/rules.js';

const FAR = '2099-12-31';
const WEEKDAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const pad = (n) => String(n).padStart(2, '0');

function pill(attr, value, label, active) {
  return `<button type="button" class="pill${active ? ' active' : ''}" ${attr}="${esc(value)}" aria-pressed="${active}">${label}</button>`;
}

// One line → the inbox. onSave({ title }), or onMore(title) for the full form.
export function openQuickTask({ onSave, onMore }) {
  openBottomSheet({
    ariaLabel: 'משימה חדשה',
    render(body, sheet) {
      body.innerHTML = `
        <h3 style="margin:0 0 6px; color:var(--text);">משימה חדשה</h3>
        <p class="text-muted" style="font-size:var(--text-sm); margin:0 0 10px;">שורה אחת בחופשיות. קלוד ימלא את הפרטים בבדיקת הערב.</p>
        <input type="text" class="search-bar" data-quick-title maxlength="120" placeholder="למשל: לתקן את הקרש עד שישי">
        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary" data-quick-more>עוד פרטים</button>
          <button type="button" class="btn btn-primary" data-quick-save>לתיבה</button>
        </div>`;
      const input = body.querySelector('[data-quick-title]');
      const title = () => input.value.trim();
      body.querySelector('[data-quick-save]').addEventListener('click', () => {
        if (!title()) return input.focus();
        sheet.close();
        onSave({ title: title() });
      });
      body.querySelector('[data-quick-more]').addEventListener('click', () => {
        sheet.close();
        onMore(title());
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') body.querySelector('[data-quick-save]').click();
      });
    },
  });
}

// task: the stored task to edit, or null for a new one (prefill: fields to
// start a new one with). tasks: every task, for the important-a-day limit.
export function openTaskSheet({ task = null, prefill = {}, tasks = [], newId, onSave, onDelete }) {
  const isNew = !task;
  const today = dateKey(new Date());
  const base = normalizeTask(task || { ...prefill, timing: prefill.timing ?? 'claude' });
  const at = base.scheduledAt ? toDate(base.scheduledAt) : null;
  const draft = {
    ...base,
    title: String(task?.title ?? prefill.title ?? ''),
    date: scheduledKey(base) || today,
    time: at && base.timing === 'exact' ? `${pad(at.getHours())}:${pad(at.getMinutes())}` : '',
    due: dueKey(base),
    // Inbox and someday move to open once the form saves them, unless kept.
    status: base.status === 'inbox' ? 'open' : base.status,
  };

  openBottomSheet({
    ariaLabel: isNew ? 'משימה חדשה' : 'עריכת משימה',
    render(body, sheet) {
      function render() {
        const once = draft.type === 'once';
        const dayFor = once && (draft.timing === 'exact' || draft.timing === 'day') ? draft.date : once && draft.timing === 'week' ? null : today;
        const busy = draft.important && dayFor ? importantOn(tasks, dayFor, base.id) >= TASKS.maxImportantPerDay : false;
        body.innerHTML = `
          <h3 style="margin:0 0 10px; color:var(--text);">${isNew ? 'משימה חדשה' : 'עריכת משימה'}</h3>
          <input type="text" class="search-bar" data-t-title maxlength="120" placeholder="מה צריך לעשות?" value="${esc(draft.title)}">

          <div class="sheet-field-label">סוג</div>
          <div class="pill-row">${Object.entries(TYPES).map(([k, l]) => pill('data-t-type', k, l, draft.type === k)).join('')}</div>
          ${draft.type === 'daily' ? `<div class="pill-row">${WEEKDAY_LETTERS.map((l, i) => pill('data-t-day', i, `${l}׳`, draft.recurrence.days.includes(i))).join('')}</div>` : ''}
          ${draft.type === 'recurring' ? `
            <div class="pill-row">${pill('data-t-every', 'week', 'כל שבוע', draft.recurrence.every === 'week')}${pill('data-t-every', 'month', 'כל חודש', draft.recurrence.every === 'month')}</div>
            ${draft.recurrence.every === 'week'
              ? `<div class="pill-row">${WEEKDAY_LETTERS.map((l, i) => pill('data-t-wday', i, `${l}׳`, draft.recurrence.day === i)).join('')}</div>`
              : `<label class="task-month-day">ביום <select class="search-bar" data-t-mday>${Array.from({ length: TASKS.maxMonthDay }, (_, i) => i + 1).map((d) => `<option value="${d}"${draft.recurrence.day === d ? ' selected' : ''}>${d}</option>`).join('')}</select> בחודש</label>`}` : ''}

          <div class="sheet-field-label">גודל</div>
          <div class="pill-row">${Object.entries(SIZES).map(([k, l]) => pill('data-t-size', k, `${l} <span class="task-pill-hint">${SIZE_HINTS[k]}</span>`, draft.complexity === k)).join('')}</div>

          <div class="pill-row" style="margin-top:10px;">
            ${pill('data-t-flag', 'important', `${icon('sparkles', { className: 'icon--sm' })} חשובה`, draft.important)}
            ${pill('data-t-flag', 'urgent', `${icon('flame', { className: 'icon--sm' })} דחופה`, draft.urgent)}
          </div>
          ${busy ? `<p class="task-note">כבר יש ${TASKS.maxImportantPerDay} משימות חשובות ביום הזה. אולי יום אחר?</p>` : ''}

          ${once ? `
            <div class="sheet-field-label">מתי</div>
            <div class="pill-row">${Object.entries(TIMINGS).map(([k, l]) => pill('data-t-timing', k, l, draft.timing === k)).join('')}</div>
            ${draft.timing === 'exact' || draft.timing === 'day' ? '<div class="task-when-row"><div data-t-date></div><div data-t-time></div></div>' : ''}
            ${draft.timing === 'claude' ? '<p class="task-note">נכנסת לתור "מחכה לשיבוץ". קלוד יציע לה זמן בבדיקת הערב.</p>' : ''}

            <div class="sheet-field-label">תאריך יעד</div>
            <div class="task-when-row">
              ${pill('data-t-due-toggle', 'x', draft.due ? 'יש' : 'בלי', !!draft.due)}
              ${draft.due ? '<div data-t-due></div>' : ''}
            </div>` : ''}

          <div class="sheet-field-label">תחום</div>
          <div class="pill-row">${Object.entries(AREAS).map(([k, l]) => pill('data-t-area', k, l, draft.area === k)).join('')}</div>
          <div class="sheet-field-label">מי</div>
          <div class="pill-row">${Object.entries(OWNERS).map(([k, l]) => pill('data-t-owner', k, l, draft.owner === k)).join('')}</div>

          <div class="sheet-field-label">צעד ראשון — 5 הדקות הראשונות</div>
          <input type="text" class="search-bar" data-t-step maxlength="120" placeholder="למשל: למצוא את הברגים במגירה" value="${esc(draft.firstStep)}">

          <div class="sheet-actions">
            ${isNew ? '' : `<button type="button" class="btn btn-secondary" data-t-someday>${draft.status === 'someday' ? 'להחזיר לרשימה' : 'למתישהו'}</button>`}
            <button type="button" class="btn btn-primary" data-t-save>שמירה</button>
          </div>
          ${isNew ? '' : `<button type="button" class="btn-link task-delete" data-t-delete>${icon('trash-2', { className: 'icon--sm' })} מחיקת המשימה</button>`}`;

        const dateHost = body.querySelector('[data-t-date]');
        if (dateHost) {
          mountDateField(dateHost, { value: draft.date, max: FAR, compact: true, onChange: (v) => { draft.date = v; render(); } });
        }
        const timeHost = body.querySelector('[data-t-time]');
        if (timeHost && draft.timing === 'exact') {
          mountTimeField(timeHost, { value: draft.time, clearable: false, onChange: (v) => { draft.time = v; } });
        } else if (timeHost) timeHost.remove();
        const dueHost = body.querySelector('[data-t-due]');
        if (dueHost) mountDateField(dueHost, { value: draft.due, max: FAR, compact: true, onChange: (v) => { draft.due = v; } });
      }

      body.addEventListener('input', (e) => {
        if (e.target.matches('[data-t-title]')) draft.title = e.target.value;
        if (e.target.matches('[data-t-step]')) draft.firstStep = e.target.value;
      });
      body.addEventListener('change', (e) => {
        if (e.target.matches('[data-t-mday]')) draft.recurrence = { every: 'month', day: Number(e.target.value) };
      });
      body.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const d = b.dataset;
        if (d.tType) {
          draft.type = d.tType;
          draft.recurrence = normalizeTask({ type: d.tType }).recurrence;
          if (draft.type === 'daily') draft.complexity = 'S';
        } else if (d.tDay !== undefined) {
          const n = Number(d.tDay);
          const days = draft.recurrence.days.includes(n) ? draft.recurrence.days.filter((x) => x !== n) : [...draft.recurrence.days, n];
          if (days.length) draft.recurrence = { days: days.sort() };
        } else if (d.tEvery) {
          draft.recurrence = { every: d.tEvery, day: d.tEvery === 'month' ? 1 : new Date().getDay() };
        } else if (d.tWday !== undefined) {
          draft.recurrence = { every: 'week', day: Number(d.tWday) };
        } else if (d.tSize) draft.complexity = d.tSize;
        else if (d.tFlag) draft[d.tFlag] = !draft[d.tFlag];
        else if (d.tTiming) {
          draft.timing = d.tTiming;
          if (draft.timing === 'exact' && !draft.time) draft.time = '18:00';
        } else if (d.tDueToggle) draft.due = draft.due ? null : today;
        else if (d.tArea) draft.area = draft.area === d.tArea ? null : d.tArea;
        else if (d.tOwner) draft.owner = d.tOwner;
        else if (d.tSomeday !== undefined) {
          draft.status = draft.status === 'someday' ? 'open' : 'someday';
          return save();
        } else if (d.tSave !== undefined) return save();
        else if (d.tDelete !== undefined) {
          const ok = await confirmDialog({ title: 'למחוק את המשימה?', message: 'הנקודות שכבר קיבלת עליה נשארות.', confirmLabel: 'מחיקה', danger: true });
          if (ok) {
            sheet.close();
            onDelete?.(base.id);
          }
          return;
        } else return;
        render();
      });

      function save() {
        const title = draft.title.trim();
        if (!title) {
          body.querySelector('[data-t-title]').focus();
          return;
        }
        const once = draft.type === 'once';
        let scheduledAt = null;
        if (once && draft.timing === 'exact') scheduledAt = atTime(draft.date, draft.time || '18:00');
        else if (once && draft.timing === 'day') scheduledAt = noonOf(draft.date);
        else if (once && draft.timing === 'week') scheduledAt = noonOf(weekOf(today));
        const moved = !isNew && once && base.scheduledAt && scheduledAt
          && toDate(base.scheduledAt).getTime() !== scheduledAt.getTime();
        const data = {
          title,
          type: draft.type,
          recurrence: draft.recurrence,
          area: draft.area,
          owner: draft.owner,
          complexity: draft.complexity,
          important: draft.important,
          urgent: draft.urgent,
          timing: once ? draft.timing : null,
          scheduledAt,
          dueDate: once && draft.due ? noonOf(draft.due) : null,
          status: draft.status,
          firstStep: draft.firstStep.trim(),
          postponeCount: base.postponeCount + (moved ? 1 : 0),
          ...(isNew ? {
            doneAt: null, doneDates: [], stuckReason: null, startedAt: null, calendarEventId: null,
            source: prefill.source || 'manual',
          } : {}),
        };
        sheet.close();
        onSave({ id: isNew ? newId() : base.id, data, isNew });
      }

      render();
    },
  });
}
