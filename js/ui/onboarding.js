// "שאלון פתיחה" — the first-login questionnaire (M10a,
// docs/specs/onboarding.md). A full screen over the app: welcome, then
// body, workouts, sleep, food and habits, each with "דלג", then a summary.
// A skipped step writes nothing, so that area stays "not set up" until the
// user chooses (here again, from "התכנית שלי", or from its own screen).
//
// Opens by itself on a new account's first visit (js/app.js), and from
// "התכנית שלי" (js/pages/plan.js) — the whole flow, or one step only.
// Saves don't wait for the server: the local copy takes them at once and
// syncs by itself, so it works offline.

import { esc } from '../core/dom.js';
import { icon } from './icon.js';
import { stepper } from './stepper.js';
import { showToast } from './toast.js';
import { mountNumericField } from './numeric-input.js';
import { mountBodyFields } from './body-fields.js';
import { mountSleepFields, sleepPatch } from './sleep-fields.js';
import { openHabitWizard } from './habit-wizard.js';
import {
  getUserSettings, updateUserSettings, bodyKgOn, saveBodyProfile, listHabits, setHabit, newHabitId,
} from '../lib/firestore.js';
import {
  STEPS, STEP_NAMES, WORKOUT_KINDS, workoutKindsOf, resumeStep, nextStep, markStep,
  clampMeals, quickTemplates, quickHabit, stepSummary,
} from '../lib/onboarding.js';
import { answersFrom, bodyDoc } from '../lib/body-burn.js';
import { sleepSettings } from '../lib/sleep.js';
import { nutritionGoals, mealsPerDay, weeklyWorkoutGoal } from '../lib/rewards.js';
import { normalizeHabit } from '../lib/habits.js';
import { israelDateKey } from '../lib/steps-import.js';
import { NUTRITION, ONBOARDING } from '../lib/rules.js';
import { accountCreatedAt } from '../auth.js';
import { useCloud } from '../firebase-config.js';

// This account's creation date 'yyyy-mm-dd' (Israel time), or ''. In ?dev
// there's no Google account, so it behaves as a new one (like the
// "הגוף שלי" card).
export function accountCreatedKey() {
  const created = useCloud ? accountCreatedAt() : new Date();
  return created ? israelDateKey(created) : '';
}

// An account from before the questionnaire (ירין): never opens by itself,
// and its progress is written only when it finishes.
export const isOlderAccount = () => accountCreatedKey() < ONBOARDING.fromDate;

const STEP_ICONS = { body: 'weight', workouts: 'dumbbell', sleep: 'moon', food: 'utensils', habits: 'list-checks' };
const STEP_LEADS = {
  body: 'ארבע שאלות, ומהן ג׳יני מחשבת כמה אתם שורפים ביום ויעד חלבון.',
  workouts: 'כמה אימונים בשבוע הם יעד טוב בשבילכם, ובאיזה סוגים.',
  sleep: 'מתי רוצים להירדם ולקום. ג׳יני תמדוד מול זה.',
  food: 'כמה ארוחות ביום, וכמה לאכול. אפשר להשאיר את מה שחושב מהגוף.',
  habits: 'מה רוצים לבנות, או ממה להיגמל. אפשר לבחור מהרשימה או לכתוב.',
};
const MAX_KCAL = 9999;

let openNow = null; // one questionnaire at a time

// only: a step id → just that step, with "שמירה"; otherwise the whole
// flow from where it was left. persist: false for an older account (ירין)
// — its progress is written only when it finishes, so opening and closing
// changes nothing. onClose() after it closes.
export async function openOnboarding({ only = null, persist = !isOlderAccount(), onClose } = {}) {
  if (openNow) return;
  openNow = true;
  const today = israelDateKey();
  const year = Number(today.slice(0, 4));
  const [loadedUser, loadedHabits, lastKg] = await Promise.all([
    getUserSettings().catch(() => ({})),
    listHabits().catch(() => []),
    bodyKgOn(today).catch(() => null),
  ]);
  let user = { ...loadedUser };
  let habits = (loadedHabits || []).map(normalizeHabit);
  const ob = {
    step: resumeStep(user),
    skipped: Array.isArray(user.onboarding?.skipped) ? [...user.onboarding.skipped] : [],
    ...(user.onboarding?.startedAt ? { startedAt: user.onboarding.startedAt } : {}),
    ...(user.onboarding?.doneAt ? { doneAt: user.onboarding.doneAt } : {}),
  };

  // Every write: the step's own fields and the progress, without waiting.
  const write = (fields = {}, { progress = !only } = {}) => {
    user = { ...user, ...fields };
    const patch = { ...fields };
    if (progress && persist) patch.onboarding = { ...ob };
    if (!Object.keys(patch).length) return;
    updateUserSettings(patch).catch((err) => {
      console.error('[onboarding] save failed', err);
      showToast('השמירה נכשלה, נסו שוב');
    });
  };

  if (!only && persist && !user.onboarding) {
    ob.startedAt = new Date();
    // A new account gets no silent example habits on Today.
    write({ habitsSeeded: true });
  }

  let screen = only || (user.onboarding ? ob.step : 'welcome');
  let stepApi = null; // the current step: { save() → fields | false (stay) }

  const root = document.createElement('div');
  root.className = 'onboarding';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'שאלון פתיחה');
  document.body.appendChild(root);
  document.body.classList.add('onboarding-open');
  requestAnimationFrame(() => root.classList.add('onboarding--in'));

  function close() {
    if (!only && screen !== 'done' && STEPS.includes(screen)) {
      ob.step = screen;
      write();
    }
    root.remove();
    document.body.classList.remove('onboarding-open');
    openNow = null;
    onClose?.();
  }

  function go(next) {
    screen = next;
    paint();
    root.querySelector('.onboarding-body')?.scrollTo?.(0, 0);
  }

  function advance({ skip }) {
    if (only) return close();
    ob.skipped = markStep(ob.skipped, screen, { skip });
    const next = nextStep(screen);
    ob.step = next === 'done' ? screen : next;
    if (next === 'done') {
      ob.doneAt = ob.doneAt || new Date();
      // An older account starts keeping its progress only now.
      if (!persist) updateUserSettings({ onboarding: { ...ob, startedAt: ob.startedAt || new Date() } }).catch(() => {});
    }
    write();
    go(next);
  }

  function header() {
    const i = STEPS.indexOf(screen);
    const dots = only || i < 0 ? '' : `<div class="wizard-progress" aria-hidden="true">${STEPS.map((s, j) => `<span class="wizard-dot${j <= i ? ' wizard-dot--on' : ''}"></span>`).join('')}</div>`;
    const back = !only && i > 0 ? `<button type="button" class="onboarding-icon-btn" data-ob-back aria-label="חזרה">${icon('chevron-right')}</button>` : '<span></span>';
    return `
      <div class="onboarding-head">
        ${back}
        ${dots}
        <button type="button" class="onboarding-icon-btn" data-ob-later aria-label="${only ? 'ביטול' : 'אחר כך'}">${icon('x')}</button>
      </div>`;
  }

  function stepTitle(step) {
    return `
      <span class="onboarding-step-icon">${icon(STEP_ICONS[step])}</span>
      <h2 class="onboarding-title">${STEP_NAMES[step]}</h2>
      <p class="onboarding-lead">${STEP_LEADS[step]}</p>`;
  }

  function footer() {
    if (only) {
      return `
        <div class="onboarding-foot">
          <button type="button" class="btn btn-secondary" data-ob-later>ביטול</button>
          <button type="button" class="btn btn-primary" data-ob-next>שמירה</button>
        </div>`;
    }
    return `
      <div class="onboarding-foot">
        <button type="button" class="btn btn-secondary" data-ob-skip>דלג</button>
        <button type="button" class="btn btn-primary" data-ob-next>הבא</button>
      </div>`;
  }

  // ---------- the screens ----------

  function welcome(body) {
    body.innerHTML = `
      <div class="onboarding-welcome">
        <img class="onboarding-logo" src="images/logo/jini.svg" alt="" width="72" height="72">
        <h2 class="onboarding-title">נעים להכיר!</h2>
        <p class="onboarding-lead">כמה שאלות קצרות כדי שג׳יני תתאים את עצמה אליכם: הגוף, אימונים, שינה, אוכל והרגלים. בערך 3 דקות.</p>
        <p class="onboarding-note">כל שאלה אפשר לדלג. מה שמדלגים עליו לא נשמר, ואפשר להגדיר אותו אחר כך ב"התכנית שלי".</p>
      </div>
      <div class="onboarding-foot">
        <button type="button" class="btn btn-secondary" data-ob-later>אחר כך</button>
        <button type="button" class="btn btn-primary" data-ob-start>מתחילים</button>
      </div>`;
    body.querySelector('[data-ob-start]').addEventListener('click', () => go(STEPS[0]));
    return null;
  }

  function bodyStep(el) {
    const answers = answersFrom(user.body, year);
    if (answers.weightKg === '' && Number.isFinite(lastKg)) answers.weightKg = lastKg;
    const deficit = Number.isFinite(user.calorieDeficit) ? user.calorieDeficit : NUTRITION.defaults.calorieDeficit;
    el.innerHTML = `${stepTitle('body')}<div data-ob-fields></div>`;
    const fields = mountBodyFields(el.querySelector('[data-ob-fields]'), answers, { deficit });
    return {
      save() {
        const targets = fields.targets();
        if (!targets) {
          fields.showProblems();
          return false;
        }
        const saved = { body: bodyDoc(answers, year), ...targets };
        user = { ...user, ...saved };
        saveBodyProfile(saved, today).catch((err) => console.error('[onboarding] body save failed', err));
        return {};
      },
    };
  }

  function workoutsStep(el) {
    let goal = weeklyWorkoutGoal(user);
    const kinds = new Set(workoutKindsOf(user));
    const paint = () => {
      el.innerHTML = `
        ${stepTitle('workouts')}
        <div class="sheet-field-label">אימונים בשבוע</div>
        <div class="onboarding-stepper">${stepper({ decAttrs: 'type="button" data-goal="-1" aria-label="פחות"', incAttrs: 'type="button" data-goal="1" aria-label="יותר"', value: goal })}</div>
        <div class="sheet-field-label">באיזה סוגים (אפשר כמה)</div>
        <div class="pill-row onboarding-pills">
          ${WORKOUT_KINDS.map((k) => `<button type="button" class="pill${kinds.has(k.id) ? ' active' : ''}" data-kind="${k.id}" aria-pressed="${kinds.has(k.id)}">${esc(k.name)}</button>`).join('')}
        </div>`;
      el.querySelectorAll('[data-goal]').forEach((b) => b.addEventListener('click', () => {
        goal = Math.min(7, Math.max(1, goal + Number(b.dataset.goal)));
        paint();
      }));
      el.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => {
        if (kinds.has(b.dataset.kind)) kinds.delete(b.dataset.kind); else kinds.add(b.dataset.kind);
        paint();
      }));
    };
    paint();
    return { save: () => ({ weeklyWorkoutGoal: goal, workoutKinds: WORKOUT_KINDS.filter((k) => kinds.has(k.id)).map((k) => k.id) }) };
  }

  function sleepStep(el) {
    const draft = sleepSettings(user);
    el.innerHTML = `${stepTitle('sleep')}<div data-ob-fields></div>`;
    mountSleepFields(el.querySelector('[data-ob-fields]'), draft);
    return {
      save() {
        const patch = sleepPatch(draft);
        if (!patch) {
          showToast('יש להזין מינימום שעות');
          return false;
        }
        return patch;
      },
    };
  }

  function foodStep(el) {
    const goals = nutritionGoals(user);
    let meals = mealsPerDay(user);
    const draft = { calorieTarget: goals.calorieTarget, proteinTarget: goals.proteinTarget };
    el.innerHTML = `
      ${stepTitle('food')}
      <div class="sheet-field-label">ארוחות ביום</div>
      <div class="onboarding-stepper" data-ob-meals></div>
      <div class="nut-macro-grid">
        <div><div class="sheet-field-label">יעד קלוריות</div><div data-ob-kcal></div></div>
        <div><div class="sheet-field-label">יעד חלבון</div><div data-ob-protein></div></div>
      </div>
      <p class="onboarding-note">${user.body ? 'היעדים חושבו מהגוף שלכם.' : 'אלה ברירות המחדל. "הגוף שלי" מחשב יעדים אישיים.'} ביום עם שריפה רשומה, היעד הוא השריפה פחות הגירעון.</p>`;
    const mealsEl = el.querySelector('[data-ob-meals]');
    const paintMeals = () => {
      mealsEl.innerHTML = stepper({ decAttrs: 'type="button" data-meals="-1" aria-label="פחות"', incAttrs: 'type="button" data-meals="1" aria-label="יותר"', value: meals });
      mealsEl.querySelectorAll('[data-meals]').forEach((b) => b.addEventListener('click', () => {
        meals = clampMeals(meals + Number(b.dataset.meals));
        paintMeals();
      }));
    };
    paintMeals();
    mountNumericField(el.querySelector('[data-ob-kcal]'), { value: draft.calorieTarget, unitLabel: "קל'", ariaLabel: 'יעד קלוריות', max: MAX_KCAL, onCommit: (v) => { draft.calorieTarget = v; } });
    mountNumericField(el.querySelector('[data-ob-protein]'), { value: draft.proteinTarget, unitLabel: 'גרם', ariaLabel: 'יעד חלבון', max: MAX_KCAL, onCommit: (v) => { draft.proteinTarget = v; } });
    return {
      save() {
        const kcal = Math.round(draft.calorieTarget || 0);
        const protein = Math.round(draft.proteinTarget || 0);
        if (!kcal || !protein) {
          showToast(!kcal ? 'יש להזין יעד קלוריות' : 'יש להזין יעד חלבון');
          return false;
        }
        return { mealsPerDay: meals, calorieTarget: kcal, proteinTarget: protein };
      },
    };
  }

  function habitsStep(el) {
    const templates = quickTemplates();
    const picked = new Set();
    const typed = [];
    const fromWizard = [];
    const existing = new Set(habits.map((h) => h.name));
    const count = () => picked.size + typed.length + fromWizard.length;
    const paint = () => {
      const full = count() >= ONBOARDING.maxHabits;
      el.innerHTML = `
        ${stepTitle('habits')}
        ${habits.some((h) => h.active) ? `<p class="onboarding-note">כבר יש לכם: ${esc(stepSummary('habits', user, habits))}.</p>` : ''}
        <div class="sheet-field-label">בלחיצה אחת</div>
        <div class="pill-row onboarding-pills">
          ${templates.filter((t) => !existing.has(t.name)).map((t) => {
            const on = picked.has(t.id);
            return `<button type="button" class="pill${on ? ' active' : ''}" data-tpl="${t.id}" aria-pressed="${on}" ${!on && full ? 'disabled' : ''}>${icon(t.icon || 'check', { className: 'icon--sm' })} ${esc(t.name)}${t.kind === 'bad' ? ' <span class="onboarding-pill-tag">להיגמל</span>' : ''}</button>`;
          }).join('')}
          ${[...typed, ...fromWizard.map((f) => f.name)].map((name, i) => `<button type="button" class="pill active" data-own="${i}" aria-label="להסיר את ${esc(name)}">${esc(name)} ${icon('x', { className: 'icon--sm' })}</button>`).join('')}
        </div>
        <form class="onboarding-own" data-ob-own>
          <input type="text" class="search-bar" maxlength="60" placeholder="הרגל משלך, למשל: 10 דקות מתיחות" aria-label="שם ההרגל" ${full ? 'disabled' : ''}>
          <button type="submit" class="btn btn-outline" ${full ? 'disabled' : ''}>הוספה</button>
        </form>
        <button type="button" class="btn btn-outline onboarding-wizard-btn" data-ob-wizard ${full ? 'disabled' : ''}>${icon('sparkles', { className: 'icon--sm' })} עם כל השאלות (מומלץ להרגל שרוצים להיגמל ממנו)</button>
        ${full ? `<p class="onboarding-note">אפשר עד ${ONBOARDING.maxHabits} בבת אחת. עוד הרגלים מוסיפים במסך "היום".</p>` : ''}`;
      el.querySelectorAll('[data-tpl]').forEach((b) => b.addEventListener('click', () => {
        if (picked.has(b.dataset.tpl)) picked.delete(b.dataset.tpl); else picked.add(b.dataset.tpl);
        paint();
      }));
      el.querySelectorAll('[data-own]').forEach((b) => b.addEventListener('click', () => {
        const i = Number(b.dataset.own);
        if (i < typed.length) typed.splice(i, 1); else fromWizard.splice(i - typed.length, 1);
        paint();
      }));
      el.querySelector('[data-ob-own]').addEventListener('submit', (e) => {
        e.preventDefault();
        const input = e.currentTarget.querySelector('input');
        const name = input.value.trim();
        if (!name || count() >= ONBOARDING.maxHabits) return;
        typed.push(name.slice(0, 60));
        paint();
      });
      el.querySelector('[data-ob-wizard]').addEventListener('click', () => {
        openHabitWizard({
          onSave(fields) {
            fromWizard.push(fields);
            paint();
          },
        });
      });
    };
    paint();
    return {
      save() {
        const list = [
          ...templates.filter((t) => picked.has(t.id)).map(quickHabit),
          ...typed.map(quickHabit),
          ...fromWizard.map((f) => ({ ...f, active: f.active !== false, source: 'onboarding' })),
        ].filter(Boolean);
        let order = habits.reduce((max, h) => Math.max(max, h.order), -1);
        for (const data of list) {
          order += 1;
          const id = newHabitId();
          const doc = { ...data, order };
          habits = [...habits, normalizeHabit({ id, ...doc })];
          setHabit(id, doc, { isNew: true }).catch((err) => console.error('[onboarding] habit save failed', err));
        }
        return {};
      },
    };
  }

  function done(body) {
    body.innerHTML = `
      <div class="onboarding-done">
        <span class="onboarding-step-icon onboarding-step-icon--done">${icon('check')}</span>
        <h2 class="onboarding-title">סיימנו!</h2>
        <p class="onboarding-lead">זה מה שג׳יני יודעת עכשיו. הכול אפשר לשנות ב"התכנית שלי".</p>
        <ul class="onboarding-summary">
          ${STEPS.map((s) => {
            const line = stepSummary(s, user, habits);
            return `<li class="onboarding-summary-row${line ? '' : ' onboarding-summary-row--off'}">
              <span class="onboarding-summary-icon">${icon(STEP_ICONS[s], { className: 'icon--sm' })}</span>
              <span class="onboarding-summary-name">${STEP_NAMES[s]}</span>
              <span class="onboarding-summary-value">${line ? esc(line) : 'לא הוגדר'}</span>
            </li>`;
          }).join('')}
        </ul>
        <p class="onboarding-note">תחומי חיים, חזון ותכנית אב: בקרוב.</p>
      </div>
      <div class="onboarding-foot onboarding-foot--one">
        <button type="button" class="btn btn-primary" data-ob-finish>לעבור להיום</button>
      </div>`;
    body.querySelector('[data-ob-finish]').addEventListener('click', () => {
      close();
      if (location.hash !== '#/today') location.hash = '#/today';
    });
    return null;
  }

  const STEP_VIEWS = { body: bodyStep, workouts: workoutsStep, sleep: sleepStep, food: foodStep, habits: habitsStep };

  function paint() {
    if (screen === 'welcome' || screen === 'done') {
      root.innerHTML = `<div class="onboarding-panel"><div class="onboarding-body"></div></div>`;
      const body = root.querySelector('.onboarding-body');
      (screen === 'welcome' ? welcome : done)(body);
      body.querySelectorAll('[data-ob-later]').forEach((b) => b.addEventListener('click', close));
      return;
    }
    root.innerHTML = `
      <div class="onboarding-panel">
        ${header()}
        <div class="onboarding-body"><div class="onboarding-step"></div></div>
        ${footer()}
      </div>`;
    stepApi = STEP_VIEWS[screen](root.querySelector('.onboarding-step'));
    root.querySelectorAll('[data-ob-later]').forEach((b) => b.addEventListener('click', close));
    root.querySelector('[data-ob-back]')?.addEventListener('click', () => go(STEPS[STEPS.indexOf(screen) - 1]));
    root.querySelector('[data-ob-skip]')?.addEventListener('click', () => advance({ skip: true }));
    root.querySelector('[data-ob-next]').addEventListener('click', () => {
      // A numeric field commits on blur; let it, then read the drafts.
      document.activeElement?.blur?.();
      const fields = stepApi.save();
      if (fields === false) return;
      write(fields, { progress: false });
      if (only) {
        showToast('נשמר');
        close();
        return;
      }
      advance({ skip: false });
    });
  }

  paint();
}
