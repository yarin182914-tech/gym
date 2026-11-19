// The four "הגוף שלי" answers (weight, height, age, sex) and the burn they
// give, as a block any sheet or screen can hold: the "הגוף שלי" sheet
// (js/ui/body-sheet.js) and the first-login questionnaire
// (js/ui/onboarding.js). The numbers are worked out in js/lib/body-burn.js.

import { esc } from '../core/dom.js';
import { bodyTargets, invalidFields } from '../lib/body-burn.js';

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

// Fills `el` with the fields. `answers` ({ weightKg, heightCm, age, sex })
// is changed in place as the user types; `deficit` is the user's own
// calorieDeficit. onChange(targets | null) after every change. Returns
// { targets() → bodyTargets() or null, showProblems() → names what's
// missing and focuses the first field }.
export function mountBodyFields(el, answers, { deficit, onChange } = {}) {
  el.innerHTML = `
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
    <p class="body-note">מחושב בנוסחת Mifflin-St Jeor. אימונים וצעדים נוספים על זה בכל יום.</p>`;

  const resultEl = el.querySelector('[data-body-result]');
  let tried = false; // after a save attempt, name what's missing
  const targets = () => bodyTargets(answers, deficit);
  const showResult = () => {
    const t = targets();
    if (t) {
      resultEl.innerHTML = `
        <span>שריפה בסיסית <span class="num">${fmt(t.baseKcal)}</span> קל׳ ביום</span>
        <span>יעד חלבון <span class="num">${fmt(t.proteinTarget)}</span> גרם</span>`;
    } else {
      const bad = invalidFields(answers);
      resultEl.innerHTML = tried
        ? `<span class="body-check">כדאי לבדוק: ${bad.map((k) => NAMES[k]).join(', ')}</span>`
        : '<span class="body-check">מלאו את כל השדות, והשריפה תופיע כאן.</span>';
    }
    onChange?.(t);
  };
  showResult();

  el.querySelectorAll('[data-body]').forEach((input) => {
    input.addEventListener('input', () => {
      answers[input.dataset.body] = input.value;
      showResult();
    });
  });
  el.querySelectorAll('[data-sex]').forEach((btn) => {
    btn.addEventListener('click', () => {
      answers.sex = btn.dataset.sex;
      el.querySelectorAll('[data-sex]').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      showResult();
    });
  });

  return {
    targets,
    showProblems() {
      tried = true;
      showResult();
      const first = invalidFields(answers).find((k) => k !== 'sex');
      if (first) el.querySelector(`[data-body="${first}"]`)?.focus();
    },
  };
}
