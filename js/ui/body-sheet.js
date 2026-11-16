// "הגוף שלי" — four answers (weight, height, age, sex) → a personal base
// burn and calorie/protein targets (M16a, docs/specs/body-burn.md). Opened
// from Today's card and from "יעדים" on the nutrition screen; M10's signup
// will reuse it. The numbers are worked out in js/lib/body-burn.js.

import { esc } from '../core/dom.js';
import { openBottomSheet } from './bottom-sheet.js';
import { showToast } from './toast.js';
import { getUserSettings, bodyKgOn, saveBodyProfile } from '../lib/firestore.js';
import { answersFrom, bodyDoc, bodyTargets, invalidFields } from '../lib/body-burn.js';
import { israelDateKey } from '../lib/steps-import.js';
import { NUTRITION } from '../lib/rules.js';

const FIELDS = [
  { key: 'weightKg', label: 'משקל', unit: 'ק״ג' },
  { key: 'heightCm', label: 'גובה', unit: 'ס״מ' },
  { key: 'age', label: 'גיל', unit: 'שנים' },
];
const SEXES = [
  { id: 'female', label: 'אישה' },
  { id: 'male', label: 'גבר' },
];
const NAMES = { weightKg: 'משקל', heightCm: 'גובה', age: 'גיל', sex: 'מין' };

const fmt = (n) => Math.round(n).toLocaleString('he-IL');

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
        <div class="nut-macro-grid nut-macro-grid--3">
          ${FIELDS.map((f) => `
            <label class="body-field">
              <span class="sheet-field-label">${f.label} <span class="body-unit">(${f.unit})</span></span>
              <input type="text" inputmode="decimal" dir="ltr" autocomplete="off" class="search-bar num body-input"
                data-body="${f.key}" value="${esc(answers[f.key])}" aria-label="${f.label} ב${f.unit}">
            </label>`).join('')}
        </div>
        <div class="sheet-field-label" id="body-sex-label">מין</div>
        <div class="body-sex" role="group" aria-labelledby="body-sex-label">
          ${SEXES.map((s) => `<button type="button" class="pill${answers.sex === s.id ? ' active' : ''}" data-sex="${s.id}" aria-pressed="${answers.sex === s.id}">${s.label}</button>`).join('')}
        </div>
        <div class="body-result" data-body-result aria-live="polite"></div>
        <p class="body-note">מחושב בנוסחת Mifflin-St Jeor. אימונים וצעדים נוספים על זה בכל יום.</p>
        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary" data-body-cancel>ביטול</button>
          <button type="button" class="btn btn-primary" data-body-save>שמירה</button>
        </div>`;

      const resultEl = body.querySelector('[data-body-result]');
      let tried = false; // after a save attempt, name what's missing
      const showResult = () => {
        const t = bodyTargets(answers, deficit);
        if (t) {
          resultEl.innerHTML = `
            <span>שריפה בסיסית <span class="num">${fmt(t.baseKcal)}</span> קל׳ ביום</span>
            <span>יעד חלבון <span class="num">${fmt(t.proteinTarget)}</span> גרם</span>`;
          return;
        }
        const bad = invalidFields(answers);
        resultEl.innerHTML = tried
          ? `<span class="body-check">כדאי לבדוק: ${bad.map((k) => NAMES[k]).join(', ')}</span>`
          : '<span class="body-check">מלאו את כל השדות, והשריפה תופיע כאן.</span>';
      };
      showResult();

      body.querySelectorAll('[data-body]').forEach((input) => {
        input.addEventListener('input', () => {
          answers[input.dataset.body] = input.value;
          showResult();
        });
      });
      body.querySelectorAll('[data-sex]').forEach((btn) => {
        btn.addEventListener('click', () => {
          answers.sex = btn.dataset.sex;
          body.querySelectorAll('[data-sex]').forEach((b) => {
            const on = b === btn;
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', String(on));
          });
          showResult();
        });
      });
      body.querySelector('[data-body-cancel]').addEventListener('click', () => sheetApi.close());

      const saveBtn = body.querySelector('[data-body-save]');
      saveBtn.addEventListener('click', async () => {
        const targets = bodyTargets(answers, deficit);
        if (!targets) {
          tried = true;
          showResult();
          const first = invalidFields(answers).find((k) => k !== 'sex');
          if (first) body.querySelector(`[data-body="${first}"]`)?.focus();
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
