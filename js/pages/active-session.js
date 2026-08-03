import { esc } from '../core/dom.js';
import { beginMount, isStale } from '../core/page.js';
import { setsTable } from '../ui/sets-table.js';
import { toggleGroup, patchToggleGroup } from '../ui/toggle-group.js';
import { mountNumericField } from '../ui/numeric-input.js';
import { mountWheelPicker } from '../ui/wheel-picker.js';
import { openBottomSheet } from '../ui/bottom-sheet.js';
import { emptyState } from '../ui/empty-state.js';
import { icon } from '../ui/icon.js';
import { openExerciseEditSheet } from '../ui/exercise-edit-sheet.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import {
  formatMMSS, formatDateHe, formatWeight, unitLabel, convertWeight, SET_TYPES,
  dateInputValue, parseDateInputValue,
} from '../lib/format.js';
import {
  listExerciseLibrary, seedExerciseLibraryIfEmpty, addExerciseToLibrary,
  getLastPerformance, createWorkout, getExerciseHistory, listWorkouts, CATEGORY_GROUPS,
} from '../lib/firestore.js';

let container = null;
let library = [];
let session = null; // { startedAt, realStartedAt, exercises: [...] }
let elapsedTimerId = null;
let picker = { open: false, query: '', category: null };
let lastTimeModal = null; // { name, previous }
let recentExerciseNames = []; // fetched lazily each time the picker opens

// exercise uid -> { root, setsListEl, setsEls: Map<setUid, rowCtrl>, modeGroupEl, unitGroupEl }
// Rebuilt from scratch by render(); read/patched in place by everything else,
// which is what lets routine set-logging skip render() entirely.
let exerciseRefs = new Map();

// Only one wheel picker is meant to be open at a time; closing whichever one
// is currently open before opening another avoids stacking scroll listeners.
let openWheelCloser = null;

// { exUid, pointerId, cardEl, grabStartClientY } while a drag handle is held.
// session.exercises and #exercise-list's DOM order are kept in sync on every
// swap during the drag itself (not just on drop), so there's never a moment
// where the two disagree.
let exerciseDrag = null;

let uidSeq = 0;
function nextUid() {
  uidSeq += 1;
  return uidSeq;
}

export async function mountActiveSession(rootEl) {
  const token = beginMount();
  container = rootEl;

  let loaded = await listExerciseLibrary();
  if (loaded.length === 0) {
    await seedExerciseLibraryIfEmpty();
    loaded = await listExerciseLibrary();
  }
  if (isStale(token)) return;
  library = loaded;

  render();
  // A workout survives navigating away, so the clock has to be restarted on
  // the way back in — otherwise it renders once and then sits frozen.
  if (session) startElapsedTicking();
}

// Stops everything that outlives a render. The in-progress workout itself is
// deliberately kept, so leaving this tab mid-session doesn't discard it.
export function unmountActiveSession() {
  stopElapsedTicking();
  // The dialog's Escape handler lives on document, so it outlives this page
  // unless removed here.
  document.removeEventListener('keydown', onLastTimeKeydown);
  lastTimeModal = null;
  for (const refs of exerciseRefs.values()) {
    for (const ctrl of refs.setsEls.values()) ctrl.closeWheel();
  }
  container = null;
}

function elapsedSeconds() {
  return session ? (Date.now() - session.realStartedAt.getTime()) / 1000 : 0;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startElapsedTicking() {
  stopElapsedTicking();
  elapsedTimerId = setInterval(tickClock, 1000);
}

function stopElapsedTicking() {
  if (elapsedTimerId) clearInterval(elapsedTimerId);
  elapsedTimerId = null;
}

// Repaints only the clock's text. The old code re-rendered the whole screen
// every second, which tore down open dropdowns, the search field and focus.
function tickClock() {
  if (!container || !session) return;
  const clock = container.querySelector('#elapsed-clock');
  if (clock) clock.textContent = formatMMSS(elapsedSeconds());
}

// ---------- structural render ----------
//
// Rebuilds the whole screen from scratch. Reserved for changes that actually
// add or remove a card — starting/finishing a workout, adding an exercise,
// opening/closing the picker or the "last time" modal. Every routine
// set-logging interaction (weight/reps edits, done-toggle, unit/mode change,
// add-set) goes through patchExerciseCard() instead, which never touches a
// sibling card or rebuilds this shell — that's what lets those interactions
// animate instead of flashing the whole screen.
function render() {
  if (!container) return;
  exerciseRefs = new Map();

  // Rebuilding the whole screen via innerHTML resets scroll to the top on
  // mobile browsers (most visibly iOS Safari) even though nothing about the
  // visible content above the fold changed — most jarring on "add exercise",
  // which used to always throw the user back up to the elapsed-clock header.
  const scrollY = window.scrollY;
  const restoreScroll = () => window.scrollTo(0, scrollY);

  if (!session) {
    container.innerHTML = `
      <div class="card" style="text-align:center;">
        <h2>מוכן להתחיל?</h2>
        <p class="text-muted">לחיצה תתחיל שעון אימון וסטופר מנוחה בין סטים.</p>
        <button class="btn btn-primary btn-block" id="start-workout-btn">התחלת אימון</button>
        <button class="btn btn-secondary btn-block" id="start-past-workout-btn" style="margin-top:8px;">הוספת אימון שכבר בוצע</button>
      </div>`;
    container.querySelector('#start-workout-btn').addEventListener('click', () => startWorkout());
    container.querySelector('#start-past-workout-btn').addEventListener('click', openPastWorkoutSheet);
    restoreScroll();
    return;
  }

  const isRetroactive = !isSameDay(session.startedAt, new Date());

  container.innerHTML = `
    <div class="card" style="text-align:center;">
      <h3 style="margin:0;">זמן אימון</h3>
      ${isRetroactive ? `<div class="text-muted" style="font-size:var(--text-sm);">${icon('calendar-days', { className: 'icon--sm' })} ${esc(formatDateHe(session.startedAt))}</div>` : ''}
      <div class="num" id="elapsed-clock" style="font-size:1.8rem; font-weight:var(--weight-bold); letter-spacing:var(--tracking-tight);">${formatMMSS(elapsedSeconds())}</div>
    </div>

    <div id="progress-slot"></div>

    <div id="exercise-list"></div>

    <button class="btn btn-outline btn-block" id="add-exercise-btn">+ הוספת תרגיל</button>
    <button class="btn btn-secondary btn-block" id="finish-workout-btn" style="margin-top:8px;">סיום אימון</button>

    ${picker.open ? renderPicker() : ''}
    ${lastTimeModal ? renderLastTimeModal() : ''}

    <div id="toast-slot" class="toast-slot" aria-live="polite"></div>
  `;

  const list = container.querySelector('#exercise-list');
  session.exercises.forEach((ex) => {
    list.appendChild(buildExerciseCard(ex));
  });

  applyFocusMode();
  restoreScroll();

  container.querySelector('#finish-workout-btn').addEventListener('click', finishWorkout);
  container.querySelector('#add-exercise-btn').addEventListener('click', () => {
    picker = { open: true, query: '', category: null };
    render();
    loadRecentExercises();
  });

  if (picker.open) wirePicker();
  if (lastTimeModal) wireLastTimeModal();
}

// ---------- workout progress indicator ----------

function patchProgressSlot({ current, totalSets, completedSets }) {
  if (!container) return;
  const slot = container.querySelector('#progress-slot');
  if (!slot) return;

  if (totalSets === 0) {
    slot.innerHTML = '';
    return;
  }

  const pct = Math.round((completedSets / totalSets) * 100);
  const label = current
    ? `תרגיל ${current.exIdx + 1} מתוך ${session.exercises.length} · סט ${current.setIdx + 1} מתוך ${current.setCount}`
    : 'כל הסטים הושלמו';
  const labelIcon = current ? '' : icon('party-popper', { className: 'icon--sm' });

  slot.innerHTML = `
    <div class="workout-progress">
      <div class="workout-progress-text">${labelIcon}${esc(label)}</div>
      <div class="workout-progress-bar"><div class="workout-progress-fill" style="width:${pct}%"></div></div>
    </div>`;
}

// ---------- toasts ----------

// `html` is always one of this module's own hardcoded strings (never user
// input), so innerHTML here is safe and is what lets a toast carry an icon.
function showToast(html) {
  const slot = container?.querySelector('#toast-slot');
  if (!slot) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = html;
  slot.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('toast--visible')));
  setTimeout(() => {
    el.classList.remove('toast--visible');
    setTimeout(() => el.remove(), 300);
  }, 1800);
}

// ---------- "last time" popup ----------

function renderLastTimeModal() {
  const { name, previous } = lastTimeModal;

  const body = !previous
    ? `<p class="text-muted">אין עדיין נתונים מפעם קודמת שביצעת את התרגיל הזה.</p>`
    : `
      <p class="text-muted" style="margin-top:-6px;">${formatDateHe(previous.workoutDate)}</p>
      ${setsTable(previous.sets)}`;

  return `
    <div class="modal-overlay" id="last-time-overlay">
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="last-time-title">
        <button class="modal-close" id="last-time-close" type="button" aria-label="סגירה">✕</button>
        <h3 id="last-time-title" style="color:var(--text);">${esc(name)}</h3>
        ${body}
      </div>
    </div>`;
}

function closeLastTimeModal() {
  lastTimeModal = null;
  document.removeEventListener('keydown', onLastTimeKeydown);
  render();
}

function onLastTimeKeydown(e) {
  if (e.key === 'Escape') closeLastTimeModal();
}

function wireLastTimeModal() {
  const overlay = container.querySelector('#last-time-overlay');
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeLastTimeModal();
  });
  container.querySelector('#last-time-close').addEventListener('click', closeLastTimeModal);

  // Escape is the expected way out of a dialog; there was no keyboard route
  // to close this at all before.
  document.removeEventListener('keydown', onLastTimeKeydown);
  document.addEventListener('keydown', onLastTimeKeydown);

  container.querySelector('#last-time-close').focus();
}

// ---------- exercise picker ----------

// Fetched fresh each time the picker opens (cheap — listWorkouts() shares
// the module-wide cached fetch in firestore.js) so "recent" always reflects
// the latest logged sessions, not just this workout so far.
async function loadRecentExercises() {
  const workouts = await listWorkouts(10);
  const seen = new Set();
  const names = [];
  for (const w of workouts) {
    for (const ex of w.exercises || []) {
      if (!seen.has(ex.name)) {
        seen.add(ex.name);
        names.push(ex.name);
      }
    }
  }
  recentExerciseNames = names;
  if (picker.open) render();
}

function renderPicker() {
  const q = picker.query.trim();
  const byCategory = picker.category ? library.filter((e) => e.category === picker.category) : library;
  const matches = byCategory.filter((e) => e.name.includes(q));
  const exactMatch = library.some((e) => e.name === q);

  // Skips exercises already in this session — the point is speeding up
  // what to add *next*, not re-suggesting what's already on screen.
  const alreadyAdded = new Set(session.exercises.map((e) => e.name));
  const recentEntries = recentExerciseNames
    .filter((name) => !alreadyAdded.has(name))
    .map((name) => library.find((e) => e.name === name))
    .filter(Boolean)
    .slice(0, 5);

  const pillRow = (label, categories) => `
    <div class="pill-row-label">${label}</div>
    <div class="pill-row">
      ${categories.map((c) => `<button class="pill ${picker.category === c ? 'active' : ''}" data-category="${c}">${c}</button>`).join('')}
    </div>`;

  return `
    <div class="card" id="picker-card">
      ${recentEntries.length ? `
        <div class="pill-row-label">לאחרונה</div>
        <div class="pill-row" style="margin-bottom:10px;">
          ${recentEntries.map((e) => `<button class="pill" data-pick="${esc(e.id)}">${esc(e.name)}</button>`).join('')}
        </div>
      ` : ''}
      <button class="pill ${!picker.category ? 'active' : ''}" data-category="" style="margin-bottom:10px;">הכל</button>
      ${CATEGORY_GROUPS.map((g) => pillRow(g.label, g.categories)).join('')}
      <input type="text" id="picker-input" class="search-bar" placeholder="חיפוש תרגיל..." value="${esc(picker.query)}"
        style="margin:10px 0;">
      <div id="picker-results">
        ${matches.map((e) => `
          <div class="row" style="gap:6px; margin-bottom:6px;">
            <button class="btn btn-secondary" style="flex:1;" data-pick="${esc(e.id)}">${esc(e.name)}</button>
            <button type="button" class="set-more-btn" data-edit-lib="${esc(e.id)}" aria-label="עריכת התרגיל">${icon('pencil', { className: 'icon--sm' })}</button>
          </div>`).join('')}
        ${matches.length === 0 ? emptyState('אין תרגילים בקטגוריה הזו.', { centered: true }) : ''}
        ${q && !exactMatch ? `<button class="btn btn-primary btn-block" id="picker-add-new">+ הוספת "${esc(q)}" כתרגיל חדש</button>` : ''}
      </div>
    </div>`;
}

function wirePicker() {
  const input = container.querySelector('#picker-input');
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  input.addEventListener('input', (e) => {
    picker.query = e.target.value;
    render();
  });
  container.querySelectorAll('[data-category]').forEach((btn) => {
    btn.addEventListener('click', () => {
      picker.category = btn.dataset.category || null;
      render();
    });
  });
  container.querySelectorAll('[data-pick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lib = library.find((e) => e.id === btn.dataset.pick);
      addExerciseToSession(lib);
    });
  });
  container.querySelectorAll('[data-edit-lib]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const lib = library.find((l) => l.id === btn.dataset.editLib);
      if (!lib) return;
      openExerciseEditSheet(lib, {
        onSaved: async () => {
          library = await listExerciseLibrary();
          render();
        },
      });
    });
  });
  const addNewBtn = container.querySelector('#picker-add-new');
  if (addNewBtn) {
    addNewBtn.addEventListener('click', async () => {
      const name = picker.query.trim();
      const category = picker.category || '';
      const id = await addExerciseToLibrary({ name, category, defaultWeightMode: 'total' });
      const lib = { id, name, category, defaultWeightMode: 'total', isCustom: true };
      library.push(lib);
      addExerciseToSession(lib);
    });
  }
}

async function addExerciseToSession(lib) {
  const entry = {
    _uid: nextUid(),
    name: lib.name,
    category: lib.category || '',
    weightMode: lib.defaultWeightMode || 'total',
    weightUnit: lib.defaultUnit || 'kg',
    previous: null,
    prevLoaded: false,
    history: null,
    sets: [],
  };
  session.exercises.push(entry);
  picker = { open: false, query: '', category: null };
  render();

  const [prev, hist] = await Promise.all([
    getLastPerformance(lib.name),
    getExerciseHistory(lib.name),
  ]);
  entry.previous = prev;
  entry.history = hist;
  entry.prevLoaded = true;
  // The exercise card built above almost certainly has no sets yet at this
  // point, so a patch (not a full render) is enough to pick up the freshly
  // loaded previous-performance data.
  patchExerciseCard(entry);
}

// Unit and weighting belong to the exercise, so a change applies to every set
// already logged in this session as well as future ones.
//
// The number is deliberately not converted: it is the figure read off the
// machine, and only its label changes. Previously the change was applied
// silently when a set was marked done, so a set entered and displayed as
// 20 ק"ג could be stored as 20 lb without ever being shown that way.
function setExerciseWeighting(ex, patch) {
  Object.assign(ex, patch);
  ex.sets.forEach((set) => Object.assign(set, patch));
}

// Unlike weighting mode, a unit change converts the number itself (20 kg
// becomes 44.1 lb, not "20 lb") — see format.js#convertWeight.
function convertExerciseWeightUnit(ex, newUnit) {
  const oldUnit = ex.weightUnit;
  if (newUnit === oldUnit) return;
  ex.weightUnit = newUnit;
  ex.sets.forEach((set) => {
    set.weight = convertWeight(set.weight, oldUnit, newUnit);
    set.weightUnit = newUnit;
  });
}

// ---------- exercise card (built once; patched afterwards) ----------

function buildExerciseCard(ex) {
  const el = document.createElement('div');
  el.className = 'card';

  // Purely manual — nothing here ever sets ex.collapsed automatically. It
  // used to auto-collapse the moment every set was marked done, which meant
  // finishing a set could unexpectedly close the whole card out from under
  // the user; now the chevron is the only thing that ever changes this.
  const isOpen = !ex.collapsed;
  const exNum = String(session.exercises.indexOf(ex) + 1).padStart(2, '0');
  const { done, total } = exerciseSetsSummary(ex);
  const allDone = total > 0 && done === total;

  el.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
      <button type="button" class="set-more-btn exercise-drag-handle" data-role="drag-handle" aria-label="גרירה לשינוי סדר התרגילים" style="flex:none;">${icon('grip-vertical', { className: 'icon--sm' })}</button>
      <span class="exercise-num" data-role="exercise-num">${esc(exNum)}</span>
      <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:2px;">
        <span class="exercise-name">${esc(ex.name)}</span>
        <span class="exercise-meta${allDone ? ' exercise-meta--done' : ''}" data-role="exercise-meta">${esc(ex.category)} · ${done}/${total} סטים</span>
      </div>
      <button type="button" class="set-more-btn" data-last-time aria-label="פעם קודמת">${icon('clock', { className: 'icon--sm' })}</button>
      <button type="button" class="set-more-btn set-more-btn--danger" data-delete-exercise aria-label="מחיקת התרגיל">${icon('trash-2', { className: 'icon--sm' })}</button>
      <button type="button" class="set-more-btn" data-collapse-toggle aria-label="כיווץ/הרחבת התרגיל">
        <span class="history-chevron${isOpen ? ' history-chevron--open' : ''}" data-collapse-chevron aria-hidden="true">⌄</span>
      </button>
    </div>
    <div class="history-detail${isOpen ? ' history-detail--open' : ''}" data-exercise-detail>
      <div class="history-detail-inner">
        <div class="row" style="margin-bottom:12px; justify-content:flex-start; gap:10px; flex-wrap:wrap;">
          ${toggleGroup({
            name: 'mode',
            active: ex.weightMode,
            label: 'אופן שקילה',
            groupAttrs: 'data-weight-mode-group',
            options: [{ value: 'total', label: 'טוטאל' }, { value: 'perSide', label: 'כל צד' }],
          })}
          ${toggleGroup({
            name: 'unit',
            active: ex.weightUnit,
            label: 'יחידת משקל',
            groupAttrs: 'data-weight-unit-group',
            options: [{ value: 'kg', label: 'ק"ג' }, { value: 'lb', label: 'lb' }],
          })}
        </div>
        <div class="set-table-header"><span>סט</span><span>${esc(unitLabel(ex.weightUnit).trim() || 'ק"ג')}</span><span>חזרות</span><span></span></div>
        <div class="sets-list"></div>
        <button class="btn btn-dashed" data-add-set>+ סט</button>
      </div>
    </div>
  `;

  el.querySelector('[data-last-time]').addEventListener('click', () => {
    lastTimeModal = { name: ex.name, previous: ex.previous };
    render();
  });

  el.querySelector('[data-delete-exercise]').addEventListener('click', () => {
    requestDeleteExercise(ex);
  });

  el.querySelector('[data-collapse-toggle]').addEventListener('click', () => {
    ex.collapsed = !ex.collapsed;
    patchExerciseCollapse(ex);
  });

  wireExerciseDragHandle(el.querySelector('[data-role="drag-handle"]'), ex, el);

  const modeGroupEl = el.querySelector('[data-weight-mode-group]');
  const unitGroupEl = el.querySelector('[data-weight-unit-group]');
  modeGroupEl.classList.add('toggle-group--live');
  unitGroupEl.classList.add('toggle-group--live');

  modeGroupEl.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      setExerciseWeighting(ex, { weightMode: btn.dataset.mode });
      patchExerciseCard(ex);
    });
  });
  unitGroupEl.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      convertExerciseWeightUnit(ex, btn.dataset.unit);
      patchExerciseCard(ex);
    });
  });

  el.querySelector('[data-add-set]').addEventListener('click', () => {
    const filled = prefillForNewSet(ex);
    ex.sets.push({
      _uid: nextUid(),
      type: filled.type,
      weight: filled.weight,
      reps: filled.reps,
      notes: filled.notes,
      done: false,
      isPR: false,
      weightMode: ex.weightMode,
      weightUnit: ex.weightUnit,
    });
    patchExerciseCard(ex);
  });

  const refs = {
    root: el,
    setsListEl: el.querySelector('.sets-list'),
    setsEls: new Map(),
    modeGroupEl,
    unitGroupEl,
    detailEl: el.querySelector('[data-exercise-detail]'),
    chevronEl: el.querySelector('[data-collapse-chevron]'),
    metaEl: el.querySelector('[data-role="exercise-meta"]'),
  };
  exerciseRefs.set(ex._uid, refs);

  patchToggleGroup(modeGroupEl, ex.weightMode);
  patchToggleGroup(unitGroupEl, ex.weightUnit);
  syncSetRows(ex, refs);

  return el;
}

// Precedence: repeat this session's last set for the exercise; else the same
// set position from the last time it was performed; else a sane default.
// Previously this only ever looked at *this* session, so the first set of a
// freshly added exercise ignored prior-session data entirely.
function prefillForNewSet(ex) {
  const newIdx = ex.sets.length;
  const last = ex.sets.at(-1);
  if (last) {
    // A brand-new top-level set repeating 'dropset' from whatever the last
    // stage happened to be would silently start it as an (empty, confusing)
    // drop-set parent — that's only ever meant to happen when the user
    // explicitly picks it, so fall back to 'working' here.
    const type = last.type === 'dropset' ? 'working' : last.type;
    return { type, weight: last.weight, reps: last.reps, notes: '' };
  }
  const prevSet = ex.prevLoaded ? ex.previous?.sets?.[newIdx] : null;
  if (prevSet) {
    const weight = convertWeight(prevSet.weight, prevSet.weightUnit || 'kg', ex.weightUnit);
    const type = prevSet.type === 'dropset' ? 'working' : (prevSet.type ?? 'working');
    return { type, weight, reps: prevSet.reps, notes: '' };
  }
  return { type: 'working', weight: 20, reps: 8, notes: '' };
}

// Applies every routine change (weight/reps edits, done-toggle, unit/mode
// change, add-set) for one exercise without rebuilding its card or any
// sibling card — the prerequisite for every animation in this redesign.
function patchExerciseCard(ex) {
  const refs = exerciseRefs.get(ex._uid);
  if (!refs) return;
  syncSetRows(ex, refs);
  patchToggleGroup(refs.modeGroupEl, ex.weightMode);
  patchToggleGroup(refs.unitGroupEl, ex.weightUnit);
  patchExerciseMeta(ex, refs);
  applyFocusMode();
  patchExerciseCollapse(ex);
}

// Counts only loggable sets (bare drop-set headers carry no data of their
// own, same exclusion persistablePosition uses for saving).
function exerciseSetsSummary(ex) {
  const loggable = ex.sets.filter((s) => !hasChildren(ex, s));
  return { done: loggable.filter((s) => s.done).length, total: loggable.length };
}

function patchExerciseMeta(ex, refs) {
  if (!refs.metaEl) return;
  const { done, total } = exerciseSetsSummary(ex);
  const allDone = total > 0 && done === total;
  refs.metaEl.textContent = `${ex.category} · ${done}/${total} סטים`;
  refs.metaEl.classList.toggle('exercise-meta--done', allDone);
}

// An exercise can be minimized to just its header — the point is that a
// finished exercise doesn't have to keep eating the whole screen once
// you've moved on. Purely manual: only the chevron (data-collapse-toggle)
// ever changes ex.collapsed.
function patchExerciseCollapse(ex) {
  const refs = exerciseRefs.get(ex._uid);
  if (!refs) return;
  const isOpen = !ex.collapsed;
  refs.detailEl.classList.toggle('history-detail--open', isOpen);
  refs.chevronEl.classList.toggle('history-chevron--open', isOpen);
}

// ---------- drop sets: a set with children becomes a bare group header,
// its own weight/reps no longer shown or persisted — every stage lives on
// a child instead. Children are never DOM-nested inside their parent; they
// stay flat, ordinary siblings in ex.sets/#sets-list (just indented via
// CSS), which is what lets all the existing uid-keyed diffing below keep
// working unchanged. A child is simply a set with `parentUid` set; a
// parent is derived (never stored) as "any set something else points at".

function hasChildren(ex, set) {
  return ex.sets.some((s) => s.parentUid === set._uid);
}

function childrenOf(ex, set) {
  return ex.sets.filter((s) => s.parentUid === set._uid);
}

function computeSetRole(ex, set) {
  if (hasChildren(ex, set)) return 'parent';
  if (set.parentUid) return 'child';
  return 'regular';
}

// Position among sets that actually carry loggable data (skips bare parent
// headers) — matches how finishWorkout() numbers sets when saving, so
// "previous performance" lookups against last time's flat saved array stay
// aligned even though the live in-session list also contains headers.
function persistablePosition(ex, set) {
  let pos = 0;
  for (const s of ex.sets) {
    if (s === set) return pos;
    if (!hasChildren(ex, s)) pos += 1;
  }
  return pos;
}

// Position among top-level slots only (a drop-set group's children don't
// get their own slot — the group counts as one, via its header/parent). Used
// purely for the number shown next to a row, not for persistence lookups
// (see persistablePosition for that).
function topLevelPosition(ex, set) {
  let pos = 0;
  for (const s of ex.sets) {
    if (s.parentUid) continue;
    if (s === set) return pos;
    pos += 1;
  }
  return pos;
}

// "3" for a regular set or a drop-set group header, "3.1"/"3.2" for its
// stages — mirrors how the reference design numbers a drop set's children
// against their parent.
function setIndexLabel(ex, set, role) {
  if (role === 'child') {
    const parent = ex.sets.find((s) => s._uid === set.parentUid);
    const childIdx = childrenOf(ex, parent).indexOf(set);
    return `${topLevelPosition(ex, parent) + 1}.${childIdx + 1}`;
  }
  return String(topLevelPosition(ex, set) + 1);
}

// Appends a new stage after a drop set's last existing stage (or right
// after the parent itself if this is its first). Prefills from the
// previous stage, same "repeat the last one" convention as a plain +סט.
function addDropStage(ex, parent) {
  const children = childrenOf(ex, parent);
  const last = children.at(-1);
  const insertAfter = last || parent;
  ex.sets.splice(ex.sets.indexOf(insertAfter) + 1, 0, {
    _uid: nextUid(),
    parentUid: parent._uid,
    type: 'dropset',
    weight: last ? last.weight : parent.weight,
    reps: last ? last.reps : parent.reps,
    notes: '',
    done: false,
    isPR: false,
    weightMode: parent.weightMode,
    weightUnit: parent.weightUnit,
  });
  parent.collapsed = false; // adding a stage should always reveal it
  patchExerciseCard(ex);
}

// Diffs ex.sets (keyed by uid, not index — index breaks the moment a set is
// removed or inserted anywhere but the end, which delete/duplicate now do)
// against the card's known rows: builds+animates-in new rows, repositions
// existing ones whose index moved (a delete shifts everything after it),
// patches every row's data, and drops rows for sets no longer present.
function syncSetRows(ex, refs) {
  const currentUids = new Set(ex.sets.map((s) => s._uid));
  for (const [uid, ctrl] of refs.setsEls) {
    if (!currentUids.has(uid)) {
      ctrl.closeWheel?.(); // drop-set header rows have no wheel to close
      ctrl.row.remove();
      refs.setsEls.delete(uid);
    }
  }

  ex.sets.forEach((set, idx) => {
    let ctrl = refs.setsEls.get(set._uid);
    const role = computeSetRole(ex, set);
    // A regular row also needs rebuilding the moment its type flips to/from
    // 'dropset' — that's what shows or hides its "+ ירידה" button, and
    // patchSetRow never touches that element (only buildSetRow creates it).
    const isDropsetType = set.type === 'dropset';
    const needsRebuild = ctrl && (ctrl.role !== role || (role === 'regular' && ctrl.builtAsDropsetType !== isDropsetType));
    if (needsRebuild) {
      // The row's whole DOM shape differs by role (header vs. full set row)
      // — patching one into the other isn't meaningful, so rebuild instead.
      ctrl.closeWheel?.();
      ctrl.row.remove();
      refs.setsEls.delete(set._uid);
      ctrl = null;
    }
    const nodeAtIdx = refs.setsListEl.children[idx] || null;
    if (!ctrl) {
      ctrl = role === 'parent' ? buildDropSetHeaderRow(ex, set) : buildSetRow(ex, set, role);
      ctrl.role = role;
      ctrl.builtAsDropsetType = isDropsetType;
      refs.setsEls.set(set._uid, ctrl);
      refs.setsListEl.insertBefore(ctrl.row, nodeAtIdx);
      // Two rAFs, not one: the browser must paint the "entering" state before
      // the class is removed, or the transition to the resting state never
      // plays and the row just appears instantly.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        ctrl.row.classList.remove('set-row--entering');
      }));
    } else if (nodeAtIdx !== ctrl.row) {
      // A delete/duplicate elsewhere in the list shifted this set's index —
      // move its existing row rather than rebuilding it.
      refs.setsListEl.insertBefore(ctrl.row, nodeAtIdx);
    }
    if (role === 'parent') {
      patchDropSetHeaderRow(ex, set, ctrl);
    } else {
      patchSetRow(ex, set, persistablePosition(ex, set), ctrl);
      if (role === 'child') {
        // Not the `hidden` attribute — .set-row's own `display: flex` rule
        // and the UA's `[hidden] { display: none }` rule are equal
        // specificity, and the author rule wins the tie, so `hidden` was
        // silently having no visual effect at all.
        const parent = ex.sets.find((s) => s._uid === set.parentUid);
        ctrl.row.classList.toggle('set-row--group-collapsed', !!parent?.collapsed);
      }
    }
  });
}

function buildSetRow(ex, set, role) {
  const row = document.createElement('div');
  row.className = role === 'child' ? 'set-row set-row--entering set-row--child' : 'set-row set-row--entering';

  // A child stage is implicitly a drop set already — no type selector, and
  // no point re-labeling it warmup/working. A regular set gets the normal
  // type pill, plus (only once it's actually tagged as a drop set) a button
  // to start turning it into a group by adding its first stage.
  const typeAndAddStage = role === 'child' ? '' : `
    ${toggleGroup({
      name: 'type',
      active: set.type,
      label: 'סוג סט',
      groupAttrs: 'data-set-type-group',
      options: SET_TYPES.map((t) => ({ value: t.id, label: t.label })),
    })}
    ${set.type === 'dropset' ? `<button type="button" class="btn-mini-dashed" data-role="add-stage-btn">+ ירידה</button>` : ''}
  `;

  row.innerHTML = `
    <div class="set-row-main">
      <span class="set-index" data-role="set-index">${esc(setIndexLabel(ex, set, role))}</span>
      <div class="set-field set-field--weight" data-role="weight-slot"></div>
      <button type="button" class="set-field set-field--reps" data-role="reps-trigger" aria-expanded="false">
        <span class="reps-value num">${esc(set.reps)}</span>
      </button>
      <button type="button" class="set-done-btn${set.done ? ' set-done-btn--done' : ''}" data-role="done-btn" aria-label="סימון סט כבוצע">
        <span class="done-glyph">✓</span>
      </button>
    </div>
    <div class="wheel-picker-slot" data-role="wheel-slot" hidden></div>
    <div class="set-row-meta">
      ${typeAndAddStage}
      <span class="set-row-previous" data-role="previous" hidden></span>
      <span class="set-row-notes" data-role="notes" hidden></span>
      <button type="button" class="set-more-btn set-more-btn--meta" data-role="more-btn" aria-label="עוד אפשרויות לסט">⋯</button>
      <span class="pr-badge" data-role="pr-badge" ${set.isPR ? '' : 'hidden'}>שיא</span>
    </div>
  `;

  const typeGroupEl = row.querySelector('[data-set-type-group]');
  if (typeGroupEl) {
    typeGroupEl.classList.add('toggle-group--live', 'toggle-group--compact');
    patchToggleGroup(typeGroupEl, set.type);
    typeGroupEl.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        set.type = btn.dataset.type;
        patchToggleGroup(typeGroupEl, set.type);
        patchExerciseCard(ex); // type change may add/remove the "+ ירידה" button, which needs a rebuild
      });
    });
  }

  row.querySelector('[data-role="add-stage-btn"]')?.addEventListener('click', () => {
    addDropStage(ex, set);
  });

  const weightSlot = row.querySelector('[data-role="weight-slot"]');
  const numeric = mountNumericField(weightSlot, {
    value: set.weight,
    unitLabel: unitLabel(set.weightUnit).trim(),
    onCommit: (v) => { set.weight = v; },
  });

  const repsTrigger = row.querySelector('[data-role="reps-trigger"]');
  const wheelSlot = row.querySelector('[data-role="wheel-slot"]');
  let wheel = null;

  function closeWheel() {
    if (!wheel) return;
    wheel.destroy();
    wheel = null;
    wheelSlot.hidden = true;
    wheelSlot.innerHTML = '';
    repsTrigger.classList.remove('set-field--open');
    repsTrigger.setAttribute('aria-expanded', 'false');
    if (openWheelCloser === closeWheel) openWheelCloser = null;
  }

  repsTrigger.addEventListener('click', () => {
    if (wheel) { closeWheel(); return; }
    if (openWheelCloser) openWheelCloser();
    wheelSlot.hidden = false;
    repsTrigger.classList.add('set-field--open');
    repsTrigger.setAttribute('aria-expanded', 'true');
    wheel = mountWheelPicker(wheelSlot, {
      min: 0,
      max: 60,
      value: set.reps,
      onCommit: (v) => {
        set.reps = v;
        repsTrigger.querySelector('.reps-value').textContent = v;
      },
    });
    openWheelCloser = closeWheel;
  });

  const doneBtn = row.querySelector('[data-role="done-btn"]');
  doneBtn.addEventListener('click', () => {
    closeWheel();
    onToggleDone(ex, set);
  });

  const ctrl = {
    row,
    typeGroupEl,
    numeric,
    repsTrigger,
    doneBtn,
    indexEl: row.querySelector('[data-role="set-index"]'),
    prBadgeEl: row.querySelector('[data-role="pr-badge"]'),
    previousEl: row.querySelector('[data-role="previous"]'),
    notesEl: row.querySelector('[data-role="notes"]'),
    closeWheel,
  };

  row.querySelector('[data-role="more-btn"]').addEventListener('click', () => {
    closeWheel();
    openSetDetailSheet(ex, set, ctrl);
  });

  return ctrl;
}

function patchSetRow(ex, set, idx, ctrl) {
  const wasDone = ctrl.row.classList.contains('set-row--done');

  patchToggleGroup(ctrl.typeGroupEl, set.type);
  ctrl.numeric.setUnitLabel(unitLabel(set.weightUnit).trim());
  ctrl.numeric.setValue(set.weight);
  ctrl.repsTrigger.querySelector('.reps-value').textContent = set.reps;
  ctrl.indexEl.textContent = setIndexLabel(ex, set, ctrl.role);

  ctrl.doneBtn.classList.toggle('set-done-btn--done', set.done);
  ctrl.row.classList.toggle('set-row--done', set.done);

  if (set.done && !wasDone) {
    // Restart the celebrate animation even if it's already mid-run (e.g. the
    // user toggled done off and back on quickly).
    ctrl.row.classList.remove('set-row--celebrate');
    void ctrl.row.offsetWidth;
    ctrl.row.classList.add('set-row--celebrate');
  }

  const wasPR = !ctrl.prBadgeEl.hidden;
  ctrl.prBadgeEl.hidden = !set.isPR;
  if (set.isPR && !wasPR) {
    ctrl.prBadgeEl.classList.remove('pr-badge--celebrate');
    void ctrl.prBadgeEl.offsetWidth;
    ctrl.prBadgeEl.classList.add('pr-badge--celebrate');
  }

  const prev = ex.prevLoaded ? ex.previous?.sets?.[idx] : null;
  if (prev) {
    ctrl.previousEl.hidden = false;
    ctrl.previousEl.textContent = `פעם קודמת: ${formatWeight(prev)} × ${prev.reps}`;
  } else {
    ctrl.previousEl.hidden = true;
  }

  if (set.notes) {
    ctrl.notesEl.hidden = false;
    // set.notes is free text the user typed, so it must stay escaped even
    // though the icon markup alongside it doesn't.
    ctrl.notesEl.innerHTML = `${icon('sticky-note', { className: 'icon--sm' })} ${esc(set.notes)}`;
  } else {
    ctrl.notesEl.hidden = true;
  }
}

// A drop set's parent renders as a bare group header once it has any
// stages — it never carried its own loggable weight/reps, so there's
// nothing to show or edit on it directly beyond the group controls.
function buildDropSetHeaderRow(ex, set) {
  const row = document.createElement('div');
  row.className = 'drop-set-header set-row--entering';

  row.innerHTML = `
    <button type="button" class="set-more-btn" data-role="dropset-toggle" aria-label="כיווץ/הרחבת דרופ סט">
      <span class="history-chevron" data-role="dropset-chevron" aria-hidden="true">⌄</span>
    </button>
    <span class="set-index" data-role="dropset-index">${esc(setIndexLabel(ex, set, 'parent'))}</span>
    <span style="flex:1;"><span class="drop-set-pill" data-role="dropset-label">דרופ סט</span></span>
    <button type="button" class="btn-mini-dashed" data-role="add-stage-btn">+ ירידה</button>
    <button type="button" class="set-more-btn set-more-btn--danger" data-role="delete-group-btn" aria-label="מחיקת דרופ סט">${icon('trash-2', { className: 'icon--sm' })}</button>
  `;

  row.querySelector('[data-role="dropset-toggle"]').addEventListener('click', () => {
    set.collapsed = !set.collapsed;
    patchExerciseCard(ex);
  });

  row.querySelector('[data-role="add-stage-btn"]').addEventListener('click', () => {
    addDropStage(ex, set);
  });

  row.querySelector('[data-role="delete-group-btn"]').addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'מחיקת דרופ סט',
      message: 'למחוק את הדרופ סט וכל השלבים שבו? הפעולה לא הפיכה.',
      confirmLabel: 'מחיקה',
      danger: true,
    });
    if (!confirmed) return;
    [set, ...childrenOf(ex, set)].forEach((s) => {
      const idx = ex.sets.indexOf(s);
      if (idx !== -1) ex.sets.splice(idx, 1);
    });
    patchExerciseCard(ex);
  });

  return {
    row,
    chevronEl: row.querySelector('[data-role="dropset-chevron"]'),
    labelEl: row.querySelector('[data-role="dropset-label"]'),
    indexEl: row.querySelector('[data-role="dropset-index"]'),
  };
}

function patchDropSetHeaderRow(ex, set, ctrl) {
  ctrl.chevronEl.classList.toggle('history-chevron--open', !set.collapsed);
  ctrl.row.classList.toggle('drop-set-header--expanded', !set.collapsed);
  ctrl.indexEl.textContent = setIndexLabel(ex, set, 'parent');
  // Collapsed hides every stage, so the header stands in for the first one —
  // a bare "דרופ סט" label with nothing else visible reads as empty/broken.
  const first = childrenOf(ex, set)[0];
  ctrl.labelEl.textContent = (set.collapsed && first)
    ? `דרופ סט: ${formatWeight(first)} × ${first.reps}`
    : 'דרופ סט';
}

// Always confirms, unlike requestDeleteSet — removing a whole exercise loses
// every set logged under it (done or not), and the button sits right in the
// card header where a mis-tap while reaching for something else is exactly
// the accident this is meant to guard against.
function requestDeleteExercise(ex) {
  if (!confirm(`למחוק את התרגיל "${ex.name}" מהאימון?`)) return;
  const idx = session.exercises.indexOf(ex);
  if (idx === -1) return;
  session.exercises.splice(idx, 1);
  render();
}

// Playlist-style reordering: the dragged card follows the pointer via a
// transform, and the moment its midpoint crosses a neighbor's midpoint,
// session.exercises and #exercise-list's DOM order both update immediately
// (not just on release) — so the two never have a chance to disagree, and
// there's nothing separate to "commit" on pointerup.
function wireExerciseDragHandle(handleEl, ex, cardEl) {
  handleEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handleEl.setPointerCapture(e.pointerId);
    exerciseDrag = { exUid: ex._uid, pointerId: e.pointerId, cardEl, grabStartClientY: e.clientY };
    cardEl.classList.add('exercise-card--dragging');
  });

  handleEl.addEventListener('pointermove', (e) => {
    if (!exerciseDrag || exerciseDrag.pointerId !== e.pointerId) return;
    cardEl.style.transform = `translateY(${e.clientY - exerciseDrag.grabStartClientY}px)`;

    const list = container.querySelector('#exercise-list');
    const idx = session.exercises.indexOf(ex);
    const draggedMidY = cardEl.getBoundingClientRect().top + cardEl.offsetHeight / 2;

    const prevEx = session.exercises[idx - 1];
    const prevEl = prevEx && exerciseRefs.get(prevEx._uid)?.root;
    if (prevEl) {
      const prevRect = prevEl.getBoundingClientRect();
      if (draggedMidY < prevRect.top + prevRect.height / 2) {
        [session.exercises[idx - 1], session.exercises[idx]] = [session.exercises[idx], session.exercises[idx - 1]];
        list.insertBefore(cardEl, prevEl);
        cardEl.style.transform = '';
        exerciseDrag.grabStartClientY = e.clientY;
        return;
      }
    }

    const nextEx = session.exercises[idx + 1];
    const nextEl = nextEx && exerciseRefs.get(nextEx._uid)?.root;
    if (nextEl) {
      const nextRect = nextEl.getBoundingClientRect();
      if (draggedMidY > nextRect.top + nextRect.height / 2) {
        [session.exercises[idx], session.exercises[idx + 1]] = [session.exercises[idx + 1], session.exercises[idx]];
        list.insertBefore(cardEl, nextEl.nextSibling);
        cardEl.style.transform = '';
        exerciseDrag.grabStartClientY = e.clientY;
      }
    }
  });

  function endDrag(e) {
    if (!exerciseDrag || exerciseDrag.pointerId !== e.pointerId) return;
    cardEl.style.transform = '';
    cardEl.classList.remove('exercise-card--dragging');
    exerciseDrag = null;
  }
  handleEl.addEventListener('pointerup', endDrag);
  handleEl.addEventListener('pointercancel', endDrag);
}

function requestDeleteSet(ex, set) {
  const idx = ex.sets.indexOf(set);
  if (idx === -1) return;
  ex.sets.splice(idx, 1);
  patchExerciseCard(ex);
}

function duplicateSet(ex, set) {
  const idx = ex.sets.indexOf(set);
  if (idx === -1) return;
  ex.sets.splice(idx + 1, 0, {
    _uid: nextUid(),
    parentUid: set.parentUid, // a duplicated stage stays in the same drop set
    type: set.type,
    weight: set.weight,
    reps: set.reps,
    notes: set.notes || '',
    done: false,
    isPR: false,
    weightMode: set.weightMode,
    weightUnit: set.weightUnit,
  });
  patchExerciseCard(ex);
}

// Secondary detail view for one set — reached via the row's "⋯" button so
// the fast inline path (tap weight/reps directly on the row) stays the
// primary way to log a set. Weight/reps/notes commit live to `set`, same as
// on the row itself; Save and Cancel are therefore equivalent here (there is
// no draft state anywhere else in this app either), and only exist as two
// clearly-labelled ways to close, matching the spec's closing behaviour.
function openSetDetailSheet(ex, set, ctrl) {
  // Position among loggable sets only (skips bare drop-set headers), so
  // both the label here and the "previous performance" lookup line up with
  // how finishWorkout() actually numbers/saves sets — see persistablePosition.
  const idx = persistablePosition(ex, set);

  openBottomSheet({
    ariaLabel: `${ex.name}, סט ${idx + 1}`,
    render(body, sheetApi) {
      const prev = ex.prevLoaded ? ex.previous?.sets?.[idx] : null;

      body.innerHTML = `
        <h3 style="margin:0 0 2px; color:var(--text);">${esc(ex.name)}</h3>
        <p class="text-muted" style="margin:0 0 10px;">
          סט ${idx + 1}${set.isPR ? ` · <span class="pr-badge">שיא</span>` : ''}
        </p>

        <div class="sheet-field-label">משקל</div>
        <div data-role="sheet-weight"></div>

        <div class="sheet-field-label">חזרות</div>
        <div data-role="sheet-reps"></div>

        <div class="sheet-field-label">הערות (אופציונלי)</div>
        <textarea data-role="sheet-notes" rows="2" class="search-bar" style="width:100%; resize:vertical;"
          placeholder="לדוגמה: עם עזרה, שלילי איטי, כישלון">${esc(set.notes || '')}</textarea>

        ${prev ? `
          <div class="sheet-field-label" style="margin-top:18px;">פעם קודמת</div>
          <p class="text-muted" style="margin:0;">${esc(formatWeight(prev))} × ${esc(prev.reps)} · ${esc(formatDateHe(ex.previous.workoutDate))}</p>
        ` : ''}

        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary" data-role="sheet-duplicate">שכפול סט</button>
          <button type="button" class="btn btn-danger" data-role="sheet-delete">מחיקת סט</button>
        </div>
        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary" data-role="sheet-cancel">ביטול</button>
          <button type="button" class="btn btn-primary" data-role="sheet-save">שמירה</button>
        </div>
      `;

      mountNumericField(body.querySelector('[data-role="sheet-weight"]'), {
        value: set.weight,
        unitLabel: unitLabel(set.weightUnit).trim(),
        onCommit: (v) => { set.weight = v; },
      });

      mountWheelPicker(body.querySelector('[data-role="sheet-reps"]'), {
        min: 0,
        max: 60,
        value: set.reps,
        onCommit: (v) => { set.reps = v; },
      });

      body.querySelector('[data-role="sheet-notes"]').addEventListener('input', (e) => {
        set.notes = e.target.value;
      });

      const closeSheetAndPatch = () => { sheetApi.close(); };
      body.querySelector('[data-role="sheet-cancel"]').addEventListener('click', closeSheetAndPatch);
      body.querySelector('[data-role="sheet-save"]').addEventListener('click', closeSheetAndPatch);

      body.querySelector('[data-role="sheet-duplicate"]').addEventListener('click', () => {
        duplicateSet(ex, set);
        sheetApi.close();
      });

      body.querySelector('[data-role="sheet-delete"]').addEventListener('click', () => {
        if (set.done && !confirm('הסט הזה כבר סומן כהושלם. למחוק בכל זאת?')) return;
        requestDeleteSet(ex, set);
        sheetApi.close();
      });
    },
    onClose() {
      // Covers weight/reps/notes edits made while the sheet was open —
      // delete/duplicate already patch immediately on their own.
      if (exerciseRefs.has(ex._uid)) patchExerciseCard(ex);
    },
  });
}

// The current set is the first not-done set, scanning exercises in order —
// everything before it recedes as done, everything after stays subtle, so
// the user always knows where they are without reading every row. The same
// scan tallies overall progress, so the two never drift out of sync.
// Recomputed from scratch on every call — never cached, never assumed —
// so it's always in sync with the actual done/not-done state regardless of
// what changed (a toggle, a delete, an insert, an undo). Exactly one row
// (the first not-done set, scanning exercises in order) is ever "current";
// everything before it is done, everything after it is upcoming.
function applyFocusMode() {
  if (!session) return;

  let currentAssigned = false;
  let current = null; // { exIdx, setIdx, setCount }
  let totalSets = 0;
  let completedSets = 0;

  session.exercises.forEach((ex, exIdx) => {
    const refs = exerciseRefs.get(ex._uid);
    const loggableSets = ex.sets.filter((s) => !hasChildren(ex, s));
    loggableSets.forEach((set, setIdx) => {
      // A bare drop-set header (skipped via loggableSets above) carries no
      // weight/reps/done of its own — nothing here to focus on or count.
      totalSets += 1;
      if (set.done) completedSets += 1;

      const ctrl = refs?.setsEls.get(set._uid);
      ctrl?.row.classList.remove('set-row--active', 'set-row--upcoming');
      if (set.done) return;

      if (!currentAssigned) {
        currentAssigned = true;
        current = { exIdx, setIdx, setCount: loggableSets.length };
        ctrl?.row.classList.add('set-row--active');
      } else {
        ctrl?.row.classList.add('set-row--upcoming');
      }
    });
  });

  patchProgressSlot({ current, totalSets, completedSets });
}

function onToggleDone(ex, set) {
  set.done = !set.done;
  if (set.done) {
    const isNewPR = computePR(ex, set);
    set.isPR = isNewPR;
    if (navigator.vibrate) navigator.vibrate(isNewPR ? [20, 40, 20] : 15);
    if (isNewPR) showToast(`${icon('trophy', { className: 'icon--sm' })} שיא חדש!`);
  }
  patchExerciseCard(ex);
}

function computePR(ex, set) {
  const history = ex.history || [];
  const bestPrev = history.flatMap((h) => h.sets || [])
    .filter((s) => s.weightMode === set.weightMode && (s.weightUnit || 'kg') === set.weightUnit)
    .reduce((max, s) => Math.max(max, s.weight), 0);
  return set.weight > bestPrev;
}

// ---------- timers ----------

function startWorkout(customDate) {
  const real = new Date();
  session = { startedAt: customDate || real, realStartedAt: real, exercises: [] };
  render();
  startElapsedTicking();
}

// Bottom sheet for logging a workout that already happened — lets the
// saved date differ from today without touching the live elapsed timer
// (that keeps ticking off session.realStartedAt regardless).
function openPastWorkoutSheet() {
  openBottomSheet({
    ariaLabel: 'הוספת אימון שכבר בוצע',
    render(body, sheetApi) {
      const todayStr = dateInputValue(new Date());
      body.innerHTML = `
        <h3 style="margin:0 0 14px; color:var(--text);">אימון שכבר בוצע</h3>
        <div class="sheet-field-label">תאריך האימון</div>
        <input type="date" id="past-date-input" class="search-bar" value="${todayStr}" max="${todayStr}" style="margin-bottom:14px;">
        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary" id="past-cancel-btn">ביטול</button>
          <button type="button" class="btn btn-primary" id="past-start-btn">התחלה</button>
        </div>
      `;
      body.querySelector('#past-cancel-btn').addEventListener('click', () => sheetApi.close());
      body.querySelector('#past-start-btn').addEventListener('click', () => {
        const val = body.querySelector('#past-date-input').value;
        if (!val) return;
        const picked = parseDateInputValue(val);
        sheetApi.close();
        startWorkout(picked);
      });
    },
  });
}

// A drop-set parent is a bare header with no weight/reps of its own, so it's
// never saved as a row — only its stages are, each tagged with a small
// per-exercise `dropGroup` number so History can regroup them later. That
// number is assigned fresh here (session-local parent uids aren't stable
// across saves) in the order each drop set first appears in the exercise.
function buildSavedSets(ex) {
  let nextDropGroup = 1;
  const dropGroupByParentUid = new Map();
  return ex.sets
    .filter((s) => !hasChildren(ex, s))
    .filter((s) => s.done)
    .map((s, i) => {
      const entry = {
        setNumber: i + 1,
        type: s.type,
        weight: s.weight,
        weightUnit: s.weightUnit,
        weightMode: s.weightMode,
        reps: s.reps,
        notes: s.notes || '',
      };
      if (s.parentUid) {
        if (!dropGroupByParentUid.has(s.parentUid)) dropGroupByParentUid.set(s.parentUid, nextDropGroup++);
        entry.dropGroup = dropGroupByParentUid.get(s.parentUid);
      }
      return entry;
    });
}

async function finishWorkout() {
  const exercises = session
    ? session.exercises.map((ex) => ({
        name: ex.name,
        category: ex.category,
        sets: buildSavedSets(ex),
      })).filter((ex) => ex.sets.length > 0)
    : [];

  if (exercises.length > 0) {
    // endTime is anchored to the picked date plus the real time spent
    // logging — not wall-clock "now", which would blow up the duration
    // History computes whenever startedAt is a past retroactive date.
    const elapsedMs = Date.now() - session.realStartedAt.getTime();
    await createWorkout({
      date: session.startedAt,
      startTime: session.startedAt,
      endTime: new Date(session.startedAt.getTime() + elapsedMs),
      exercises,
    });
  }

  stopElapsedTicking();
  session = null;
  render();
}
