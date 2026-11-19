// "מטרות לחיים" (M10e, docs/specs/life-goals.md) — the plan's level 2. A
// full screen over the app, in the questionnaire's frame (js/ui/onboarding.js):
// welcome, pick the areas that matter, then one screen per area (where I
// am today 1–10, the one thing to change in 3 months, how I'll know and a
// date, and ready ideas), then a summary. Every screen has "דלג", which
// writes nothing for that area.
//
// Opens from the questionnaire's last screen ("עכשיו") and from "התכנית
// שלי" (js/pages/plan.js): the whole flow, one area (`only`), or the picker
// for adding areas (`pick`). Saves don't wait for the server, so it works
// offline.

import { esc } from '../core/dom.js';
import { icon } from './icon.js';
import { showToast } from './toast.js';
import { openHabitWizard } from './habit-wizard.js';
import { openTaskSheet } from './task-sheet.js';
import {
  getUserSettings, saveLifePlan, listHabits, setHabit, newHabitId, listTasks, setTask, newTaskId,
} from '../lib/firestore.js';
import {
  activeAreas, areaInfo, storedAreaIds, areaFields, areaLine, defaultDueKey, dueKeyOf, dateHe,
  ideasFor, ideaHabitTemplate, ideaTaskPrefill, clampScore,
} from '../lib/life-plan.js';
import { LIFE_AREAS } from '../lib/plan-templates.js';
import { normalizeHabit } from '../lib/habits.js';
import { israelDateKey } from '../lib/steps-import.js';
import { LIFE_PLAN } from '../lib/rules.js';

let openNow = null; // one at a time

// only: an area id → just that area, with "שמירה" and "להסיר".
// pick: true → the picker, then only the areas added there.
// onClose() after it closes.
export async function openLifePlan({ only = null, pick = false, onClose } = {}) {
  if (openNow) return;
  openNow = true;
  const today = israelDateKey();
  const [loadedUser, loadedHabits, loadedTasks] = await Promise.all([
    getUserSettings().catch(() => ({})),
    listHabits().catch(() => []),
    listTasks().catch(() => []),
  ]);
  let user = { ...loadedUser };
  let habits = (loadedHabits || []).map(normalizeHabit);
  let tasks = loadedTasks || [];
  const stored = () => user.lifePlan?.areas || {};

  // The areas this run goes through, in order, and the names of own areas
  // added here before they are saved.
  const before = activeAreas(user).map((a) => a.id);
  let chosen = [...before];
  let route = []; // the area screens after the picker
  const ownNames = {};
  let nextOwn = Math.max(0, ...storedAreaIds(user).filter((id) => id.startsWith('custom-')).map((id) => Number(id.split('-')[1]))) + 1;

  // Keeps the local copy in step, so the summary and "התכנית שלי" read it.
  const write = (patch) => {
    const plan = user.lifePlan || {};
    user = {
      ...user,
      lifePlan: {
        ...plan,
        ...patch,
        areas: { ...(plan.areas || {}), ...Object.fromEntries(Object.entries(patch.areas || {}).map(([id, a]) => [id, { ...(plan.areas?.[id] || {}), ...a }])) },
      },
    };
    saveLifePlan(patch).catch((err) => {
      console.error('[life-plan] save failed', err);
      showToast('השמירה נכשלה, נסו שוב');
    });
  };

  let screen = only || (pick || before.length ? 'pick' : 'welcome');
  let stepApi = null; // the current area screen: { save() → fields }

  const root = document.createElement('div');
  root.className = 'onboarding';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'מטרות לחיים');
  document.body.appendChild(root);
  document.body.classList.add('onboarding-open');
  requestAnimationFrame(() => root.classList.add('onboarding--in'));

  function close() {
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

  // The screen after `from`: the next area on the route, or the summary
  // (closing instead when only adding areas).
  function after(from) {
    const i = route.indexOf(from);
    const next = route[i + 1];
    if (next) return go(next);
    if (pick) {
      showToast('נשמר');
      return close();
    }
    return go('done');
  }

  const infoOf = (id) => areaInfo(id, ownNames[id] ? { name: ownNames[id] } : stored()[id]);

  function header() {
    const all = ['pick', ...route];
    const i = all.indexOf(screen);
    const dots = only || i < 0 ? '' : `<div class="wizard-progress" aria-hidden="true">${all.map((s, j) => `<span class="wizard-dot${j <= i ? ' wizard-dot--on' : ''}"></span>`).join('')}</div>`;
    const back = !only && i > 0 ? `<button type="button" class="onboarding-icon-btn" data-lp-back aria-label="חזרה">${icon('chevron-right')}</button>` : '<span></span>';
    return `
      <div class="onboarding-head">
        ${back}
        ${dots}
        <button type="button" class="onboarding-icon-btn" data-lp-later aria-label="${only ? 'ביטול' : 'אחר כך'}">${icon('x')}</button>
      </div>`;
  }

  function footer() {
    if (only) {
      return `
        <div class="onboarding-foot">
          <button type="button" class="btn btn-secondary" data-lp-later>ביטול</button>
          <button type="button" class="btn btn-primary" data-lp-next>שמירה</button>
        </div>`;
    }
    return `
      <div class="onboarding-foot">
        <button type="button" class="btn btn-secondary" data-lp-skip>דלג</button>
        <button type="button" class="btn btn-primary" data-lp-next${screen === 'pick' && !chosen.length ? ' disabled' : ''}>הבא</button>
      </div>`;
  }

  // ---------- the screens ----------

  function welcome(body) {
    body.innerHTML = `
      <div class="onboarding-welcome">
        <span class="onboarding-step-icon">${icon('target')}</span>
        <h2 class="onboarding-title">מטרות לחיים</h2>
        <p class="onboarding-lead">בוחרים מה חשוב לכם, ולכל תחום שלוש שאלות קצרות. כ-10 דקות, וכל שאלה אפשר לדלג.</p>
        <p class="onboarding-note">ג׳יני תציע הרגלים ומשימות שמתאימים, והקלוד שלכם יקרא את המטרות כדי לכוון.</p>
      </div>
      <div class="onboarding-foot">
        <button type="button" class="btn btn-secondary" data-lp-later>אחר כך</button>
        <button type="button" class="btn btn-primary" data-lp-start>מתחילים</button>
      </div>`;
    body.querySelector('[data-lp-start]').addEventListener('click', () => go('pick'));
  }

  function pickScreen(el) {
    const own = () => chosen.filter((id) => id.startsWith('custom-'));
    const paintPick = () => {
      const full = own().length >= LIFE_PLAN.maxCustomAreas;
      const tile = (id) => {
        const a = infoOf(id);
        const on = chosen.includes(id);
        return `<button type="button" class="lifeplan-area${on ? ' lifeplan-area--on' : ''}" data-area="${esc(id)}" aria-pressed="${on}">
          <span class="lifeplan-area-icon">${icon(a.icon)}</span>
          <span class="lifeplan-area-name">${esc(a.name)}</span>
        </button>`;
      };
      el.innerHTML = `
        <span class="onboarding-step-icon">${icon('target')}</span>
        <h2 class="onboarding-title">מה חשוב לכם עכשיו?</h2>
        <p class="onboarding-lead">מומלץ להתחיל ב-2–${LIFE_PLAN.suggestedAreas}. תמיד אפשר להוסיף אחר כך.</p>
        <div class="lifeplan-areas">
          ${LIFE_AREAS.map((a) => tile(a.id)).join('')}
          ${own().map(tile).join('')}
        </div>
        <form class="onboarding-own" data-lp-own>
          <input type="text" class="search-bar" maxlength="40" placeholder="תחום משלי, למשל: מוזיקה" aria-label="שם התחום" ${full ? 'disabled' : ''}>
          <button type="submit" class="btn btn-outline" ${full ? 'disabled' : ''}>הוספה</button>
        </form>
        ${full ? `<p class="onboarding-note">אפשר עד ${LIFE_PLAN.maxCustomAreas} תחומים משלכם.</p>` : ''}`;
      el.querySelectorAll('[data-area]').forEach((b) => b.addEventListener('click', () => {
        const id = b.dataset.area;
        chosen = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
        paintPick();
        root.querySelector('[data-lp-next]').disabled = !chosen.length;
      }));
      el.querySelector('[data-lp-own]').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = e.currentTarget.querySelector('input').value.trim();
        if (!name || own().length >= LIFE_PLAN.maxCustomAreas) return;
        const id = `custom-${nextOwn++}`;
        ownNames[id] = name.slice(0, 40);
        chosen = [...chosen, id];
        paintPick();
        root.querySelector('[data-lp-next]').disabled = false;
      });
    };
    paintPick();
    return {
      save() {
        // Areas unpicked here are turned off; their answers stay.
        const off = before.filter((id) => !chosen.includes(id));
        const patch = { order: chosen };
        if (off.length) patch.areas = Object.fromEntries(off.map((id) => [id, { removed: true }]));
        write(patch);
        route = pick ? chosen.filter((id) => !before.includes(id)) : [...chosen];
        return true;
      },
    };
  }

  function areaScreen(el, id) {
    const a = infoOf(id);
    const prev = stored()[id] || {};
    const [lo, hi] = LIFE_PLAN.scoreRange;
    const draft = {
      score: clampScore(prev.score),
      wish3m: prev.wish3m || '',
      successMetric: prev.successMetric || '',
      dueKey: dueKeyOf(prev.dueDate) || defaultDueKey(today),
    };
    const added = new Set();
    const scores = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

    el.innerHTML = `
      <span class="onboarding-step-icon">${icon(a.icon)}</span>
      <h2 class="onboarding-title">${esc(a.name)}</h2>
      <p class="onboarding-lead">שלוש שאלות קצרות. אפשר לענות רק על חלק.</p>

      <div class="sheet-field-label" id="lp-score-label">איפה אני היום?</div>
      <div class="lifeplan-score" role="group" aria-labelledby="lp-score-label" data-lp-scores></div>
      <div class="lifeplan-score-ends text-muted"><span>${lo} = רחוק ממה שהייתי רוצה</span><span>${hi} = בדיוק שם</span></div>

      <label class="sheet-field-label" for="lp-wish">מה הדבר האחד שהייתם רוצים לשנות ב-3 החודשים הקרובים?</label>
      <input type="text" class="search-bar" id="lp-wish" maxlength="200" data-lp-wish value="${esc(draft.wish3m)}" placeholder="במילים שלכם">
      ${a.wishes.length ? `<div class="pill-row onboarding-pills lifeplan-wishes">${a.wishes.map((w, i) => `<button type="button" class="pill" data-wish="${i}">${esc(w)}</button>`).join('')}</div>` : ''}

      <label class="sheet-field-label" for="lp-metric">איך תדעו שהצלחתם?</label>
      <input type="text" class="search-bar" id="lp-metric" maxlength="200" data-lp-metric value="${esc(draft.successMetric)}" placeholder="${esc(a.metric)}">
      <div class="lifeplan-due">
        <label class="sheet-field-label" for="lp-due">עד מתי</label>
        <input type="date" class="search-bar" id="lp-due" data-lp-due value="${esc(draft.dueKey)}" min="${esc(today)}">
      </div>

      <div data-lp-ideas></div>

      ${only && before.includes(id) ? `<button type="button" class="lifeplan-remove" data-lp-remove>${icon('trash-2', { className: 'icon--sm' })} להסיר את התחום</button>` : ''}`;

    const scoresEl = el.querySelector('[data-lp-scores]');
    const paintScores = () => {
      scoresEl.innerHTML = scores.map((n) => `<button type="button" class="lifeplan-score-btn${draft.score === n ? ' lifeplan-score-btn--on' : ''}" data-score="${n}" aria-pressed="${draft.score === n}">${n}</button>`).join('');
      scoresEl.querySelectorAll('[data-score]').forEach((b) => b.addEventListener('click', () => {
        const n = Number(b.dataset.score);
        draft.score = draft.score === n ? null : n;
        paintScores();
      }));
    };
    paintScores();

    const wishEl = el.querySelector('[data-lp-wish]');
    wishEl.addEventListener('input', () => { draft.wish3m = wishEl.value; });
    el.querySelectorAll('[data-wish]').forEach((b) => b.addEventListener('click', () => {
      draft.wish3m = a.wishes[Number(b.dataset.wish)];
      wishEl.value = draft.wish3m;
    }));
    const metricEl = el.querySelector('[data-lp-metric]');
    metricEl.addEventListener('input', () => { draft.successMetric = metricEl.value; });
    const dueEl = el.querySelector('[data-lp-due]');
    dueEl.addEventListener('change', () => { draft.dueKey = dueEl.value; });

    const ideasEl = el.querySelector('[data-lp-ideas]');
    const paintIdeas = () => {
      const ideas = ideasFor(id, { habits, tasks: tasks.filter((t) => !added.has(t.title)) });
      const shown = [...ideas, ...[...added].map((name) => ({ name, done: true }))];
      if (!shown.length) {
        ideasEl.innerHTML = '';
        return;
      }
      ideasEl.innerHTML = `
        <div class="sheet-field-label">רעיונות שיעזרו</div>
        <ul class="lifeplan-ideas">
          ${shown.map((idea, i) => idea.done ? `
            <li class="lifeplan-idea lifeplan-idea--done">
              <span class="lifeplan-idea-icon">${icon('check', { className: 'icon--sm' })}</span>
              <span class="lifeplan-idea-name">${esc(idea.name)}</span>
              <span class="lifeplan-idea-go">נוסף</span>
            </li>` : `
            <li>
              <button type="button" class="lifeplan-idea" data-idea="${i}">
                <span class="lifeplan-idea-icon">${icon(idea.kind === 'habit' ? (idea.template.icon || 'check') : 'list-checks', { className: 'icon--sm' })}</span>
                <span class="lifeplan-idea-name">${esc(idea.name)}<span class="lifeplan-idea-kind">${idea.kind === 'habit' ? 'הרגל' : 'משימה'}</span></span>
                <span class="lifeplan-idea-go">${icon('plus', { className: 'icon--sm' })} להוסיף</span>
              </button>
            </li>`).join('')}
        </ul>`;
      ideasEl.querySelectorAll('[data-idea]').forEach((b) => b.addEventListener('click', () => {
        const idea = ideas[Number(b.dataset.idea)];
        if (idea.kind === 'habit') {
          openHabitWizard({
            template: ideaHabitTemplate(idea, id),
            onSave(fields) {
              const order = habits.reduce((max, h) => Math.max(max, h.order), -1) + 1;
              const hid = newHabitId();
              const data = { ...fields, order, source: 'plan', planArea: id };
              habits = [...habits, normalizeHabit({ id: hid, ...data })];
              setHabit(hid, data, { isNew: true }).catch((err) => console.error('[life-plan] habit save failed', err));
              added.add(fields.name);
              showToast(`${icon('check', { className: 'icon--sm' })} ההרגל נוסף`);
              paintIdeas();
            },
          });
        } else {
          openTaskSheet({
            prefill: ideaTaskPrefill(idea, id),
            tasks,
            newId: newTaskId,
            onSave({ id: tid, data, isNew }) {
              tasks = [...tasks, { id: tid, ...data }];
              setTask(tid, data, { isNew }).catch((err) => console.error('[life-plan] task save failed', err));
              added.add(data.title);
              showToast(`${icon('check', { className: 'icon--sm' })} המשימה נוספה`);
              paintIdeas();
            },
          });
        }
      }));
    };
    paintIdeas();

    el.querySelector('[data-lp-remove]')?.addEventListener('click', () => {
      write({ areas: { [id]: { removed: true } } });
      showToast('התחום הוסר');
      close();
    });

    return {
      save() {
        const fields = areaFields(draft, a.custom ? { name: a.name, icon: a.icon } : {});
        const isNew = !stored()[id];
        const order = chosen.includes(id) ? chosen : [...chosen, id];
        write({ planDepth: 'goals', order, areas: { [id]: { ...fields, ...(isNew ? { createdAt: new Date() } : {}), updatedAt: new Date() } } });
        return true;
      },
    };
  }

  function done(body) {
    const areas = activeAreas(user);
    body.innerHTML = `
      <div class="onboarding-done">
        <span class="onboarding-step-icon onboarding-step-icon--done">${icon('check')}</span>
        <h2 class="onboarding-title">${areas.length ? 'התכנית מוכנה!' : 'אין עדיין מטרות'}</h2>
        <p class="onboarding-lead">${areas.length ? 'הכול אפשר לשנות ב"התכנית שלי".' : 'אפשר לחזור לזה מתי שרוצים, מ"התכנית שלי".'}</p>
        ${areas.length ? `<ul class="onboarding-summary">
          ${areas.map((x) => {
            const line = areaLine(x);
            return `<li class="onboarding-summary-row">
              <span class="onboarding-summary-icon">${icon(x.info.icon, { className: 'icon--sm' })}</span>
              <span class="onboarding-summary-name">${esc(x.info.name)}</span>
              <span class="onboarding-summary-value">${esc(line || 'נבחר')}</span>
            </li>`;
          }).join('')}
        </ul>` : ''}
        <p class="onboarding-note">תכנית חיים מלאה, עם חזון ומטרות לטווח ארוך: בקרוב.</p>
      </div>
      <div class="onboarding-foot onboarding-foot--one">
        <button type="button" class="btn btn-primary" data-lp-finish>סיום</button>
      </div>`;
    body.querySelector('[data-lp-finish]').addEventListener('click', close);
  }

  function paint() {
    if (screen === 'welcome' || screen === 'done') {
      root.innerHTML = `<div class="onboarding-panel"><div class="onboarding-body"></div></div>`;
      const body = root.querySelector('.onboarding-body');
      (screen === 'welcome' ? welcome : done)(body);
      body.querySelectorAll('[data-lp-later]').forEach((b) => b.addEventListener('click', close));
      return;
    }
    root.innerHTML = `
      <div class="onboarding-panel">
        ${header()}
        <div class="onboarding-body"><div class="onboarding-step"></div></div>
        ${footer()}
      </div>`;
    const el = root.querySelector('.onboarding-step');
    stepApi = screen === 'pick' ? pickScreen(el) : areaScreen(el, screen);
    root.querySelectorAll('[data-lp-later]').forEach((b) => b.addEventListener('click', close));
    root.querySelector('[data-lp-back]')?.addEventListener('click', () => {
      const all = ['pick', ...route];
      go(all[all.indexOf(screen) - 1]);
    });
    root.querySelector('[data-lp-skip]')?.addEventListener('click', () => {
      if (screen === 'pick') return close();
      after(screen);
    });
    root.querySelector('[data-lp-next]').addEventListener('click', () => {
      document.activeElement?.blur?.();
      stepApi.save();
      if (only) {
        showToast('נשמר');
        return close();
      }
      if (screen === 'pick') {
        if (!route.length) {
          showToast('נשמר');
          return close();
        }
        return go(route[0]);
      }
      after(screen);
    });
  }

  paint();
}
