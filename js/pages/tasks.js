// "משימות" (M6): three views of the user's tasks — היום (today's list and
// the queue waiting for a time), מטריצה (important × urgent) and הכול
// (with area / owner filters). Logic: js/lib/tasks.js; the form:
// js/ui/task-sheet.js; data: users/{uid}/tasks (docs/DATA.md).
//
// The procrastination ladder shows on a task with no time: orange "מחכה
// שבוע" after a week, "למה תקועה?" after two (or after 3 moves), and a
// decision after three. Never red, never a penalty.
//
// A fourth view, להחליט (M6b), holds the decisions: the open ones (with
// their own ladder), the reviews due ("איך זה יצא?", M6c) and the journal
// of decided ones, plus "הכללים שלי" (personal rules, M6c). The flow itself
// is js/ui/decision-sheet.js; logic js/lib/decisions.js.

import {
  listTasks, newTaskId, setTask, deleteTask, listDecisions, newDecisionId, setDecision,
  listDecisionRules, newDecisionRuleId, setDecisionRule, deleteDecisionRule,
} from '../lib/firestore.js';
import {
  TRACKS, FEELINGS, MISSING, MISSING_TIPS, normalizeDecision, openDecisions, decidedDecisions, ladderStage as decisionLadder,
  choiceText, isOnTime, OUTCOMES, normalizeRule, reviewDue, reviewsDue, ruleUses, daysLeft, experimentPending,
} from '../lib/decisions.js';
import { openDecisionSheet } from '../ui/decision-sheet.js';
import { openRulesSheet } from '../ui/decision-rules.js';
import { openReviewSheet } from '../ui/decision-review.js';
import {
  AREAS, OWNERS, SIZES, STUCK_REASONS, STUCK_TIPS, normalizeTask, dayList, isRepeating, isOpen, isDoneOn,
  isUnscheduled, quadrant, sortTasks, ladderStage, whenText, toggleDoneDate, noonOf, weekOf, isUrgent, scheduledKey,
  shortDay,
} from '../lib/tasks.js';
import { dateKey, shiftDays } from '../lib/sleep.js';
import { toDate } from '../lib/format.js';
import { beginMount, isStale, renderLoading } from '../core/page.js';
import { esc } from '../core/dom.js';
import { icon } from '../ui/icon.js';
import { showToast } from '../ui/toast.js';
import { emptyState } from '../ui/empty-state.js';
import { openTaskSheet, openQuickTask } from '../ui/task-sheet.js';
import { handleQuickActions } from '../ui/quick-add.js';

const VIEWS = { today: 'היום', matrix: 'מטריצה', all: 'הכול', decide: 'להחליט' };
const QUADRANTS = {
  do: { title: 'חשוב ודחוף', hint: 'לעשות עכשיו' },
  plan: { title: 'חשוב, לא דחוף', hint: 'לקבוע לו זמן' },
  quick: { title: 'דחוף, לא חשוב', hint: 'מהר, או להעביר' },
  drop: { title: 'לא חשוב ולא דחוף', hint: 'לשקול למחוק' },
};

let container = null;
let tasks = []; // normalized
let view = 'today';
let filter = { area: null, owner: null };
let openLadder = null; // the task whose "why stuck?" answer is showing
let decisions = []; // normalized
let rules = []; // personal decision rules, normalized
let stopQuickActions = null;

const todayKey = () => dateKey(new Date());
const byId = (id) => tasks.find((t) => t.id === id);
const failed = (what) => (err) => {
  console.error(`[tasks] ${what} failed`, err);
  showToast('השמירה נכשלה — נסה שוב');
};

export async function mountTasks(rootEl) {
  const token = beginMount();
  container = rootEl;
  renderLoading(container, 'טוען משימות…');
  const soft = (p, what) => p.catch((err) => {
    console.error(`[tasks] ${what} load failed`, err);
    return [];
  });
  const [loaded, loadedDecisions, loadedRules] = await Promise.all([
    soft(listTasks(), 'tasks'), soft(listDecisions(), 'decisions'), soft(listDecisionRules(), 'decision rules'),
  ]);
  if (isStale(token)) return;
  tasks = loaded.map(normalizeTask);
  decisions = loadedDecisions.map(normalizeDecision);
  rules = loadedRules.map(normalizeRule);
  render();
  container.addEventListener('click', onClick);
  // The + button: "משימה" — one line into the inbox; "החלטה" — a new decision.
  stopQuickActions = handleQuickActions('tasks', (action) => {
    if (action === 'task') return quickAdd();
    view = 'decide';
    render();
    if (action === 'decision') return openDecision(null, { source: 'quick' });
    // 'decision:<id>' — the home screen's nearest decision; 'review:<id>' —
    // its "איך זה יצא?".
    const dec = decisions.find((x) => `decision:${x.id}` === action);
    if (dec) return openDecision(dec);
    const rev = decisions.find((x) => `review:${x.id}` === action);
    if (rev) openReview(rev);
  });
}

export function unmountTasks() {
  stopQuickActions?.();
  stopQuickActions = null;
  container?.removeEventListener('click', onClick);
  container = null;
  tasks = [];
  decisions = [];
  rules = [];
  openLadder = null;
}

// ---------- decisions ----------

function saveDecision(id, patch, { isNew = false } = {}) {
  const now = new Date();
  const existing = decisions.find((d) => d.id === id);
  const merged = { ...(existing || {}), ...patch, id, ...(isNew ? { createdAt: now } : {}) };
  decisions = existing ? decisions.map((d) => (d.id === id ? normalizeDecision(merged) : d)) : [...decisions, normalizeDecision(merged)];
  setDecision(id, patch, { isNew }).catch(failed('decision'));
  if (view === 'decide') render();
}

function openDecision(decision, prefill = {}) {
  openDecisionSheet({
    decision,
    prefill,
    newId: newDecisionId,
    onSave: saveDecision,
    onDecided: (text) => showToast(`${icon('check', { className: 'icon--sm' })} החלטת: ${esc(text)}`),
    rules,
    onSaveRule: (data) => {
      saveRule(null, data);
      showToast(`${icon('bookmark', { className: 'icon--sm' })} נשמר כלל: ${esc(data.name)}`);
    },
  });
}

function openReview(decision) {
  openReviewSheet({
    decision,
    onSave: (id, patch) => {
      saveDecision(id, patch);
      showToast(`${icon('check', { className: 'icon--sm' })} נשמר ביומן`);
    },
  });
}

// id null: a new rule. Returns the new list (the rules sheet redraws from it).
function saveRule(id, data) {
  const isNew = !id;
  const ruleId = id || newDecisionRuleId();
  const existing = rules.find((r) => r.id === ruleId);
  const merged = normalizeRule({ ...(existing || {}), ...data, id: ruleId, ...(isNew ? { createdAt: new Date() } : {}) });
  rules = existing ? rules.map((r) => (r.id === ruleId ? merged : r)) : [...rules, merged];
  setDecisionRule(ruleId, isNew ? { fromDecisionId: null, ...data } : data, { isNew }).catch(failed('rule'));
  if (view === 'decide') render();
  return rules;
}

function removeRule(id) {
  rules = rules.filter((r) => r.id !== id);
  deleteDecisionRule(id).catch(failed('rule delete'));
  if (view === 'decide') render();
  return rules;
}

// ---------- writes ----------

// Saves a change and shows it at once.
function save(id, patch, { isNew = false } = {}) {
  const now = new Date();
  const existing = byId(id);
  const merged = { ...(existing || {}), ...patch, id, ...(isNew ? { createdAt: now } : {}) };
  tasks = existing ? tasks.map((t) => (t.id === id ? normalizeTask(merged) : t)) : [...tasks, normalizeTask(merged)];
  setTask(id, patch, { isNew }).catch(failed('task'));
  render();
}

export function quickAdd() {
  openQuickTask({
    onSave: ({ title }) => {
      save(newTaskId(), {
        title, type: 'once', recurrence: null, area: null, owner: 'me', complexity: 'S', important: false, urgent: false,
        timing: null, scheduledAt: null, dueDate: null, status: 'inbox', firstStep: '', postponeCount: 0,
        doneAt: null, doneDates: [], stuckReason: null, startedAt: null, calendarEventId: null, source: 'quick',
      }, { isNew: true });
      showToast(`${icon('check', { className: 'icon--sm' })} נכנסה לתיבה`);
    },
    onMore: (title) => openForm(null, { title }),
  });
}

function openForm(task, prefill = {}) {
  openTaskSheet({
    task,
    prefill,
    tasks,
    newId: newTaskId,
    onSave: ({ id, data, isNew }) => save(id, data, { isNew }),
    onDelete: (id) => {
      tasks = tasks.filter((t) => t.id !== id);
      deleteTask(id).catch(failed('delete'));
      render();
    },
  });
}

function toggleDone(task) {
  const key = todayKey();
  if (isRepeating(task)) {
    const done = !isDoneOn(task, key);
    save(task.id, { doneDates: toggleDoneDate(task.doneDates, key, done) });
  } else if (task.status === 'done') {
    save(task.id, { status: 'open', doneAt: null });
  } else {
    save(task.id, { status: 'done', doneAt: new Date() });
  }
}

// "מחר": a timed task moves to tomorrow (from today, if it was due
// earlier), at the same time; counts toward "moved 3 times".
function postpone(task) {
  const from = toDate(task.scheduledAt || noonOf(todayKey()));
  const next = noonOf(shiftDays(todayKey(), 1));
  if (task.timing === 'exact') next.setHours(from.getHours(), from.getMinutes(), 0, 0);
  save(task.id, { scheduledAt: next, postponeCount: task.postponeCount + 1 });
  showToast('עברה למחר');
}

function onClick(e) {
  const el = e.target.closest('[data-view], [data-filter-area], [data-filter-owner], [data-check], [data-open], [data-add], [data-postpone], [data-why], [data-reason], [data-act], [data-dec-new], [data-dec-open], [data-dec-when], [data-dec-missing], [data-dec-why], [data-dec-rules], [data-dec-review]');
  if (!el || !container?.contains(el)) return;
  const d = el.dataset;
  if (d.view) {
    view = d.view;
    return render();
  }
  if (d.decNew !== undefined) return openDecision(null);
  if (d.decRules !== undefined) return openRulesSheet({ rules, uses: ruleUses(decisions), onSave: saveRule, onDelete: removeRule });
  const dec = decisions.find((x) => x.id === (d.decOpen || d.decWhy || d.decReview || (d.decWhen || d.decMissing || '').split('|')[0]));
  if (dec) {
    if (d.decOpen) return openDecision(dec);
    if (d.decReview) return openReview(dec);
    if (d.decWhy) {
      openLadder = openLadder === dec.id ? null : dec.id;
      return render();
    }
    if (d.decWhen) {
      const days = Number(d.decWhen.split('|')[1]);
      saveDecision(dec.id, { decideBy: noonOf(shiftDays(todayKey(), days)) });
      return showToast('נקבע תאריך החלטה');
    }
    if (d.decMissing) {
      openLadder = dec.id;
      return saveDecision(dec.id, { stuckReason: d.decMissing.split('|')[1] });
    }
  }
  if (d.filterArea !== undefined) {
    filter.area = d.filterArea || null;
    return render();
  }
  if (d.filterOwner !== undefined) {
    filter.owner = d.filterOwner || null;
    return render();
  }
  if (d.add !== undefined) return openForm(null);
  const task = byId(d.check || d.open || d.postpone || d.why || d.reason?.split('|')[0] || d.act?.split('|')[0]);
  if (!task) return;
  if (d.check) return toggleDone(task);
  if (d.open) return openForm(task);
  if (d.postpone) return postpone(task);
  if (d.why) {
    openLadder = openLadder === task.id ? null : task.id;
    return render();
  }
  if (d.reason) {
    openLadder = task.id;
    return save(task.id, { stuckReason: d.reason.split('|')[1] });
  }
  if (d.act) {
    const act = d.act.split('|')[1];
    openLadder = null;
    if (act === 'start') {
      save(task.id, { startedAt: new Date() });
      showToast(`${icon('sparkles', { className: 'icon--sm' })} התחלה זה הכי קשה — כל הכבוד`);
    } else if (act === 'week') {
      save(task.id, { timing: 'week', scheduledAt: noonOf(weekOf(todayKey())), status: 'open' });
    } else if (act === 'someday') {
      save(task.id, { status: 'someday' });
      showToast('עברה ל"מתישהו"');
    } else if (act === 'edit') {
      openForm(task);
    } else if (act === 'delete') {
      tasks = tasks.filter((t) => t.id !== task.id);
      deleteTask(task.id).catch(failed('delete'));
      render();
    }
  }
}

// ---------- render ----------

function render() {
  if (!container) return;
  const body = view === 'matrix' ? matrixView() : view === 'all' ? allView() : view === 'decide' ? decideView() : todayView();
  container.innerHTML = `
    <div class="task-head">
      <nav class="toggle-group task-tabs" aria-label="תצוגה">
        ${Object.entries(VIEWS).map(([k, l]) => `<button type="button" data-view="${k}"${view === k ? ' class="active" aria-current="page"' : ''}>${l}</button>`).join('')}
      </nav>
      ${view === 'decide'
        ? `<button type="button" class="btn btn-primary task-add" data-dec-new>${icon('plus', { className: 'icon--sm' })} החלטה</button>`
        : `<button type="button" class="btn btn-primary task-add" data-add>${icon('plus', { className: 'icon--sm' })} משימה</button>`}
    </div>
    ${body}`;
}

// ---------- להחליט ----------

function decideView() {
  const open = openDecisions(decisions);
  const done = decidedDecisions(decisions);
  const due = reviewsDue(decisions, todayKey());
  const rulesBtn = `
    <div class="decision-tools">
      <button type="button" class="btn-mini-dashed" data-dec-rules>${icon('bookmark', { className: 'icon--sm' })} הכללים שלי${rules.length ? ` <span class="num">${rules.length}</span>` : ''}</button>
    </div>`;
  if (!open.length && !done.length) {
    return `<div class="card decision-empty">
      ${emptyState('מתלבט? כתוב את השאלה, ותקבל לה זמן קצוב. קטנה: 2 דקות והגרלה. בינונית: עד מחר, עם ציון. גדולה: שבוע, בשלבים.', { centered: true })}
      <button type="button" class="btn btn-primary" data-dec-new>החלטה חדשה</button>
    </div>${rulesBtn}`;
  }
  return rulesBtn
    + section('איך זה יצא?', due.map(journalRow), { note: 'מבט לאחור מוריד את החרדה בפעם הבאה. אין תשובה נכונה.' })
    + section('פתוחות', open.map(decisionRow), { count: open.length || null })
    + section('החלטתי', done.filter((x) => !reviewDue(x, todayKey())).slice(0, 30).map(journalRow), { note: 'בלי "צדקתי" או "טעיתי": הנקודות הן על הזמן.' });
}

// "להחליט עד …" with the days left, for a decision with a date.
function byText(dec) {
  const left = daysLeft(dec);
  if (left === null) return dec.startedAt ? 'התחלת, אפשר להמשיך' : 'עוד לא התחלת';
  if (dec.track !== 'large' || left < 0) return `להחליט עד ${shortDayOf(dec.decideBy)}`;
  return left === 0 ? 'להחליט היום' : left === 1 ? 'להחליט עד מחר' : `עוד ${left} ימים להחליט`;
}

function decisionRow(dec) {
  const stage = decisionLadder(dec);
  const id = esc(dec.id);
  const by = byText(dec);
  const passed = (daysLeft(dec) ?? 0) < 0;
  let ladder = '';
  if (stage === 'setDate') {
    ladder = `
      <div class="task-ladder">
        <p class="task-ladder-q">שבוע בלי תאריך. מתי להחליט?</p>
        <div class="pill-row">
          <button type="button" class="pill" data-dec-when="${id}|1">מחר</button>
          <button type="button" class="pill" data-dec-when="${id}|3">בעוד 3 ימים</button>
          <button type="button" class="pill" data-dec-when="${id}|7">בעוד שבוע</button>
        </div>
      </div>`;
  } else if (stage === 'missing') {
    ladder = openLadder !== dec.id
      ? `<div class="task-ladder"><button type="button" class="btn-mini-dashed" data-dec-why="${id}">מה חסר כדי להחליט?</button></div>`
      : `
      <div class="task-ladder">
        <p class="task-ladder-q">מה חסר כדי להחליט?</p>
        <div class="pill-row">${Object.entries(MISSING).map(([k, l]) => `<button type="button" class="pill${dec.stuckReason === k ? ' active' : ''}" data-dec-missing="${id}|${k}" aria-pressed="${dec.stuckReason === k}">${l}</button>`).join('')}</div>
        ${dec.stuckReason ? `<p class="task-note">${MISSING_TIPS[dec.stuckReason]}</p>` : ''}
        <div class="pill-row">
          <button type="button" class="pill active" data-dec-open="${id}">להחליט עכשיו</button>
          <button type="button" class="pill" data-dec-when="${id}|3">לקבוע תאריך</button>
        </div>
      </div>`;
  }
  return `
    <div class="card task-row decision-row${stage ? ' task-row--wait' : ''}">
      <div class="task-row-main">
        <span class="decision-row-icon">${icon('split', { className: 'icon--sm' })}</span>
        <button type="button" class="task-row-body" data-dec-open="${id}">
          <span class="task-title">${esc(dec.question)}</span>
          <span class="task-when">${by}</span>
          <span class="task-tags">
            <span class="task-tag task-tag--quiet">${TRACKS[dec.track]}</span>
            ${stage === 'setDate' ? '<span class="task-tag task-tag--wait">לקבוע תאריך החלטה</span>' : ''}
            ${experimentPending(dec) ? '<span class="task-tag">מחכה לניסוי</span>' : ''}
            ${passed ? '<span class="task-tag task-tag--quiet">התאריך עבר</span>' : ''}
          </span>
        </button>
      </div>
      ${ladder}
    </div>`;
}

function journalRow(dec) {
  const onTime = isOnTime(dec);
  const due = reviewDue(dec, todayKey());
  return `
    <div class="card task-row decision-journal">
      <div class="task-row-main">
        <span class="decision-row-icon">${icon('check', { className: 'icon--sm' })}</span>
        <div class="task-row-body">
          <span class="task-title">${esc(dec.question)}</span>
          <span class="decision-choice">${esc(choiceText(dec))}</span>
          <span class="task-tags">
            <span class="task-tag task-tag--quiet">${shortDayOf(dec.decidedAt)}</span>
            ${onTime ? `<span class="task-tag task-tag--accent">${icon('clock', { className: 'icon--sm' })} בזמן</span>` : ''}
            ${dec.method === 'feet' ? '<span class="task-tag">הגרלה</span>' : dec.method === 'score' ? '<span class="task-tag">לפי ציון</span>' : ''}
            ${dec.method === 'rule' ? '<span class="task-tag">לפי כלל</span>' : ''}
            ${dec.track === 'large' ? `<span class="task-tag task-tag--quiet">${TRACKS.large}</span>` : ''}
            ${dec.feeling ? `<span class="task-tag task-tag--quiet">${FEELINGS[dec.feeling]}</span>` : ''}
            ${dec.outcome ? `<span class="task-tag">יצא: ${OUTCOMES[dec.outcome]}</span>` : ''}
          </span>
          ${dec.reason ? `<span class="task-step">${esc(dec.reason)}</span>` : ''}
          ${dec.outcomeNote ? `<span class="task-step">${esc(dec.outcomeNote)}</span>` : ''}
        </div>
      </div>
      ${due ? `<div class="task-ladder"><button type="button" class="pill active" data-dec-review="${esc(dec.id)}">${icon('sparkles', { className: 'icon--sm' })} איך זה יצא?</button></div>` : ''}
    </div>`;
}

const shortDayOf = (v) => shortDay(dateKey(toDate(v)), todayKey());

function section(title, rows, { count = null, note = '' } = {}) {
  if (!rows.length) return '';
  return `
    <section class="task-section">
      <div class="today-section-head">
        <h2 class="today-section-title">${title}</h2>
        ${count !== null ? `<span class="today-section-count num">${count}</span>` : ''}
      </div>
      ${note ? `<p class="task-note">${note}</p>` : ''}
      <div class="task-list">${rows.join('')}</div>
    </section>`;
}

function todayView() {
  const key = todayKey();
  const list = dayList(tasks, key, key);
  const done = list.filter((t) => isDoneOn(t, key)).length;
  const queue = sortTasks(tasks.filter((t) => isUnscheduled(t)), key);
  if (!list.length && !queue.length) {
    return `<div class="card">${emptyState('אין משימות להיום. משימה חדשה: בכפתור למעלה, או ב־+ למטה.', { centered: true })}</div>`;
  }
  return section('להיום', list.map((t) => row(t, key)), { count: list.length ? `${done}/${list.length}` : null })
    + (list.length ? '' : '<div class="card task-empty-day">אין משהו מתוכנן להיום.</div>')
    + section('מחכה לשיבוץ', queue.map((t) => row(t, key)), { note: 'קלוד מציע להן זמן בבדיקת הערב.' });
}

function matrixView() {
  const key = todayKey();
  const open = tasks.filter((t) => !isRepeating(t) && isOpen(t));
  const cells = Object.entries(QUADRANTS).map(([q, { title, hint }]) => {
    const list = sortTasks(open.filter((t) => quadrant(t, key) === q), key);
    return `
      <div class="card task-quad task-quad--${q}">
        <div class="task-quad-head"><strong>${title}</strong><span class="text-muted">${hint}</span></div>
        ${list.length ? list.map((t) => `
          <div class="task-quad-row">
            ${checkButton(t, key)}
            <button type="button" class="task-quad-title" data-open="${esc(t.id)}">${esc(t.title)}</button>
          </div>`).join('') : '<p class="text-muted task-quad-empty">ריק</p>'}
      </div>`;
  });
  return `<div class="task-matrix">${cells.join('')}</div>
    <p class="task-note">"דחוף" = יעד או מועד בתוך יומיים, או מסומנת דחופה.</p>`;
}

function allView() {
  const key = todayKey();
  const match = (t) => (!filter.area || t.area === filter.area) && (!filter.owner || t.owner === filter.owner);
  const list = tasks.filter(match);
  const chip = (attr, value, label, active) => `<button type="button" class="pill${active ? ' active' : ''}" ${attr}="${value}" aria-pressed="${active}">${label}</button>`;
  const weekAgo = shiftDays(key, -7);
  const recentDone = list.filter((t) => !isRepeating(t) && t.status === 'done' && t.doneAt && dateKey(toDate(t.doneAt)) >= weekAgo)
    .sort((a, b) => toDate(b.doneAt) - toDate(a.doneAt));
  const body = section('פתוחות', sortTasks(list.filter((t) => !isRepeating(t) && isOpen(t)), key).map((t) => row(t, key)))
    + section('חוזרות', list.filter((t) => isRepeating(t) && t.status === 'open').map((t) => row(t, key)))
    + section('מתישהו', list.filter((t) => t.status === 'someday').map((t) => row(t, key)), { note: 'בלי אשמה. עוברים עליהן פעם בחודש.' })
    + section('בוצעו השבוע', recentDone.map((t) => row(t, key)));
  return `
    <div class="pill-row task-filters">
      ${chip('data-filter-area', '', 'כל התחומים', !filter.area)}
      ${Object.entries(AREAS).map(([k, l]) => chip('data-filter-area', k, l, filter.area === k)).join('')}
    </div>
    <div class="pill-row task-filters">
      ${chip('data-filter-owner', '', 'כולם', !filter.owner)}
      ${Object.entries(OWNERS).map(([k, l]) => chip('data-filter-owner', k, l, filter.owner === k)).join('')}
    </div>
    ${body || `<div class="card">${emptyState('אין משימות כאן.', { centered: true })}</div>`}`;
}

function checkButton(t, key) {
  const done = isDoneOn(t, key) || (!isRepeating(t) && t.status === 'done');
  const label = done ? `לבטל סימון: ${t.title}` : `סיום: ${t.title}`;
  return `<button type="button" class="task-check${done ? ' task-check--done' : ''}" data-check="${esc(t.id)}" aria-pressed="${done}" aria-label="${esc(label)}">${done ? icon('check', { className: 'icon--sm' }) : ''}</button>`;
}

function row(t, key) {
  const done = isDoneOn(t, key) || (!isRepeating(t) && t.status === 'done');
  const stage = done ? null : ladderStage(t);
  const tags = [
    t.status === 'inbox' ? '<span class="task-tag">בתיבה</span>' : '',
    t.important ? `<span class="task-tag task-tag--accent">${icon('sparkles', { className: 'icon--sm' })} חשובה</span>` : '',
    !done && isUrgent(t, key) ? `<span class="task-tag">${icon('flame', { className: 'icon--sm' })} דחופה</span>` : '',
    stage === 'waiting' ? '<span class="task-tag task-tag--wait">מחכה שבוע</span>' : '',
    t.owner !== 'me' ? `<span class="task-tag">${OWNERS[t.owner]}</span>` : '',
    `<span class="task-tag task-tag--quiet">${SIZES[t.complexity]}</span>`,
  ].join('');
  const when = whenText(t, key);
  const canPostpone = !done && !isRepeating(t) && (t.timing === 'exact' || t.timing === 'day') && scheduledKey(t) && scheduledKey(t) <= key;
  return `
    <div class="card task-row${done ? ' task-row--done' : ''}${stage === 'waiting' ? ' task-row--wait' : ''}">
      <div class="task-row-main">
        ${checkButton(t, key)}
        <button type="button" class="task-row-body" data-open="${esc(t.id)}">
          <span class="task-title">${esc(t.title)}</span>
          ${when ? `<span class="task-when">${esc(when)}</span>` : ''}
          ${t.firstStep && !done ? `<span class="task-step">צעד ראשון: ${esc(t.firstStep)}</span>` : ''}
          <span class="task-tags">${tags}</span>
        </button>
        ${canPostpone ? '<button type="button" class="btn-mini-dashed task-postpone" data-postpone="' + esc(t.id) + '">מחר</button>' : ''}
      </div>
      ${stage === 'stuck' || stage === 'decide' ? ladder(t, stage) : ''}
    </div>`;
}

// Two weeks: "why stuck?" with one-tap answers; three: a decision.
function ladder(t, stage) {
  const id = esc(t.id);
  if (stage === 'decide') {
    return `
      <div class="task-ladder">
        <p class="task-ladder-q">שלושה שבועות בלי זמן. מה עושים איתה?</p>
        <div class="pill-row">
          <button type="button" class="pill" data-act="${id}|week">לשבץ השבוע</button>
          <button type="button" class="pill" data-act="${id}|someday">מתישהו</button>
          <button type="button" class="pill" data-act="${id}|delete">למחוק</button>
        </div>
      </div>`;
  }
  if (openLadder !== t.id) {
    return `<div class="task-ladder"><button type="button" class="btn-mini-dashed" data-why="${id}">למה היא תקועה?</button></div>`;
  }
  const reason = t.stuckReason;
  const actions = {
    unclear: [['edit', 'להגדיר צעד ראשון']],
    big: [['edit', 'לפרק']],
    unpleasant: [['start', 'התחלתי 10 דקות'], ['edit', 'לשייך לשעת הסידורים']],
    stressful: [['start', 'התחלתי 10 דקות']],
    notImportant: [['someday', 'למתישהו'], ['delete', 'למחוק']],
  };
  return `
    <div class="task-ladder">
      <p class="task-ladder-q">למה היא תקועה?</p>
      <div class="pill-row">${Object.entries(STUCK_REASONS).map(([k, l]) => `<button type="button" class="pill${reason === k ? ' active' : ''}" data-reason="${id}|${k}" aria-pressed="${reason === k}">${l}</button>`).join('')}</div>
      ${reason ? `
        <p class="task-note">${STUCK_TIPS[reason]}</p>
        <div class="pill-row">${actions[reason].filter(([a]) => a !== 'start' || !t.startedAt).map(([a, l]) => `<button type="button" class="pill active" data-act="${id}|${a}">${l}</button>`).join('')}</div>` : ''}
    </div>`;
}
