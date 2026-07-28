import { renderPlateDial } from '../lib/plate-dial.js';
import { addNutritionEntry, listNutritionEntries } from '../lib/firestore.js';
import { analyzeFoodPhoto } from '../lib/nutrition-ai.js';
import { esc } from '../core/dom.js';
import { toDate } from '../lib/format.js';
import { beginMount, isStale, renderLoading } from '../core/page.js';
import { stepper } from '../ui/stepper.js';
import { emptyState } from '../ui/empty-state.js';

const TARGETS = { calories: 2600, proteinG: 190, carbsG: 260, fatG: 80 };
const MEAL_LABELS = { breakfast: 'בוקר', lunch: 'צהריים', dinner: 'ערב', snack: 'נשנוש' };

let container = null;
let entries = [];
let formOpen = false;
let form = null;
let aiStatus = null; // null | 'loading' | 'unavailable' | 'error'

function isToday(d) {
  const a = toDate(d);
  const now = new Date();
  return a.getFullYear() === now.getFullYear() && a.getMonth() === now.getMonth() && a.getDate() === now.getDate();
}

export async function mountNutrition(rootEl) {
  const token = beginMount();
  container = rootEl;
  renderLoading(container, 'טוען נתוני תזונה...');
  const loaded = await listNutritionEntries(200);
  if (isStale(token)) return;
  entries = loaded;
  render();
}

export function unmountNutrition() {
  container = null;
  entries = [];
  formOpen = false;
  form = null;
  aiStatus = null;
}

function todayEntries() {
  return entries.filter((e) => isToday(e.date));
}

function todayTotals() {
  return todayEntries().reduce((acc, e) => ({
    calories: acc.calories + (e.calories || 0),
    proteinG: acc.proteinG + (e.proteinG || 0),
    carbsG: acc.carbsG + (e.carbsG || 0),
    fatG: acc.fatG + (e.fatG || 0),
  }), { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
}

function macroBar(label, value, target) {
  const pct = Math.min(100, Math.round((value / target) * 100));
  return `
    <div style="margin-bottom:10px;">
      <div class="row" style="margin-bottom:4px;">
        <span class="text-muted" style="font-size:0.8rem;">${label}</span>
        <span class="num" style="font-size:0.8rem;">${Math.round(value)}/${target}g</span>
      </div>
      <div style="height:8px; border-radius:999px; background:var(--surface-raised); overflow:hidden;">
        <div style="height:100%; width:${pct}%; background:var(--accent); border-radius:999px;"></div>
      </div>
    </div>`;
}

function render() {
  const totals = todayTotals();

  container.innerHTML = `
    <div class="card" style="text-align:center;">
      <div id="calorie-ring" style="margin-bottom:8px;"></div>
    </div>

    <div class="card">
      ${macroBar('חלבון', totals.proteinG, TARGETS.proteinG)}
      ${macroBar('פחמימות', totals.carbsG, TARGETS.carbsG)}
      ${macroBar('שומן', totals.fatG, TARGETS.fatG)}
    </div>

    ${formOpen ? renderForm() : `<button class="btn btn-primary btn-block" id="open-form-btn">+ הוספת ארוחה</button>`}

    <div class="card">
      <h3 style="color:var(--text); margin-bottom:10px;">היום</h3>
      ${todayEntries().length === 0
        ? emptyState('עוד לא נרשמו ארוחות היום.')
        : todayEntries().map((e) => `
          <div class="row" style="margin-bottom:8px;">
            <div>
              <div style="font-weight:600;">${esc(e.description || 'ארוחה')}</div>
              <div class="text-muted" style="font-size:0.75rem;">${esc(MEAL_LABELS[e.mealType] || e.mealType)}${e.source === 'photo' ? ' · 📷' : ''}</div>
            </div>
            <span class="num" style="font-weight:700;">${esc(e.calories)} קל'</span>
          </div>`).join('')}
    </div>
  `;

  renderPlateDial(container.querySelector('#calorie-ring'), {
    progress: totals.calories / TARGETS.calories,
    valueText: String(Math.round(totals.calories)),
    label: `מתוך ${TARGETS.calories} קל'`,
  });

  if (formOpen) {
    wireForm();
  } else {
    container.querySelector('#open-form-btn').addEventListener('click', () => {
      form = { description: '', calories: 0, proteinG: 0, carbsG: 0, fatG: 0, mealType: 'snack', source: 'manual' };
      aiStatus = null;
      formOpen = true;
      render();
    });
  }
}

// One labelled amount row in the add-meal form. All four differ only by label,
// field name, step size and the last one's bottom margin.
function macroRow(label, field, step, rowStyle = 'margin-bottom:8px') {
  return `
      <div class="row" style="${rowStyle};">
        <span class="text-muted">${label}</span>
        ${stepper({
          decAttrs: `data-field-dec="${field}" data-step="${step}"`,
          incAttrs: `data-field-inc="${field}" data-step="${step}"`,
          value: form[field],
          valueAttrs: `id="val-${field}"`,
        })}
      </div>`;
}

function renderForm() {
  const aiNote = aiStatus === 'loading'
    ? '<p class="text-muted" style="font-size:0.85rem;">מנתח את התמונה...</p>'
    : aiStatus === 'unavailable'
      ? '<p class="text-muted" style="font-size:0.85rem;">זיהוי אוטומטי מתמונה עדיין לא נבנה. אפשר להזין ידנית למטה.</p>'
      : aiStatus === 'error'
        ? '<p class="text-muted" style="font-size:0.85rem;">הניתוח נכשל — אפשר להזין ידנית.</p>'
        : '';

  return `
    <div class="card">
      <h3 style="color:var(--text); margin-bottom:10px;">הוספת ארוחה</h3>
      <button class="btn btn-secondary btn-block" id="photo-btn" style="margin-bottom:8px;">📷 זיהוי אוטומטי מתמונה</button>
      <input type="file" id="photo-input" accept="image/*" capture="environment" class="hidden">
      ${aiNote}

      <input type="text" id="form-description" class="search-bar" placeholder="תיאור הארוחה" value="${esc(form.description)}" style="margin:10px 0;">

      ${macroRow('קלוריות', 'calories', 50)}
      ${macroRow('חלבון (g)', 'proteinG', 5)}
      ${macroRow('פחמימות (g)', 'carbsG', 5)}
      ${macroRow('שומן (g)', 'fatG', 2, 'margin-bottom:14px')}

      <div class="row" style="gap:8px;">
        <button class="btn btn-secondary" id="cancel-form-btn" style="flex:1;">ביטול</button>
        <button class="btn btn-primary" id="save-form-btn" style="flex:1;">שמירה</button>
      </div>
    </div>`;
}

function wireForm() {
  container.querySelector('#form-description').addEventListener('input', (e) => { form.description = e.target.value; });

  container.querySelectorAll('[data-field-inc]').forEach((btn) => btn.addEventListener('click', () => {
    const field = btn.dataset.fieldInc;
    form[field] += Number(btn.dataset.step);
    container.querySelector(`#val-${field}`).textContent = form[field];
  }));
  container.querySelectorAll('[data-field-dec]').forEach((btn) => btn.addEventListener('click', () => {
    const field = btn.dataset.fieldDec;
    form[field] = Math.max(0, form[field] - Number(btn.dataset.step));
    container.querySelector(`#val-${field}`).textContent = form[field];
  }));

  container.querySelector('#photo-btn').addEventListener('click', () => {
    container.querySelector('#photo-input').click();
  });
  container.querySelector('#photo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    aiStatus = 'loading';
    render();
    try {
      const result = await analyzeFoodPhoto(file);
      form.description = result.description || form.description;
      form.calories = result.calories ?? form.calories;
      form.proteinG = result.proteinG ?? form.proteinG;
      form.carbsG = result.carbsG ?? form.carbsG;
      form.fatG = result.fatG ?? form.fatG;
      form.source = 'photo';
      aiStatus = null;
    } catch (err) {
      aiStatus = err.code === 'AI_UNAVAILABLE' ? 'unavailable' : 'error';
    }
    render();
  });

  container.querySelector('#cancel-form-btn').addEventListener('click', () => {
    formOpen = false;
    form = null;
    aiStatus = null;
    render();
  });

  container.querySelector('#save-form-btn').addEventListener('click', async () => {
    await addNutritionEntry({ date: new Date(), ...form });
    formOpen = false;
    form = null;
    aiStatus = null;
    entries = await listNutritionEntries(200);
    render();
  });
}

