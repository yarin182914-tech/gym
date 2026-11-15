// Send or fix one feedback item — a bottom sheet, opened from the feedback
// page and from "שליחת משוב" in the profile sheet (app-bar.js), so it can
// be reached from any screen. One form, one save path.
//
// M15a: text + a type picked from small buttons; the name comes from the
// Google account (only the admin sees it). Editing changes text and type
// only — firestore.rules lets the author do nothing else, and only while
// the item is still new.

import { esc } from '../core/dom.js';
import { openBottomSheet } from './bottom-sheet.js';
import { showToast } from './toast.js';
import { icon } from './icon.js';
import { createFeedback, updateFeedback } from '../lib/firestore.js';
import { FEEDBACK_CATEGORIES } from '../lib/feedback.js';
import { FEEDBACK } from '../lib/rules.js';
import { auth } from '../firebase-config.js';

export { FEEDBACK_CATEGORIES };

export const FEEDBACK_SAVED_EVENT = 'gym-feedback-saved';

function typeChips(active) {
  return FEEDBACK_CATEGORIES.map((c) => `
    <button type="button" class="pill${c.id === active ? ' active' : ''}" data-fb-type="${c.id}" aria-pressed="${c.id === active}">${esc(c.label)}</button>`).join('');
}

// item: an existing item to fix; omit to send a new one. onSaved: called
// after a successful save. Every save also fires FEEDBACK_SAVED_EVENT on
// window, so the feedback page refreshes whichever button opened the form
// (its own, or the + sheet's "משוב").
export function openFeedbackSheet({ item = null, onSaved } = {}) {
  const isEdit = !!item;
  // An old item may carry a type the form no longer offers ('suggestion'):
  // it shows as "רעיון", and stays as it is unless another type is picked.
  let category = item?.category || 'other';
  const shown = category === 'suggestion' ? 'feature' : category;

  openBottomSheet({
    ariaLabel: isEdit ? 'תיקון משוב' : 'משוב על ג׳יני',
    render(body, sheetApi) {
      body.innerHTML = `
        <h3 class="feedback-sheet-title">${isEdit ? 'תיקון משוב' : 'משוב על ג׳יני'}</h3>

        <label class="sheet-field-label" for="fb-text">מה שמת לב אליו?</label>
        <textarea id="fb-text" data-role="fb-text" rows="4" class="search-bar feedback-text"
          maxlength="${FEEDBACK.textMax}"
          placeholder="לדוגמה: כפתור סיום האימון לפעמים לא מגיב">${esc(item?.text || '')}</textarea>

        <div class="sheet-field-label" id="fb-type-label">סוג</div>
        <div class="feedback-types" role="group" aria-labelledby="fb-type-label">${typeChips(shown)}</div>

        <p class="feedback-private">${icon('lock', { className: 'icon--sm' })} רק המפתח של ג׳יני רואה את זה.</p>

        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary" data-role="fb-cancel">ביטול</button>
          <button type="button" class="btn btn-primary" data-role="fb-submit">${isEdit ? 'שמירה' : 'שליחה'}</button>
        </div>
      `;

      const textEl = body.querySelector('[data-role="fb-text"]');
      const submitBtn = body.querySelector('[data-role="fb-submit"]');
      textEl.focus();

      body.querySelectorAll('[data-fb-type]').forEach((btn) => {
        btn.addEventListener('click', () => {
          category = btn.dataset.fbType;
          body.querySelectorAll('[data-fb-type]').forEach((b) => {
            const on = b === btn;
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', String(on));
          });
        });
      });

      body.querySelector('[data-role="fb-cancel"]').addEventListener('click', () => sheetApi.close());

      submitBtn.addEventListener('click', async () => {
        const text = textEl.value.trim();
        if (!text) { textEl.focus(); return; }

        submitBtn.disabled = true;
        submitBtn.classList.add('btn--loading');
        try {
          if (isEdit) {
            await updateFeedback(item.id, { text, category });
          } else {
            const author = auth?.currentUser?.displayName || '';
            await createFeedback({ text, category, author });
          }
          sheetApi.close();
          showToast(isEdit
            ? `${icon('check', { className: 'icon--sm' })} המשוב עודכן`
            : `${icon('heart', { className: 'icon--sm' })} תודה ששלחת! זה עוזר לשפר את ג׳יני`);
          window.dispatchEvent(new Event(FEEDBACK_SAVED_EVENT));
          onSaved?.();
        } catch (err) {
          console.error('feedback save failed', err);
          submitBtn.disabled = false;
          submitBtn.classList.remove('btn--loading');
          showToast('לא נשמר, נסו שוב');
        }
      });
    },
  });
}
