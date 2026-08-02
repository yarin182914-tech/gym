import { renderPlateDial } from '../lib/plate-dial.js';
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
let restTimerId = null;
let rest = null; // { totalSec, remainingSec }
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
  stopRestTicking();
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

    <div id="rest-slot"></div>

    <div id="exercise-list"></div>

    <button class="btn btn-secondary btn-block" id="add-exercise-btn">+ הוספת תרגיל</button>
    <button class="btn btn-secondary btn-block" id="finish-workout-btn" style="margin-top:8px;">סיום אימון</button>

    ${picker.open ? renderPicker() : ''}
    ${lastTimeModal ? renderLastTimeModal() : ''}

    <div id="toast-slot" class="toast-slot" aria-live="polite"></div>
  `;

  const list = container.querySelector('#exercise-list');
  session.exercises.forEach((ex) => {
    list.appendChild(buildExerciseCard(ex));
  });

  patchRestSlot();
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

// ---------- rest timer slot (patched independently of render()) ----------
//
// Completing a set is the single most frequent action on this screen and it
// starts the rest timer — that must not trigger a full render(), or every
// set-complete animation would be wiped out by a whole-screen rebuild.
//
// Rendered as a small floating pill (not a full-width card) so it never
// blocks or pushes around the next set the user is about to log — resting
// and editing happen at the same time, not one after the other.

function patchRestSlot() {
  if (!container) return;
  const slot = container.querySelector('#rest-slot');
  if (!slot) return;

  if (!rest) {
    slot.innerHTML = '';
    return;
  }

  if (!slot.querySelector('#rest-pill')) {
    slot.innerHTML = `
      <div class="rest-pill" id="rest-pill" role="status">
        <div id="rest-dial"></div>
        <div class="rest-pill-actions">
          <button type="button" class="btn btn-secondary" id="rest-plus15-btn">+15</button>
          <button type="button" class="btn btn-secondary" id="rest-plus30-btn">+30</button>
          <button type="button" class="btn btn-secondary" id="skip-rest-btn">דלג</button>
        </div>
      </div>`;
    slot.querySelector('#rest-plus15-btn').addEventListener('click', () => extendRest(15));
    slot.querySelector('#rest-plus30-btn').addEventListener('click', () => extendRest(30));
    slot.querySelector('#skip-rest-btn').addEventListener('click', stopRestTimer);
  }

  renderPlateDial(slot.querySelector('#rest-dial'), {
    progress: rest.remainingSec / rest.totalSec,
    valueText: formatMMSS(rest.remainingSec),
    label: 'שניות',
    compact: true,
  });
}

function extendRest(sec) {
  if (!rest) return;
  // Extends both ends by the same amount, so the dial reflects "more time
  // was added" rather than jumping past a full ring.
  rest.totalSec += sec;
  rest.remainingSec += sec;
  patchRestSlot();
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

function isExerciseAllDone(ex) {
  return ex.sets.length > 0 && ex.sets.every((s) => s.done);
}

function buildExerciseCard(ex) {
  const el = document.createElement('div');
  el.className = 'card';

  const allDone = isExerciseAllDone(ex);
  const isOpen = !(allDone && ex.collapsed);

  el.innerHTML = `
    <div class="row" style="margin-bottom:8px; flex-wrap:wrap; gap:8px;">
      <h3 style="color:var(--text); margin:0;">${esc(ex.name)}</h3>
      <div style="display:flex; align-items:center; gap:8px;">
        <button class="btn btn-secondary" data-last-time style="padding:0 12px; font-size:0.85rem;">${icon('clock', { className: 'icon--sm' })} פעם קודמת</button>
        <button type="button" class="set-more-btn set-more-btn--danger" data-delete-exercise aria-label="מחיקת התרגיל">${icon('trash-2', { className: 'icon--sm' })}</button>
        <button type="button" class="set-more-btn${allDone ? '' : ' hidden'}" data-collapse-toggle aria-label="כיווץ/הרחבת התרגיל">
          <span class="history-chevron${isOpen ? ' history-chevron--open' : ''}" data-collapse-chevron aria-hidden="true">⌄</span>
        </button>
      </div>
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
        <div class="sets-list"></div>
        <button class="btn btn-secondary btn-block" data-add-set>+ סט</button>
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
    collapseToggleEl: el.querySelector('[data-collapse-toggle]'),
    chevronEl: el.querySelector('[data-collapse-chevron]'),
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
  if (last) return { type: last.type, weight: last.weight, reps: last.reps, notes: '' };
  const prevSet = ex.prevLoaded ? ex.previous?.sets?.[newIdx] : null;
  if (prevSet) {
    const weight = convertWeight(prevSet.weight, prevSet.weightUnit || 'kg', ex.weightUnit);
    return { type: prevSet.type ?? 'working', weight, reps: prevSet.reps, notes: '' };
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
  applyFocusMode();
  patchExerciseCollapse(ex);
}

// A finished exercise (every set done) can be minimized to just its header —
// the point is that moving on to the next exercise doesn't leave a fully
// expanded, already-done card eating the whole screen. Only offered once
// it's actually done: collapsing is never available while any set still
// needs attention, since that's exactly what focus mode above needs visible.
function patchExerciseCollapse(ex) {
  const refs = exerciseRefs.get(ex._uid);
  if (!refs) return;
  const allDone = isExerciseAllDone(ex);
  const isOpen = !(allDone && ex.collapsed);
  refs.collapseToggleEl.classList.toggle('hidden', !allDone);
  refs.detailEl.classList.toggle('history-detail--open', isOpen);
  refs.chevronEl.classList.toggle('history-chevron--open', isOpen);
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
      ctrl.closeWheel();
      ctrl.row.remove();
      refs.setsEls.delete(uid);
    }
  }

  ex.sets.forEach((set, idx) => {
    let ctrl = refs.setsEls.get(set._uid);
    const nodeAtIdx = refs.setsListEl.children[idx] || null;
    if (!ctrl) {
      ctrl = buildSetRow(ex, set);
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
    patchSetRow(ex, set, idx, ctrl);
  });
}

function buildSetRow(ex, set) {
  const row = document.createElement('div');
  row.className = 'set-row set-row--entering';

  row.innerHTML = `
    ${toggleGroup({
      name: 'type',
      active: set.type,
      label: 'סוג סט',
      groupAttrs: 'data-set-type-group',
      options: SET_TYPES.map((t) => ({ value: t.id, label: t.label })),
    })}
    <div class="set-field set-field--weight" data-role="weight-slot"></div>
    <button type="button" class="set-field set-field--reps" data-role="reps-trigger" aria-expanded="false">
      <span class="reps-value num">${esc(set.reps)}</span>
      <span class="reps-caption">חזרות</span>
    </button>
    <button type="button" class="set-more-btn" data-role="more-btn" aria-label="עוד אפשרויות לסט">⋯</button>
    <button type="button" class="btn set-done-btn ${set.done ? 'btn-success' : 'btn-secondary'}" data-role="done-btn">
      <span class="done-glyph">${set.done ? '✓' : 'סיום'}</span>
    </button>
    <span class="pr-badge" data-role="pr-badge" ${set.isPR ? '' : 'hidden'}>שיא חדש ${icon('trophy', { className: 'icon--sm' })}</span>
    <div class="set-row-previous" data-role="previous" hidden></div>
    <div class="set-row-notes" data-role="notes" hidden></div>
    <div class="wheel-picker-slot" data-role="wheel-slot" hidden></div>
  `;

  const typeGroupEl = row.querySelector('[data-set-type-group]');
  typeGroupEl.classList.add('toggle-group--live', 'toggle-group--compact');
  patchToggleGroup(typeGroupEl, set.type);
  typeGroupEl.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      set.type = btn.dataset.type;
      patchToggleGroup(typeGroupEl, set.type);
    });
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

  ctrl.doneBtn.className = `btn set-done-btn ${set.done ? 'btn-success' : 'btn-secondary'}`;
  ctrl.doneBtn.querySelector('.done-glyph').textContent = set.done ? '✓' : 'סיום';
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
  const idx = ex.sets.indexOf(set);

  openBottomSheet({
    ariaLabel: `${ex.name}, סט ${idx + 1}`,
    render(body, sheetApi) {
      const prev = ex.prevLoaded ? ex.previous?.sets?.[idx] : null;

      body.innerHTML = `
        <h3 style="margin:0 0 2px; color:var(--text);">${esc(ex.name)}</h3>
        <p class="text-muted" style="margin:0 0 10px;">
          סט ${idx + 1}${set.isPR ? ` · <span class="pr-badge">שיא חדש ${icon('trophy', { className: 'icon--sm' })}</span>` : ''}
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
    ex.sets.forEach((set, setIdx) => {
      totalSets += 1;
      if (set.done) completedSets += 1;

      const ctrl = refs?.setsEls.get(set._uid);
      ctrl?.row.classList.remove('set-row--active', 'set-row--upcoming');
      if (set.done) return;

      if (!currentAssigned) {
        currentAssigned = true;
        current = { exIdx, setIdx, setCount: ex.sets.length };
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
    const type = SET_TYPES.find((t) => t.id === set.type);
    startRestTimer(type.restSec);
    // A short buzz for completing the set already covers "starting rest" —
    // they're the same action, so a second pattern back-to-back would just
    // feel like noise. PR gets its own distinct pattern on top.
    if (navigator.vibrate) navigator.vibrate(isNewPR ? [20, 40, 20] : 15);
    if (isNewPR) showToast(`${icon('trophy', { className: 'icon--sm' })} שיא חדש!`);
  }
  // The moment every set is done, get it out of the way automatically —
  // re-opening an incomplete set (undo, or adding another one later) always
  // forces it back open, since collapsing only ever makes sense when done.
  if (isExerciseAllDone(ex)) {
    ex.collapsed = true;
  } else {
    ex.collapsed = false;
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

function startRestTimer(totalSec) {
  stopRestTicking();
  rest = { totalSec, remainingSec: totalSec };
  patchRestSlot();
  restTimerId = setInterval(() => {
    rest.remainingSec -= 1;
    if (rest.remainingSec <= 0) {
      stopRestTimer();
      if (navigator.vibrate) navigator.vibrate(200);
    } else {
      patchRestSlot();
    }
  }, 1000);
}

function stopRestTicking() {
  if (restTimerId) clearInterval(restTimerId);
  restTimerId = null;
}

// Ends the rest period and repaints just its slot, since the rest card
// itself disappears.
function stopRestTimer() {
  stopRestTicking();
  rest = null;
  patchRestSlot();
}

async function finishWorkout() {
  const exercises = session
    ? session.exercises.map((ex) => ({
        name: ex.name,
        category: ex.category,
        sets: ex.sets.filter((s) => s.done).map((s, i) => ({
          setNumber: i + 1,
          type: s.type,
          weight: s.weight,
          weightUnit: s.weightUnit,
          weightMode: s.weightMode,
          reps: s.reps,
          notes: s.notes || '',
        })),
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
  stopRestTicking();
  session = null;
  rest = null;
  render();
}
