import { openBottomSheet } from './bottom-sheet.js';
import { confirmDialog } from './confirm-dialog.js';
import { icon } from './icon.js';
import { esc } from '../core/dom.js';
import { renameExerciseEverywhere, deleteExerciseFromLibrary, CATEGORY_GROUPS } from '../lib/firestore.js';

// Rename/category/delete editor for one exercise, shared by the Active
// Session and Dashboard pickers — they both list the same exercises, so
// there's exactly one editor rather than two copies drifting apart.
//
// `entry` is { id, name, category } — `id` may be null for an exercise that
// only exists in past workout history and was never added to the library
// (a real gap this app's own data had); rename still works by matching the
// name across workouts, it just has no library doc to update. Delete is
// hidden in that case, since there's nothing in the library to remove.
//
// `onSaved({ renamed | deleted, ... })` lets the caller refresh its own list.
export function openExerciseEditSheet(entry, { onSaved } = {}) {
  const allCategories = CATEGORY_GROUPS.flatMap((g) => g.categories);

  openBottomSheet({
    ariaLabel: `עריכת ${entry.name}`,
    render(body, sheetApi) {
      let selectedCategory = entry.category || '';

      body.innerHTML = `
        <h3 style="margin:0 0 14px; color:var(--text);">עריכת תרגיל</h3>

        <div class="sheet-field-label">שם התרגיל</div>
        <input type="text" id="edit-name-input" class="search-bar" value="${esc(entry.name)}" style="margin-bottom:14px;">

        <div class="sheet-field-label">קטגוריה</div>
        <div class="pill-row" id="edit-category-pills" style="margin-bottom:10px;">
          ${allCategories.map((c) => `<button type="button" class="pill ${c === selectedCategory ? 'active' : ''}" data-category="${esc(c)}">${esc(c)}</button>`).join('')}
        </div>

        ${!entry.id ? '<p class="text-muted" style="font-size:var(--text-sm); margin:0 0 10px;">התרגיל הזה לא נמצא בבנק התרגילים — שינוי השם עדיין יתעדכן בכל האימונים שכבר נרשמו.</p>' : ''}

        <div class="sheet-actions">
          ${entry.id ? `<button type="button" class="btn btn-danger" id="edit-delete-btn">${icon('trash-2', { className: 'icon--sm' })} מחיקה מהבנק</button>` : ''}
        </div>
        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary" id="edit-cancel-btn">ביטול</button>
          <button type="button" class="btn btn-primary" id="edit-save-btn">שמירה</button>
        </div>
      `;

      body.querySelectorAll('[data-category]').forEach((btn) => {
        btn.addEventListener('click', () => {
          selectedCategory = btn.dataset.category;
          body.querySelectorAll('[data-category]').forEach((b) => b.classList.toggle('active', b === btn));
        });
      });

      body.querySelector('#edit-cancel-btn').addEventListener('click', () => sheetApi.close());

      body.querySelector('#edit-save-btn').addEventListener('click', async () => {
        const newName = body.querySelector('#edit-name-input').value.trim();
        if (!newName) return;
        const saveBtn = body.querySelector('#edit-save-btn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'שומר...';
        try {
          await renameExerciseEverywhere(entry.id, entry.name, newName, selectedCategory);
          onSaved?.({ renamed: true, oldName: entry.name, newName, newCategory: selectedCategory });
        } finally {
          sheetApi.close();
        }
      });

      const deleteBtn = body.querySelector('#edit-delete-btn');
      deleteBtn?.addEventListener('click', async () => {
        const confirmed = await confirmDialog({
          title: 'מחיקת תרגיל מהבנק',
          message: `למחוק את "${entry.name}" מבנק התרגילים? אימונים שכבר נרשמו לא יימחקו ולא ישתנו.`,
          confirmLabel: 'מחיקה',
          danger: true,
        });
        if (!confirmed) return;
        await deleteExerciseFromLibrary(entry.id);
        onSaved?.({ deleted: true, name: entry.name });
        sheetApi.close();
      });
    },
  });
}
