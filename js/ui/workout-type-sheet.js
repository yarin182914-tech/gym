// "סוג משלך": build a workout type from the field palette (e.g. "TRX" with
// rounds and a level), or edit/delete one built before. Saved to
// users/{uid}/workoutTypes (js/lib/firestore.js). Time, effort, heart rate,
// place and notes come with every type, so they aren't offered here.
//
// `type` is a workoutTypes doc ({ id, name, fields }) to edit, or null for
// a new one. onSaved(doc) gets the saved doc; onDeleted(id) after a delete.

import { openBottomSheet } from './bottom-sheet.js';
import { confirmDialog } from './confirm-dialog.js';
import { icon } from './icon.js';
import { esc } from '../core/dom.js';
import { showToast } from './toast.js';
import { FIELD_KINDS, FIELD_PALETTE } from '../lib/workout-types.js';
import { addWorkoutType, updateWorkoutType, deleteWorkoutType } from '../lib/firestore.js';

const MAX_FIELDS = 8;

export function openWorkoutTypeSheet(type = null, { onSaved, onDeleted, order = 0 } = {}) {
  const draft = {
    name: type?.name || '',
    fields: JSON.parse(JSON.stringify(type?.fields || [])).map((f) => ({
      ...f,
      optionsText: (f.options || []).join(', '),
    })),
  };
  let nextFieldId = draft.fields.reduce((n, f) => Math.max(n, Number(String(f.id).replace(/\D/g, '')) || 0), 0) + 1;

  openBottomSheet({
    ariaLabel: type ? `עריכת ${type.name}` : 'סוג אימון חדש',
    render(body, sheetApi) {
      function draw() {
        body.innerHTML = `
          <h3 style="margin:0 0 4px; color:var(--text);">${type ? 'עריכת סוג אימון' : 'סוג אימון משלך'}</h3>
          <p class="text-muted" style="font-size:0.8rem; margin:0;">משך, מאמץ, דופק, מקום והערות יש בכל סוג.</p>

          <div class="sheet-field-label">שם</div>
          <input type="text" class="search-bar" data-wt-name value="${esc(draft.name)}" placeholder="למשל TRX">

          <div class="sheet-field-label">שדות</div>
          <div class="wt-fields">
            ${draft.fields.length === 0 ? '<p class="text-muted" style="margin:0; font-size:0.85rem;">עוד אין שדות — בחרו מהרשימה למטה.</p>' : ''}
            ${draft.fields.map((f, i) => `
              <div class="wt-field" data-wt-field="${i}">
                <div class="wt-field-row">
                  <input type="text" class="search-bar" data-wt-label value="${esc(f.label)}" aria-label="שם השדה">
                  <span class="wt-field-kind text-muted">${esc(FIELD_KINDS[f.kind]?.label || '')}</span>
                  <button type="button" class="set-more-btn set-more-btn--danger" data-wt-remove aria-label="הסרת השדה">${icon('x', { className: 'icon--sm' })}</button>
                </div>
                ${f.kind === 'picklist' ? `<input type="text" class="search-bar" data-wt-options value="${esc(f.optionsText)}" placeholder="אפשרויות, מופרדות בפסיקים">` : ''}
              </div>`).join('')}
          </div>

          ${draft.fields.length < MAX_FIELDS ? `
          <div class="pill-row-label" style="margin-top:12px;">הוספת שדה</div>
          <div class="pill-row">
            ${FIELD_PALETTE.map((k) => `<button type="button" class="pill" data-wt-add="${k}">+ ${esc(FIELD_KINDS[k].label)}</button>`).join('')}
          </div>` : ''}

          ${type ? `<div class="sheet-actions"><button type="button" class="btn btn-danger" data-wt-delete>${icon('trash-2', { className: 'icon--sm' })} מחיקת הסוג</button></div>` : ''}
          <div class="sheet-actions">
            <button type="button" class="btn btn-secondary" data-wt-cancel>ביטול</button>
            <button type="button" class="btn btn-primary" data-wt-save>שמירה</button>
          </div>`;

        body.querySelector('[data-wt-name]').addEventListener('input', (e) => { draft.name = e.target.value; });
        body.querySelectorAll('[data-wt-field]').forEach((row) => {
          const f = draft.fields[Number(row.dataset.wtField)];
          row.querySelector('[data-wt-label]').addEventListener('input', (e) => { f.label = e.target.value; });
          row.querySelector('[data-wt-options]')?.addEventListener('input', (e) => { f.optionsText = e.target.value; });
          row.querySelector('[data-wt-remove]').addEventListener('click', () => {
            draft.fields.splice(draft.fields.indexOf(f), 1);
            draw();
          });
        });
        body.querySelectorAll('[data-wt-add]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const kind = btn.dataset.wtAdd;
            draft.fields.push({ id: `f${nextFieldId++}`, kind, label: FIELD_KINDS[kind].label, optionsText: '' });
            draw();
          });
        });
        body.querySelector('[data-wt-cancel]').addEventListener('click', () => sheetApi.close());
        body.querySelector('[data-wt-save]').addEventListener('click', save);
        body.querySelector('[data-wt-delete]')?.addEventListener('click', remove);
      }

      async function save() {
        const name = draft.name.trim();
        if (!name) {
          showToast('צריך שם לסוג האימון');
          return;
        }
        const fields = draft.fields.map((f) => {
          const out = { id: f.id, kind: f.kind, label: f.label.trim() || FIELD_KINDS[f.kind].label };
          if (f.kind === 'picklist') out.options = f.optionsText.split(',').map((o) => o.trim()).filter(Boolean);
          return out;
        });
        if (fields.some((f) => f.kind === 'picklist' && f.options.length === 0)) {
          showToast('לרשימת בחירה צריך לפחות אפשרות אחת');
          return;
        }
        const saveBtn = body.querySelector('[data-wt-save]');
        saveBtn.disabled = true;
        try {
          if (type) {
            await updateWorkoutType(type.id, { name, fields });
            onSaved?.({ ...type, name, fields });
          } else {
            const id = await addWorkoutType({ name, fields, order });
            onSaved?.({ id, name, fields, order });
          }
          sheetApi.close();
        } catch (err) {
          console.error('[workout-types] save failed', err);
          showToast('השמירה נכשלה — נסה שוב');
          saveBtn.disabled = false;
        }
      }

      async function remove() {
        const confirmed = await confirmDialog({
          title: 'מחיקת סוג אימון',
          message: `למחוק את "${type.name}"? אימונים שכבר נרשמו יישארו כמו שהם.`,
          confirmLabel: 'מחיקה',
          danger: true,
        });
        if (!confirmed) return;
        try {
          await deleteWorkoutType(type.id);
        } catch (err) {
          console.error('[workout-types] delete failed', err);
          showToast('המחיקה נכשלה — נסה שוב');
          return;
        }
        onDeleted?.(type.id);
        sheetApi.close();
      }

      draw();
    },
  });
}
