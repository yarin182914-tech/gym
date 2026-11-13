// A decided decision ("החלטתי") in a bottom sheet: fix its question, the
// choice, why and how it felt, or delete it. When it was decided stays as
// it was, and points already earned stay (they never go down). Saving and
// deleting are the caller's: onSave(id, patch), onDelete(id).

import { openBottomSheet } from './bottom-sheet.js';
import { confirmDialog } from './confirm-dialog.js';
import { esc } from '../core/dom.js';
import { FEELINGS } from '../lib/decisions.js';

const pill = (attr, value, label, active) =>
  `<button type="button" class="pill${active ? ' active' : ''}" ${attr}="${esc(value)}" aria-pressed="${active}">${label}</button>`;

export function openDecisionEditSheet({ decision: d, onSave, onDelete }) {
  const draft = { question: d.question, choiceId: d.choiceId, reason: d.reason, feeling: d.feeling };
  const options = d.options.filter((o) => o.text.trim());

  openBottomSheet({
    ariaLabel: 'עריכת החלטה',
    render(body, sheet) {
      function render() {
        body.innerHTML = `
          <h3 class="decision-title">עריכת החלטה</h3>
          <label class="decision-field-label" for="de-question">השאלה</label>
          <input type="text" id="de-question" class="search-bar decision-input" data-e-question maxlength="120" value="${esc(draft.question)}">
          ${options.length ? `
            <div class="decision-field-label">מה בחרתי</div>
            <div class="pill-row">${options.map((o) => pill('data-e-choice', o.id, esc(o.text), draft.choiceId === o.id)).join('')}</div>` : ''}
          <label class="decision-field-label" for="de-reason">למה</label>
          <input type="text" id="de-reason" class="search-bar decision-input" data-e-reason maxlength="200" placeholder="משפט אחד" value="${esc(draft.reason)}">
          <div class="decision-field-label">איך זה הרגיש</div>
          <div class="pill-row">${Object.entries(FEELINGS).map(([k, l]) => pill('data-e-feel', k, l, draft.feeling === k)).join('')}</div>
          <div class="sheet-actions">
            <button type="button" class="btn btn-secondary" data-e-delete>למחוק</button>
            <button type="button" class="btn btn-primary" data-e-save>לשמור</button>
          </div>`;
      }

      body.addEventListener('input', (e) => {
        if (e.target.matches('[data-e-question]')) draft.question = e.target.value;
        else if (e.target.matches('[data-e-reason]')) draft.reason = e.target.value;
      });

      body.addEventListener('click', async (e) => {
        const el = e.target.closest('button');
        if (!el || !body.contains(el)) return;
        const a = el.dataset;
        if (a.eChoice) {
          draft.choiceId = a.eChoice;
          return render();
        }
        if (a.eFeel) {
          draft.feeling = draft.feeling === a.eFeel ? null : a.eFeel;
          return render();
        }
        if (a.eSave !== undefined) {
          if (!draft.question.trim()) return body.querySelector('[data-e-question]').focus();
          onSave(d.id, { ...draft, question: draft.question.trim(), reason: draft.reason.trim() });
          return sheet.close();
        }
        if (a.eDelete !== undefined) {
          const ok = await confirmDialog({
            title: 'למחוק את ההחלטה?',
            message: 'היא תימחק מהיומן. הנקודות שקיבלת עליה נשארות.',
            confirmLabel: 'למחוק',
          });
          if (!ok) return;
          onDelete(d.id);
          sheet.close();
        }
      });

      render();
    },
  });
}
