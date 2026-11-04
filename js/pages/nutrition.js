import { renderPlateDial } from '../lib/plate-dial.js';
import {
  addNutritionEntry, listNutritionEntries, updateNutritionEntry, deleteNutritionEntry, listBodyWeights,
  setDailyActivity, listDailyActivity,
} from '../lib/firestore.js';
import { analyzeFoodPhoto } from '../lib/nutrition-ai.js';
import { esc } from '../core/dom.js';
import { toDate, dateInputValue, parseDateInputValue } from '../lib/format.js';
import { todayKey, shiftKey } from '../lib/body-weight.js';
import { buildActivity, totalOut, weekAverage, BASE_KCAL } from '../lib/daily-activity.js';
import { beginMount, isStale, renderLoading } from '../core/page.js';
import { stepper } from '../ui/stepper.js';
import { emptyState } from '../ui/empty-state.js';
import { icon } from '../ui/icon.js';
import { mountNumericField } from '../ui/numeric-input.js';
import { createBodyWeightCard } from '../ui/body-weight-card.js';
import { mountDateField, friendlyDate } from '../ui/date-time-picker.js';
import { openBottomSheet } from '../ui/bottom-sheet.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import { showToast } from '../ui/toast.js';

const TARGETS = { calories: 2600, proteinG: 190, carbsG: 260, fatG: 80 };
// 'snack' is kept only so older entries saved under it still display a
// label instead of falling back to the raw key — the form itself now
// offers three presets plus free text instead of a fixed 4th category.
const MEAL_LABELS = { breakfast: 'בוקר', lunch: 'צהריים', dinner: 'ערב', snack: 'נשנוש' };
const MEAL_TYPE_OPTIONS = [
  { value: 'breakfast', label: 'בוקר' },
  { value: 'lunch', label: 'צהריים' },
  { value: 'dinner', label: 'ערב' },
];

function defaultMealType() {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 17) return 'lunch';
  return 'dinner';
}


let container = null;
let entries = [];
let formOpen = false;
let form = null;
let aiStatus = null; // null | 'loading' | 'unavailable' | 'error' | 'reviewing'
let reviewItems = null; // mutable copy of analyzeFoodPhoto()'s items while aiStatus === 'reviewing'
let gramsFieldCtrls = []; // mountNumericField controllers, one per reviewItems row
let bodyWeightCard = null; // created once per visit, re-attached by every render()
let activities = []; // dailyActivity docs, newest day first
// The day the ring, the macro bars and the meal list show ('yyyy-mm-dd').
// Today on every visit; the day bar steps back through earlier ones.
let selectedDay = todayKey();

const dayOf = (d) => dateInputValue(toDate(d));

export async function mountNutrition(rootEl) {
  const token = beginMount();
  container = rootEl;
  renderLoading(container, 'טוען נתוני תזונה...');
  const [loaded, weights, acts] = await Promise.all([
    listNutritionEntries(200),
    // A failed weigh-in load shouldn't take the meals down with it.
    listBodyWeights(400).catch((err) => {
      console.error('[body-weight] load failed', err);
      return [];
    }),
    listDailyActivity(60).catch((err) => {
      console.error('[daily-activity] load failed', err);
      return [];
    }),
  ]);
  if (isStale(token)) return;
  entries = loaded;
  activities = acts;
  bodyWeightCard = createBodyWeightCard(weights);
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
  bodyWeightCard = null;
  activities = [];
  selectedDay = todayKey();
}

// The selected day's meals, earliest first.
function dayEntries() {
  return entries
    .filter((e) => dayOf(e.date) === selectedDay)
    .sort((a, b) => toDate(a.date) - toDate(b.date));
}

function dayTotals() {
  return dayEntries().reduce((acc, e) => ({
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

const kcalOn = (day) => entries
  .filter((e) => dayOf(e.date) === day)
  .reduce((sum, e) => sum + (e.calories || 0), 0);

const fmt = (n) => Math.round(n).toLocaleString('he-IL');
// "+188" / "−1,337" — U+2212 minus, LTR-isolated like the weight changes.
const signed = (n) => `<bdi dir="ltr">${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmt(Math.abs(n))}</bdi>`;
const balanceColor = (n) => (n > 0 ? 'var(--danger)' : 'var(--success)');

// "נכנס מול יוצא": the day's eaten calories against its logged calories
// out, plus the 7-day average of days that have both.
function energyCard(kcalIn) {
  const activity = activities.find((a) => a.date === selectedDay);
  const out = totalOut(activity);
  const week = weekAverage(activities, kcalOn, selectedDay);
  const balance = out === null ? null : kcalIn - out;
  const parts = activity ? [
    `בסיס ${fmt(activity.baseKcal ?? BASE_KCAL)}`,
    activity.steps ? `${fmt(activity.steps)} צעדים (${fmt(activity.stepsKcal ?? 0)})` : '',
    activity.workoutKcal ? `אימון ${fmt(activity.workoutKcal)}` : '',
  ].filter(Boolean).join(' · ') : '';
  return `
    <div class="card">
      <div class="row" style="margin-bottom:10px;">
        <h3 style="color:var(--text); margin:0;">נכנס מול יוצא</h3>
        <button type="button" class="bw-edit" data-energy-edit>${activity ? 'עריכה' : 'הזנת צעדים'}</button>
      </div>
      <div class="row" style="text-align:center;">
        <div style="flex:1;"><div class="text-muted" style="font-size:0.75rem;">נכנס</div><div class="num" style="font-weight:var(--weight-bold);">${fmt(kcalIn)}</div></div>
        <div style="flex:1;"><div class="text-muted" style="font-size:0.75rem;">יוצא</div><div class="num" style="font-weight:var(--weight-bold);">${out === null ? '—' : fmt(out)}</div></div>
        <div style="flex:1;"><div class="text-muted" style="font-size:0.75rem;">${balance === null ? 'מאזן' : balance > 0 ? 'עודף' : 'גירעון'}</div><div class="num" style="font-weight:var(--weight-bold); color:${balance === null ? 'inherit' : balanceColor(balance)};">${balance === null ? '—' : signed(balance)}</div></div>
      </div>
      ${parts ? `<div class="text-muted" style="font-size:0.75rem; margin-top:8px; text-align:center;">${esc(parts)}</div>` : ''}
      ${week ? `<div class="text-muted" style="font-size:0.8rem; margin-top:10px; padding-top:8px; border-top:1px solid var(--border); text-align:center;">
        ממוצע ${week.days === 7 ? 'שבועי' : `${week.days} ימים אחרונים`}: נכנס <span class="num">${fmt(week.in)}</span> · יוצא <span class="num">${fmt(week.out)}</span> · מאזן <span class="num" style="color:${balanceColor(week.balance)};">${signed(week.balance)}</span>
      </div>` : ''}
    </div>`;
}

function openActivitySheet() {
  const day = selectedDay;
  const existing = activities.find((a) => a.date === day);
  const draft = { steps: existing?.steps ?? '', workoutKcal: existing?.workoutKcal ?? '' };
  openBottomSheet({
    ariaLabel: 'פעילות יומית',
    render(body, sheetApi) {
      body.innerHTML = `
        <h3 style="margin:0 0 6px; color:var(--text);">פעילות · ${esc(friendlyDate(day))}</h3>
        <p class="text-muted" style="font-size:0.8rem; margin:0 0 14px;">שריפה בסיסית ${fmt(existing?.baseKcal ?? BASE_KCAL)} קל' ביום, ועליה הצעדים והאימון.</p>
        <div class="sheet-field-label">צעדים</div>
        <input type="number" inputmode="numeric" min="0" dir="ltr" class="search-bar num" data-act-steps value="${esc(draft.steps)}" placeholder="0" style="margin-bottom:10px;">
        <div class="sheet-field-label">אימון (קל')</div>
        <input type="number" inputmode="numeric" min="0" dir="ltr" class="search-bar num" data-act-workout value="${esc(draft.workoutKcal)}" placeholder="0" style="margin-bottom:14px;">
        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary" data-act-cancel>ביטול</button>
          <button type="button" class="btn btn-primary" data-act-save>שמירה</button>
        </div>`;
      body.querySelector('[data-act-cancel]').addEventListener('click', () => sheetApi.close());
      body.querySelector('[data-act-save]').addEventListener('click', async () => {
        const num = (sel) => Math.max(0, Number(body.querySelector(sel).value) || 0);
        const data = buildActivity(day, {
          steps: num('[data-act-steps]'),
          workoutKcal: num('[data-act-workout]'),
          baseKcal: existing?.baseKcal ?? BASE_KCAL,
          note: existing?.note || '',
        });
        data.source = 'manual';
        try {
          await setDailyActivity(day, data);
        } catch (err) {
          console.error('[daily-activity] save failed', err);
          showToast('השמירה נכשלה — נסה שוב');
          return;
        }
        activities = activities.filter((a) => a.date !== day);
        activities.push({ id: day, ...data });
        activities.sort((a, b) => (a.date < b.date ? 1 : -1));
        sheetApi.close();
        render();
      });
    },
  });
}

// Where a meal was logged from, as a small icon after its meal type.
function sourceMark(e) {
  if (e.source === 'photo') return ` · ${icon('camera', { className: 'icon--sm' })}`;
  if (e.source === 'coach') return ` · <span title="הוזן מהצ'אט" style="display:inline-flex;">${icon('message-square', { className: 'icon--sm' })}</span>`;
  return '';
}

function render() {
  const totals = dayTotals();
  const meals = dayEntries();
  const isToday = selectedDay === todayKey();

  container.innerHTML = `
    <div id="body-weight-slot"></div>

    <div class="nut-day-bar">
      <button type="button" class="cal-nav" data-day-step="-1" aria-label="היום הקודם">${icon('chevron-right', { className: 'icon--sm' })}</button>
      <div data-day-field></div>
      <button type="button" class="cal-nav" data-day-step="1" aria-label="היום הבא"${isToday ? ' disabled' : ''}>${icon('chevron-left', { className: 'icon--sm' })}</button>
    </div>

    <div class="card" style="text-align:center;">
      <div id="calorie-ring" style="margin-bottom:8px;"></div>
    </div>

    <div class="card">
      ${macroBar('חלבון', totals.proteinG, TARGETS.proteinG)}
      ${macroBar('פחמימות', totals.carbsG, TARGETS.carbsG)}
      ${macroBar('שומן', totals.fatG, TARGETS.fatG)}
    </div>

    ${energyCard(totals.calories)}

    ${formOpen ? renderForm() : `<button class="btn btn-primary btn-block" id="open-form-btn">+ הוספת ארוחה</button>`}

    <div class="card">
      <h3 style="color:var(--text); margin-bottom:10px;">${esc(friendlyDate(selectedDay))}</h3>
      ${meals.length === 0
        ? emptyState(isToday ? 'עוד לא נרשמו ארוחות היום.' : 'לא נרשמו ארוחות ביום הזה.')
        : meals.map((e) => `
          <button type="button" class="nut-meal-row" data-meal-id="${esc(e.id)}">
            <div>
              <div style="font-weight:var(--weight-semibold);">${esc(e.description || 'ארוחה')}</div>
              <div class="text-muted" style="font-size:0.75rem; display:flex; align-items:center; gap:4px;">${esc(MEAL_LABELS[e.mealType] || e.mealType)}${sourceMark(e)}</div>
            </div>
            <span class="num" style="font-weight:var(--weight-bold); letter-spacing:var(--tracking-tight);">${esc(e.calories)} קל'</span>
          </button>`).join('')}
    </div>
  `;

  container.querySelector('#body-weight-slot').replaceWith(bodyWeightCard);

  mountDateField(container.querySelector('[data-day-field]'), {
    value: selectedDay,
    ariaLabel: 'היום המוצג',
    compact: true,
    accent: !isToday,
    onChange: (v) => {
      selectedDay = v;
      render();
    },
  });
  container.querySelectorAll('[data-day-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedDay = shiftKey(selectedDay, Number(btn.dataset.dayStep));
      render();
    });
  });
  container.querySelector('[data-energy-edit]').addEventListener('click', openActivitySheet);
  container.querySelectorAll('[data-meal-id]').forEach((row) => {
    row.addEventListener('click', () => openMealSheet(entries.find((e) => e.id === row.dataset.mealId)));
  });

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
      form = {
        description: '', calories: 0, proteinG: 0, carbsG: 0, fatG: 0,
        mealType: defaultMealType(), mealTypeIsOther: false,
        // A meal added while browsing an earlier day goes to that day.
        date: isToday ? new Date() : parseDateInputValue(selectedDay), source: 'manual',
      };
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

      <div class="pill-row-label">סוג ארוחה</div>
      <div class="pill-row" id="meal-type-pills">
        ${MEAL_TYPE_OPTIONS.map((opt) => `<button type="button" class="pill${!form.mealTypeIsOther && form.mealType === opt.value ? ' active' : ''}" data-meal-type="${opt.value}">${opt.label}</button>`).join('')}
        <button type="button" class="pill${form.mealTypeIsOther ? ' active' : ''}" data-meal-type="other">אחר</button>
      </div>
      ${form.mealTypeIsOther ? `<input type="text" id="form-meal-type-other" class="search-bar" placeholder="סוג הארוחה" value="${esc(form.mealType)}" style="margin-bottom:10px;">` : ''}

      <div class="pill-row-label">תאריך</div>
      <div id="form-date"></div>

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

  container.querySelectorAll('[data-meal-type]').forEach((btn) => btn.addEventListener('click', () => {
    const value = btn.dataset.mealType;
    if (value === 'other') {
      form.mealTypeIsOther = true;
      if (MEAL_TYPE_OPTIONS.some((opt) => opt.value === form.mealType)) form.mealType = '';
    } else {
      form.mealTypeIsOther = false;
      form.mealType = value;
    }
    render();
  }));

  const otherInput = container.querySelector('#form-meal-type-other');
  otherInput?.addEventListener('input', (e) => { form.mealType = e.target.value; });

  mountDateField(container.querySelector('#form-date'), {
    value: dateInputValue(form.date),
    ariaLabel: 'תאריך הארוחה',
    onChange: (v) => { form.date = parseDateInputValue(v); },
  });

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
    const { mealTypeIsOther, ...entry } = form; // transient UI-only flag, never persisted
    try {
      await addNutritionEntry(entry);
      entries = await listNutritionEntries(200);
    } catch (err) {
      console.error('[nutrition] save failed', err);
      showToast('השמירה נכשלה — נסה שוב');
      return;
    }
    formOpen = false;
    form = null;
    aiStatus = null;
    selectedDay = dayOf(entry.date); // show the day it was saved to
    render();
  });
}

// ---------- editing a saved meal ----------

// Tapping a meal in the list: change any of it, or delete it.
function openMealSheet(entry) {
  if (!entry) return;
  const draft = {
    description: entry.description || '',
    mealType: entry.mealType,
    isOther: !MEAL_TYPE_OPTIONS.some((opt) => opt.value === entry.mealType),
    day: dayOf(entry.date),
    calories: entry.calories || 0,
    proteinG: entry.proteinG || 0,
    carbsG: entry.carbsG || 0,
    fatG: entry.fatG || 0,
  };
  const MACROS = [
    { key: 'calories', label: 'קלוריות', unit: "קל'" },
    { key: 'proteinG', label: 'חלבון', unit: 'g' },
    { key: 'carbsG', label: 'פחמימות', unit: 'g' },
    { key: 'fatG', label: 'שומן', unit: 'g' },
  ];

  openBottomSheet({
    ariaLabel: 'עריכת ארוחה',
    render(body, sheetApi) {
      const renderPills = () => `
        ${MEAL_TYPE_OPTIONS.map((opt) => `<button type="button" class="pill${!draft.isOther && draft.mealType === opt.value ? ' active' : ''}" data-sheet-meal="${opt.value}">${opt.label}</button>`).join('')}
        <button type="button" class="pill${draft.isOther ? ' active' : ''}" data-sheet-meal="other">אחר</button>`;

      body.innerHTML = `
        <h3 style="margin:0 0 14px; color:var(--text);">עריכת ארוחה</h3>
        <input type="text" class="search-bar" data-sheet-desc placeholder="תיאור הארוחה" value="${esc(draft.description)}" style="margin-bottom:10px;">
        <div class="pill-row-label">סוג ארוחה</div>
        <div class="pill-row" data-sheet-pills>${renderPills()}</div>
        <input type="text" class="search-bar" data-sheet-other placeholder="סוג הארוחה" value="${esc(MEAL_LABELS[entry.mealType] || entry.mealType || '')}" style="margin-bottom:10px;"${draft.isOther ? '' : ' hidden'}>
        <div class="pill-row-label">תאריך</div>
        <div data-sheet-date></div>
        <div class="nut-macro-grid">
          ${MACROS.map((m) => `
            <div>
              <div class="sheet-field-label">${m.label}</div>
              <div data-sheet-macro="${m.key}"></div>
            </div>`).join('')}
        </div>
        <div class="sheet-actions">
          <button type="button" class="btn btn-danger" data-sheet-delete>מחיקה</button>
          <button type="button" class="btn btn-secondary" data-sheet-cancel>ביטול</button>
          <button type="button" class="btn btn-primary" data-sheet-save>שמירה</button>
        </div>`;

      body.querySelector('[data-sheet-desc]').addEventListener('input', (e) => { draft.description = e.target.value; });
      const otherInput = body.querySelector('[data-sheet-other]');
      otherInput.addEventListener('input', (e) => { draft.mealType = e.target.value; });
      const pillsEl = body.querySelector('[data-sheet-pills]');
      pillsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-sheet-meal]');
        if (!btn) return;
        draft.isOther = btn.dataset.sheetMeal === 'other';
        draft.mealType = draft.isOther ? otherInput.value : btn.dataset.sheetMeal;
        otherInput.hidden = !draft.isOther;
        pillsEl.innerHTML = renderPills();
      });

      mountDateField(body.querySelector('[data-sheet-date]'), {
        value: draft.day,
        ariaLabel: 'תאריך הארוחה',
        onChange: (v) => { draft.day = v; },
      });
      for (const m of MACROS) {
        mountNumericField(body.querySelector(`[data-sheet-macro="${m.key}"]`), {
          value: draft[m.key],
          unitLabel: m.unit,
          ariaLabel: m.label,
          onCommit: (v) => { draft[m.key] = v; },
        });
      }

      body.querySelector('[data-sheet-cancel]').addEventListener('click', () => sheetApi.close());

      body.querySelector('[data-sheet-save]').addEventListener('click', async () => {
        const patch = {
          description: draft.description.trim(),
          mealType: draft.mealType || entry.mealType,
          calories: Math.round(draft.calories),
          proteinG: draft.proteinG,
          carbsG: draft.carbsG,
          fatG: draft.fatG,
        };
        // Moving it to another day keeps its time of day.
        if (draft.day !== dayOf(entry.date)) {
          const d = parseDateInputValue(draft.day);
          const old = toDate(entry.date);
          d.setHours(old.getHours(), old.getMinutes(), old.getSeconds(), old.getMilliseconds());
          patch.date = d;
        }
        try {
          await updateNutritionEntry(entry.id, patch);
        } catch (err) {
          console.error('[nutrition] update failed', err);
          showToast('השמירה נכשלה — נסה שוב');
          return;
        }
        Object.assign(entry, patch);
        sheetApi.close();
        render();
      });

      body.querySelector('[data-sheet-delete]').addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'למחוק את הארוחה?',
          message: `${entry.description || 'ארוחה'} · ${entry.calories || 0} קל'`,
          confirmLabel: 'מחיקה',
          danger: true,
        });
        if (!ok) return;
        try {
          await deleteNutritionEntry(entry.id);
        } catch (err) {
          console.error('[nutrition] delete failed', err);
          showToast('המחיקה נכשלה — נסה שוב');
          return;
        }
        entries = entries.filter((e) => e !== entry);
        sheetApi.close();
        render();
      });
    },
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

