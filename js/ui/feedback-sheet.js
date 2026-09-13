// Add/edit form for one site-feedback item — a bottom sheet, same shell as
// every other quick-entry flow in this app (js/ui/bottom-sheet.js). Shared
// by two callers that must stay identical: the dedicated Feedback page's
// own "+" button, and the site-wide floating button (feedback-fab.js) that
// opens it from wherever the user happens to be. One form, one save path.

import { esc } from '../core/dom.js';
import { openBottomSheet } from './bottom-sheet.js';
import { showToast } from './toast.js';
import { createFeedback, updateFeedback } from '../lib/firestore.js';
import { auth } from '../firebase-config.js';

// Stable id (never shown to users as text elsewhere) + display label, same
// shape as SET_TYPES in lib/format.js — a future reader (human or Claude)
// can rely on the id staying constant even if the Hebrew label is reworded.
export const FEEDBACK_CATEGORIES = [
  { id: 'bug', label: 'באג' },
  { id: 'ux', label: 'חוויית משתמש' },
  { id: 'ui', label: 'עיצוב' },
  { id: 'feature', label: 'פיצ׳ר חדש' },
  { id: 'suggestion', label: 'הצעה' },
  { id: 'other', label: 'אחר' },
];

export function categoryLabel(id) {
  return FEEDBACK_CATEGORIES.find((c) => c.id === id)?.label || 'אחר';
}

// item: pass an existing feedback record to edit it in place; omit to
// create a new one. onSaved: called after a successful save (create or
// edit) so the caller can refresh its own list — this module has no
// opinion on where the item ends up displayed.
export function openFeedbackSheet({ item = null, onSaved } = {}) {
  const isEdit = !!item;

  openBottomSheet({
    ariaLabel: isEdit ? 'עריכת משוב' : 'משוב חדש על האתר',
    render(body, sheetApi) {
      const defaultAuthor = item ? (item.author || '') : (auth?.currentUser?.displayName || '');

      body.innerHTML = `
        <h3 style="margin:0 0 14px; color:var(--text);">${isEdit ? 'עריכת משוב' : 'משוב חדש על האתר'}</h3>

        <div class="sheet-field-label">מה שמת לב אליו?</div>
        <textarea data-role="fb-text" rows="4" class="search-bar" style="width:100%; resize:vertical;"
          placeholder="לדוגמה: כפתור סיום האימון לפעמים לא מגיב">${esc(item?.text || '')}</textarea>

        <div class="sheet-field-label">קטגוריה</div>
        <select data-role="fb-category" class="search-bar">
          ${FEEDBACK_CATEGORIES.map((c) => `<option value="${c.id}" ${(item?.category || 'other') === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
        </select>

        <div class="sheet-field-label">שם (אופציונלי)</div>
        <input type="text" data-role="fb-author" class="search-bar" value="${esc(defaultAuthor)}" placeholder="איך לקרוא לך?">

        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary" data-role="fb-cancel">ביטול</button>
          <button type="button" class="btn btn-primary" data-role="fb-submit">${isEdit ? 'שמירה' : 'שליחה'}</button>
        </div>
      `;

      const textEl = body.querySelector('[data-role="fb-text"]');
      const submitBtn = body.querySelector('[data-role="fb-submit"]');
      textEl.focus();

      body.querySelector('[data-role="fb-cancel"]').addEventListener('click', () => sheetApi.close());

      submitBtn.addEventListener('click', async () => {
        const text = textEl.value.trim();
        if (!text) { textEl.focus(); return; }
        const category = body.querySelector('[data-role="fb-category"]').value;
        const author = body.querySelector('[data-role="fb-author"]').value.trim();

        submitBtn.disabled = true;
        submitBtn.classList.add('btn--loading');
        try {
          if (isEdit) {
            await updateFeedback(item.id, { text, category, author });
          } else {
            await createFeedback({ text, category, author });
          }
          sheetApi.close();
          showToast(isEdit ? '✓ המשוב עודכן' : '✓ תודה, המשוב נשמר');
          onSaved?.();
        } catch (err) {
          console.error('feedback save failed', err);
          submitBtn.disabled = false;
          submitBtn.classList.remove('btn--loading');
          showToast('שגיאה בשמירת המשוב — נסה שוב');
        }
      });
    },
  });
}
