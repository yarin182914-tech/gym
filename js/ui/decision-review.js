// "איך זה יצא?" (M6e): a month after a medium decision, three after a
// large one (js/lib/decisions.js reviewDue). Shows what was decided and
// why, and takes one of three answers and a note. No answer is wrong; each
// is worth the same (DECISIONS.review). Saving is the caller's:
// onSave(id, patch).

import { openBottomSheet } from './bottom-sheet.js';
import { esc } from '../core/dom.js';
import { OUTCOMES, FEELINGS, choiceText } from '../lib/decisions.js';
import { DECISIONS } from '../lib/rules.js';

export function openReviewSheet({ decision: d, onSave }) {
  let outcome = d.outcome;
  let note = d.outcomeNote;

  openBottomSheet({
    ariaLabel: 'איך זה יצא?',
    render(body, sheet) {
      function render() {
        body.innerHTML = `
          <h3 class="decision-title">איך זה יצא?</h3>
          <div class="decision-result card">
            <div class="decision-result-label">${esc(d.question)}</div>
            <div class="decision-result-choice">${esc(choiceText(d))}</div>
            ${d.reason ? `<p class="decision-hint">למה: ${esc(d.reason)}</p>` : ''}
            ${d.feeling ? `<p class="decision-hint">אז הרגשת: ${FEELINGS[d.feeling]}</p>` : ''}
          </div>
          <div class="sheet-field-label">ובדיעבד?</div>
          <div class="pill-row">${Object.entries(OUTCOMES).map(([k, l]) => `<button type="button" class="pill${outcome === k ? ' active' : ''}" data-rv-outcome="${k}" aria-pressed="${outcome === k}">${l}</button>`).join('')}</div>
          <input type="text" class="search-bar" data-rv-note maxlength="200" placeholder="מה למדתי? (רשות)" value="${esc(note)}" style="margin-top:8px;">
          <p class="decision-hint">אין תשובה נכונה. כל תשובה שווה ${DECISIONS.review} נקודות.</p>
          <div class="sheet-actions">
            <button type="button" class="btn btn-secondary" data-rv-later>לא עכשיו</button>
            <button type="button" class="btn btn-primary" data-rv-save${outcome ? '' : ' disabled'}>לשמור</button>
          </div>`;
      }

      body.addEventListener('input', (e) => {
        if (e.target.matches('[data-rv-note]')) note = e.target.value;
      });
      body.addEventListener('click', (e) => {
        const el = e.target.closest('button');
        if (!el || el.disabled || !body.contains(el)) return;
        if (el.dataset.rvOutcome) {
          outcome = el.dataset.rvOutcome;
          return render();
        }
        if (el.dataset.rvLater !== undefined) return sheet.close();
        if (el.dataset.rvSave !== undefined) {
          // reviewedAt is the day its points are for, so a second save keeps it.
          onSave(d.id, { outcome, outcomeNote: note.trim(), reviewedAt: d.reviewedAt || new Date() });
          sheet.close();
        }
      });

      render();
    },
  });
}
