// "הגוף שלי" — four answers (weight, height, age, sex) → a personal base
// burn and calorie/protein targets (M16a, docs/specs/body-burn.md). Opened
// from Today's card and from "יעדים" on the nutrition screen. The fields
// themselves are js/ui/body-fields.js, shared with the first-login
// questionnaire (M10a); the numbers are worked out in js/lib/body-burn.js.

import { openBottomSheet } from './bottom-sheet.js';
import { showToast } from './toast.js';
import { getUserSettings, bodyKgOn, saveBodyProfile } from '../lib/firestore.js';
import { answersFrom, bodyDoc } from '../lib/body-burn.js';
import { mountBodyFields } from './body-fields.js';
import { israelDateKey } from '../lib/steps-import.js';
import { NUTRITION } from '../lib/rules.js';

// onSaved(saved): after a successful save, with what was written
// ({ body, baseKcal, calorieTarget, proteinTarget }).
export async function openBodySheet({ onSaved } = {}) {
  const today = israelDateKey();
  const year = Number(today.slice(0, 4));
  const [user, lastKg] = await Promise.all([
    getUserSettings().catch(() => ({})),
    bodyKgOn(today).catch(() => null),
  ]);
  const answers = answersFrom(user.body, year);
  // No answers yet: start from the latest weigh-in, if there is one.
  if (answers.weightKg === '' && Number.isFinite(lastKg)) answers.weightKg = lastKg;
  const deficit = Number.isFinite(user.calorieDeficit) ? user.calorieDeficit : NUTRITION.defaults.calorieDeficit;

  openBottomSheet({
    ariaLabel: 'הגוף שלי',
    render(body, sheetApi) {
      body.innerHTML = `
        <h3 class="body-sheet-title">הגוף שלי</h3>
        <p class="body-sheet-lead">ארבע שאלות, ומהן שריפה ויעדים שמתאימים לכם.</p>
        <div data-body-fields></div>
        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary" data-body-cancel>ביטול</button>
          <button type="button" class="btn btn-primary" data-body-save>שמירה</button>
        </div>`;

      const fields = mountBodyFields(body.querySelector('[data-body-fields]'), answers, { deficit });
      body.querySelector('[data-body-cancel]').addEventListener('click', () => sheetApi.close());

      const saveBtn = body.querySelector('[data-body-save]');
      saveBtn.addEventListener('click', async () => {
        const targets = fields.targets();
        if (!targets) {
          fields.showProblems();
          return;
        }
        const saved = { body: bodyDoc(answers, year), ...targets };
        saveBtn.disabled = true;
        saveBtn.classList.add('btn--loading');
        try {
          await saveBodyProfile(saved, today);
        } catch (err) {
          console.error('[body] save failed', err);
          showToast('השמירה נכשלה, נסו שוב');
          saveBtn.disabled = false;
          saveBtn.classList.remove('btn--loading');
          return;
        }
        sheetApi.close();
        showToast('נשמר. היעדים שלכם מעודכנים');
        onSaved?.(saved);
      });
    },
  });
}
