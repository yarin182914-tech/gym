import { renderPlateDial } from '../lib/plate-dial.js';
import { addNutritionEntry, listNutritionEntries } from '../lib/firestore.js';
import { analyzeFoodPhoto } from '../lib/nutrition-ai.js';
import { esc } from '../core/dom.js';
import { toDate } from '../lib/format.js';
import { beginMount, isStale, renderLoading } from '../core/page.js';
import { stepper } from '../ui/stepper.js';
import { emptyState } from '../ui/empty-state.js';
import { icon } from '../ui/icon.js';
import { mountNumericField } from '../ui/numeric-input.js';

const TARGETS = { calories: 2600, proteinG: 190, carbsG: 260, fatG: 80 };
const MEAL_LABELS = { breakfast: 'בוקר', lunch: 'צהריים', dinner: 'ערב', snack: 'נשנוש' };

let container = null;
let entries = [];
let formOpen = false;
let form = null;
let aiStatus = null; // null | 'loading' | 'unavailable' | 'error' | 'reviewing'
let reviewItems = null; // mutable copy of analyzeFoodPhoto()'s items while aiStatus === 'reviewing'
let gramsFieldCtrls = []; // mountNumericField controllers, one per reviewItems row

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
  reviewItems = null;
  gramsFieldCtrls = [];
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
        <div style="height:100%; width:${pct}%; background:var(--success); border-radius:999px;"></div>
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
              <div style="font-weight:var(--weight-semibold);">${esc(e.description || 'ארוחה')}</div>
              <div class="text-muted" style="font-size:0.75rem; display:flex; align-items:center; gap:4px;">${esc(MEAL_LABELS[e.mealType] || e.mealType)}${e.source === 'photo' ? ` · ${icon('camera', { className: 'icon--sm' })}` : ''}</div>
            </div>
            <span class="num" style="font-weight:var(--weight-bold); letter-spacing:var(--tracking-tight);">${esc(e.calories)} קל'</span>
          </div>`).join('')}
    </div>
  `;

  renderPlateDial(container.querySelector('#calorie-ring'), {
    progress: totals.calories / TARGETS.calories,
    valueText: String(Math.round(totals.calories)),
    label: `מתוך ${TARGETS.calories} קל'`,
    variant: 'success',
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
  if (aiStatus === 'reviewing') return renderReviewCard();

  const aiNote = aiStatus === 'loading'
    ? '<p class="text-muted" style="font-size:0.85rem;">מנתח את התמונה...</p>'
    : aiStatus === 'unavailable'
      ? '<p class="text-muted" style="font-size:0.85rem;">זיהוי אוטומטי מתמונה עדיין לא זמין. אפשר להזין ידנית למטה.</p>'
      : aiStatus === 'error'
        ? '<p class="text-muted" style="font-size:0.85rem;">הניתוח נכשל — אפשר להזין ידנית.</p>'
        : '';

  return `
    <div class="card">
      <h3 style="color:var(--text); margin-bottom:10px;">הוספת ארוחה</h3>
      <div class="row" style="gap:8px; margin-bottom:8px;">
        <button class="btn btn-secondary" id="photo-camera-btn" style="flex:1;">${icon('camera', { className: 'icon--sm' })} צילום תמונה</button>
        <button class="btn btn-secondary" id="photo-gallery-btn" style="flex:1;">${icon('image', { className: 'icon--sm' })} מהגלריה</button>
      </div>
      <input type="file" id="photo-input-camera" accept="image/*" capture="environment" class="hidden">
      <input type="file" id="photo-input-gallery" accept="image/*" class="hidden">
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
  if (aiStatus === 'reviewing') { wireReviewCard(); return; }

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

  container.querySelector('#photo-camera-btn').addEventListener('click', () => {
    container.querySelector('#photo-input-camera').click();
  });
  container.querySelector('#photo-gallery-btn').addEventListener('click', () => {
    container.querySelector('#photo-input-gallery').click();
  });
  container.querySelector('#photo-input-camera').addEventListener('change', onPhotoSelected);
  container.querySelector('#photo-input-gallery').addEventListener('change', onPhotoSelected);

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

async function onPhotoSelected(e) {
  const file = e.target.files[0];
  if (!file) return;
  aiStatus = 'loading';
  render();
  try {
    const result = await analyzeFoodPhoto(file);
    if (result.items.length === 0) {
      aiStatus = 'unavailable'; // reuses the existing "enter manually" note — nothing recognizable was found, not a failure
    } else {
      reviewItems = result.items;
      aiStatus = 'reviewing';
    }
  } catch (err) {
    aiStatus = err.code === 'AI_UNAVAILABLE' ? 'unavailable' : 'error';
  }
  render();
}

// ---------- AI detection review (shown between "photo selected" and the
// manual form, so the AI's food/portion guesses are always seen and
// correctable before they turn into a saved calorie total) ----------

function reviewTotals() {
  return reviewItems.reduce((acc, it) => ({
    calories: acc.calories + it.calories,
    proteinG: acc.proteinG + it.proteinG,
    carbsG: acc.carbsG + it.carbsG,
    fatG: acc.fatG + it.fatG,
  }), { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
}

function reviewRow(item, i) {
  return `
    <div class="row" style="align-items:flex-start; margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid var(--border);">
      <div style="flex:1;">
        <div style="font-weight:var(--weight-semibold);">${esc(item.name)}</div>
        <div class="text-muted" style="font-size:0.75rem;">${Math.round(item.confidence * 100)}% ביטחון${item.dbMatch ? ` · ${esc(item.source)}` : ''}</div>
        ${!item.dbMatch ? '<div style="font-size:0.75rem; color:var(--danger);">לא נמצא במאגר התזונה — לא נספר בסה"כ, אפשר להזין ידנית</div>' : ''}
      </div>
      <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
        <div data-grams-host="${i}"></div>
        <span class="num text-muted" style="font-size:0.75rem;">${Math.round(item.calories)} קל'</span>
      </div>
    </div>`;
}

function renderReviewCard() {
  const totals = reviewTotals();
  return `
    <div class="card">
      <h3 style="color:var(--text); margin-bottom:6px;">בדיקת הזיהוי</h3>
      <p class="text-muted" style="font-size:0.85rem; margin-bottom:12px;">אפשר לתקן כמויות לפני השמירה.</p>
      <div id="review-list">${reviewItems.map(reviewRow).join('')}</div>
      <div class="row" style="margin-bottom:14px;">
        <span class="text-muted">סה"כ</span>
        <span class="num" style="font-weight:var(--weight-bold); letter-spacing:var(--tracking-tight);">${Math.round(totals.calories)} קל'</span>
      </div>
      <div class="row" style="gap:8px;">
        <button class="btn btn-secondary" id="review-cancel-btn" style="flex:1;">ביטול</button>
        <button class="btn btn-primary" id="review-confirm-btn" style="flex:1;">אישור והמשך</button>
      </div>
    </div>`;
}

function wireReviewCard() {
  gramsFieldCtrls = reviewItems.map((item, i) => mountNumericField(
    container.querySelector(`[data-grams-host="${i}"]`),
    {
      value: item.estimatedGrams,
      unitLabel: 'גרם',
      onCommit: (grams) => {
        reviewItems[i].estimatedGrams = grams;
        if (reviewItems[i].per100g) {
          const factor = grams / 100;
          reviewItems[i].calories = reviewItems[i].per100g.calories * factor;
          reviewItems[i].proteinG = reviewItems[i].per100g.proteinG * factor;
          reviewItems[i].carbsG = reviewItems[i].per100g.carbsG * factor;
          reviewItems[i].fatG = reviewItems[i].per100g.fatG * factor;
        }
        render();
      },
    },
  ));

  container.querySelector('#review-cancel-btn').addEventListener('click', () => {
    reviewItems = null;
    aiStatus = null;
    render();
  });

  container.querySelector('#review-confirm-btn').addEventListener('click', () => {
    const totals = reviewTotals();
    form.description = reviewItems.map((it) => it.name).join(', ');
    form.calories = Math.round(totals.calories);
    form.proteinG = Math.round(totals.proteinG);
    form.carbsG = Math.round(totals.carbsG);
    form.fatG = Math.round(totals.fatG);
    form.source = 'photo';
    reviewItems = null;
    aiStatus = null;
    render();
  });
}

