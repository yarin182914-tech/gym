import { beginMount, isStale, renderLoading } from '../core/page.js';
import { esc } from '../core/dom.js';
import { icon } from '../ui/icon.js';
import { getUserSettings, listHabits } from '../lib/firestore.js';
import { STEPS, STEP_NAMES, areasState, stepSummary } from '../lib/onboarding.js';
import { coachBrief } from '../lib/coach-brief.js';
import { normalizeHabit } from '../lib/habits.js';
import { israelDateKey } from '../lib/steps-import.js';
import { openOnboarding } from '../ui/onboarding.js';
import { openLifePlan } from '../ui/life-plan.js';
import { activeAreas, areaLine, dueKeyOf, dateHe, planOffer } from '../lib/life-plan.js';
import { useCloud } from '../firebase-config.js';

const STEP_ICONS = { body: 'weight', workouts: 'dumbbell', sleep: 'moon', food: 'utensils', habits: 'list-checks' };

// "התכנית שלי" — opened from the profile button. Since M10a: the
// first-login questionnaire ("שאלון פתיחה") from the top, or one area of
// it, with each area's state ("הוגדר" + its line, or "לא הוגדר"). The
// rest of the settings screen (goals, routine, notifications…) is M8.
// Since M10e: "מטרות לחיים" — the areas chosen and their 3-month goal.
// In the ?dev sandbox only: what the user's Claude reads (get_brief).
let root = null;

export async function mountPlan(rootEl) {
  const token = beginMount();
  root = rootEl;
  renderLoading(rootEl, 'טוען את התכנית…');
  const [user, rawHabits] = await Promise.all([
    getUserSettings().catch(() => ({})),
    listHabits().catch(() => []),
  ]);
  if (isStale(token)) return;
  const habits = (rawHabits || []).map(normalizeHabit);
  const set = areasState(user, habits);

  rootEl.innerHTML = `
    <section class="myplan">
      <div class="card myplan-intro">
        <span class="onboarding-step-icon">${icon('target')}</span>
        <div>
          <h2 class="myplan-title">שאלון פתיחה</h2>
          <p class="text-muted myplan-lead">הגוף, אימונים, שינה, אוכל והרגלים. כל שאלה אפשר לדלג.</p>
        </div>
        <button type="button" class="btn btn-primary myplan-all" data-plan-all>${user.onboarding?.doneAt ? 'לעבור שוב' : 'למלא'}</button>
      </div>
      <ul class="myplan-list">
        ${STEPS.map((s) => {
          const line = stepSummary(s, user, habits);
          return `
          <li>
            <button type="button" class="card myplan-row${set[s] ? '' : ' myplan-row--off'}" data-plan-step="${s}">
              <span class="myplan-row-icon">${icon(STEP_ICONS[s], { className: 'icon--sm' })}</span>
              <span class="myplan-row-text">
                <span class="myplan-row-name">${STEP_NAMES[s]}</span>
                <span class="myplan-row-value">${set[s] ? esc(line || 'הוגדר') : 'לא הוגדר'}</span>
              </span>
              <span class="myplan-row-go">${set[s] ? 'לשנות' : 'להגדיר'} ${icon('chevron-left', { className: 'icon--sm' })}</span>
            </button>
          </li>`;
        }).join('')}
      </ul>
      <h2 class="myplan-section">מטרות לחיים</h2>
      ${goalsSection(user)}
      <p class="text-muted myplan-soon">בקרוב כאן: תכנית חיים מלאה ושאר ההגדרות.</p>
      ${useCloud ? '' : `
        <details class="card myplan-brief">
          <summary>מה הקלוד רואה (בדיקה בלבד)</summary>
          <pre dir="rtl">${esc(coachBrief({ user, habits, today: israelDateKey() }))}</pre>
        </details>`}
    </section>`;

  const again = () => { if (root) mountPlan(root); };
  rootEl.querySelector('[data-plan-all]').addEventListener('click', () => openOnboarding({ onClose: again }));
  rootEl.querySelectorAll('[data-plan-step]').forEach((b) => b.addEventListener('click', () => {
    openOnboarding({ only: b.dataset.planStep, onClose: again });
  }));
  rootEl.querySelector('[data-goals-start]')?.addEventListener('click', () => openLifePlan({ onClose: again }));
  rootEl.querySelector('[data-goals-add]')?.addEventListener('click', () => openLifePlan({ pick: true, onClose: again }));
  rootEl.querySelectorAll('[data-goals-area]').forEach((b) => b.addEventListener('click', () => {
    openLifePlan({ only: b.dataset.goalsArea, onClose: again });
  }));
}

// No areas yet: one row to start (grey after "אף פעם"). Otherwise a row
// per area and "+ תחום".
function goalsSection(user) {
  const areas = activeAreas(user);
  if (!areas.length) {
    const never = planOffer(user) === 'never';
    return `
      <button type="button" class="card myplan-row${never ? ' myplan-row--off' : ''}" data-goals-start>
        <span class="myplan-row-icon">${icon('target', { className: 'icon--sm' })}</span>
        <span class="myplan-row-text">
          <span class="myplan-row-name">תחומים ומטרה ל-3 חודשים</span>
          <span class="myplan-row-value">${never ? 'בחרתם לא להגדיר' : 'כ-10 דקות, הכול אפשר לדלג'}</span>
        </span>
        <span class="myplan-row-go">${never ? 'להגדיר בכל זאת' : 'להגדיר'} ${icon('chevron-left', { className: 'icon--sm' })}</span>
      </button>`;
  }
  return `
    <ul class="myplan-list">
      ${areas.map((a) => {
        const due = dueKeyOf(a.dueDate);
        const line = [areaLine(a), due ? `עד ${dateHe(due)}` : ''].filter(Boolean).join(' · ');
        return `
        <li>
          <button type="button" class="card myplan-row" data-goals-area="${esc(a.id)}">
            <span class="myplan-row-icon">${icon(a.info.icon, { className: 'icon--sm' })}</span>
            <span class="myplan-row-text">
              <span class="myplan-row-name">${esc(a.info.name)}</span>
              <span class="myplan-row-value">${esc(line || 'עוד לא מולא')}</span>
            </span>
            <span class="myplan-row-go">לשנות ${icon('chevron-left', { className: 'icon--sm' })}</span>
          </button>
        </li>`;
      }).join('')}
    </ul>
    <button type="button" class="btn btn-outline myplan-add" data-goals-add>${icon('plus', { className: 'icon--sm' })} תחום</button>`;
}

export function unmountPlan() {
  root = null;
}
