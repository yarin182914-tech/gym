import { esc } from '../core/dom.js';
import { beginMount, isStale } from '../core/page.js';
import { setsTable } from '../ui/sets-table.js';
import { toggleGroup, patchToggleGroup } from '../ui/toggle-group.js';
import { mountNumericField } from '../ui/numeric-input.js';
import { mountWheelPicker } from '../ui/wheel-picker.js';
import { openBottomSheet } from '../ui/bottom-sheet.js';
import { showToast } from '../ui/toast.js';
import { emptyState } from '../ui/empty-state.js';
import { icon } from '../ui/icon.js';
import { openExerciseEditSheet } from '../ui/exercise-edit-sheet.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import { renderProgressChart, buildWeightSeries } from '../lib/charts.js';
import {
  formatDateHe, formatWeight, unitLabel, convertWeight, SET_TYPES,
  dateInputValue, parseDateInputValue, toDate,
} from '../lib/format.js';
import {
  listExerciseLibrary, seedExerciseLibraryIfEmpty, addExerciseToLibrary,
  getLastPerformance, createWorkout, updateWorkout, getExerciseHistory, listWorkouts, CATEGORY_GROUPS,
} from '../lib/firestore.js';

let container = null;
let library = [];
let session = null; // { startedAt, realStartedAt, exercises: [...] }
let finishingWorkout = false; // guards finishWorkout() against double-submission while a save is in flight

// A page reload — or iOS discarding a backgrounded tab, which it does
// aggressively — used to wipe `session` outright, since it only ever lived
// in this module's memory. Mirroring it out to localStorage lets it be
// rebuilt from real wall-clock timestamps instead of silently resetting to
// nothing. Resumable regardless of how old the draft is — deliberately no
// age cutoff: a workout left open for a day or two is exactly the case
// this exists for, not a reason to discard it.
const SESSION_STORAGE_KEY = 'gym-active-session-v1';
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

  // Nothing in memory (fresh page load, or the tab was reloaded/discarded
  // while backgrounded) — try to pick the workout back up from storage
  // before doing anything else.
  let restoredExercises = null;
  if (!session) {
    const restored = loadPersistedSession();
    if (restored) {
      session = restored;
      // Restored _uid values came from a previous page load's counter —
      // jump past them so any newly-added exercise/set can't collide.
      uidSeq = Date.now();
      restoredExercises = session.exercises;
    }
  }

  let loaded = await listExerciseLibrary();
  if (loaded.length === 0) {
    await seedExerciseLibraryIfEmpty();
    loaded = await listExerciseLibrary();
  }
  if (isStale(token)) return;
  library = loaded;

  render();

  // Restored exercises were persisted without their "previous performance"
  // data (see persistSession) — fetch it the same way a freshly-added
  // exercise does, then patch each card in place once it arrives.
  if (restoredExercises) {
    for (const entry of restoredExercises) rehydrateExercise(entry);
  }
}

// Stops everything that outlives a render. The in-progress workout itself is
// deliberately kept, so leaving this tab mid-session doesn't discard it.
export function unmountActiveSession() {
  persistSession(); // capture the latest state now that this page is going away
  // The dialog's Escape handler lives on document, so it outlives this page
  // unless removed here.
  document.removeEventListener('keydown', onLastTimeKeydown);
  lastTimeModal = null;
  for (const refs of exerciseRefs.values()) {
    for (const ctrl of refs.setsEls.values()) ctrl.closeWheel();
  }
  container = null;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// ---------- persistence (survive reload / backgrounded-tab discard) ----------

// Only the fields needed to rebuild the workout are kept — deliberately not
// ex.previous/ex.history (Firestore-fetched lookups, refetched on restore by
// rehydrateExercise instead of round-tripped through JSON on every tick).
// Takes an explicit session so openWorkoutForEditing() can stage a draft
// for the next mount without making it the live in-memory one.
function persistSession(s = session) {
  if (!s) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      startedAt: s.startedAt.toISOString(),
      realStartedAt: s.realStartedAt.toISOString(),
      editingWorkoutId: s.editingWorkoutId || null,
      originalEndTime: s.originalEndTime ? s.originalEndTime.toISOString() : null,
      exercises: s.exercises.map((ex) => ({
        _uid: ex._uid,
        name: ex.name,
        category: ex.category,
        weightMode: ex.weightMode,
        weightUnit: ex.weightUnit,
        sets: ex.sets,
      })),
    }));
  } catch { /* storage full/blocked — the session just won't survive a reload */ }
}

function loadPersistedSession() {
  let raw;
  try {
    raw = localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      startedAt: new Date(parsed.startedAt),
      realStartedAt: new Date(parsed.realStartedAt),
      editingWorkoutId: parsed.editingWorkoutId || null,
      originalEndTime: parsed.originalEndTime ? new Date(parsed.originalEndTime) : null,
      exercises: (parsed.exercises || []).map((ex) => ({
        ...ex,
        previous: null,
        prevLoaded: false,
        history: null,
      })),
    };
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

// A route change (unmountActiveSession) isn't the only way a workout goes
// dark: backgrounding the tab, locking the phone, or the OS discarding the
// page under memory pressure never call it. visibilitychange -> 'hidden' is
// the Page Lifecycle API's reliable signal for all of those, firing right
// before a mobile browser suspends/kills the tab — unlike beforeunload,
// which is unreliable on mobile and deprecated for this. pagehide is a
// backstop for bfcache-eligible navigations Safari handles differently.
// This is module-top-level code, so it only runs once per page load no
// matter how many times mount/unmountActiveSession run — no double-
// registration to guard against. The !container/!session guard makes it a
// silent no-op whenever a different page is mounted or no workout is live.
function persistIfActive() {
  if (!container || !session) return;
  persistSession();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistIfActive();
});
window.addEventListener('pagehide', persistIfActive);

// Mirrors the tail of addExerciseToSession() for exercises that came back
// from storage rather than from the picker — same fetch, same patch-in-place.
async function rehydrateExercise(entry) {
  const [prev, hist] = await Promise.all([
    getLastPerformance(entry.name, session?.editingWorkoutId),
    getExerciseHistory(entry.name, session?.editingWorkoutId),
  ]);
  entry.previous = prev;
  entry.history = hist;
  entry.prevLoaded = true;
  if (container) patchExerciseCard(entry);
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
  // which used to always throw the user back up to the top of the screen.
  const scrollY = window.scrollY;
  const restoreScroll = () => window.scrollTo(0, scrollY);

  if (!session) {
    container.innerHTML = `
      <div class="card" style="text-align:center;">
        <h2>מוכן להתחיל?</h2>
        <p class="text-muted">לחיצה תתחיל מעקב אחר האימון.</p>
        <button class="btn btn-primary btn-block" id="start-workout-btn">התחלת אימון</button>
        <button class="btn btn-secondary btn-block" id="start-past-workout-btn" style="margin-top:8px;">הוספת אימון שכבר בוצע</button>
      </div>`;
    container.querySelector('#start-workout-btn').addEventListener('click', () => startWorkout());
    container.querySelector('#start-past-workout-btn').addEventListener('click', openPastWorkoutSheet);
    restoreScroll();
    return;
  }

  const isRetroactive = !isSameDay(session.startedAt, new Date());
  const isEditing = !!session.editingWorkoutId;

  container.innerHTML = `
    ${isEditing ? `
    <div class="card" style="text-align:center;">
      <div class="text-muted" style="font-size:var(--text-sm);">${icon('calendar-days', { className: 'icon--sm' })} עריכת אימון מ-${esc(formatDateHe(session.startedAt))}</div>
      <button class="btn btn-secondary btn-block" id="cancel-edit-btn" style="margin-top:10px;">ביטול עריכה</button>
    </div>` : isRetroactive ? `
    <div class="card" style="text-align:center;">
      <div class="text-muted" style="font-size:var(--text-sm);">${icon('calendar-days', { className: 'icon--sm' })} ${esc(formatDateHe(session.startedAt))}</div>
    </div>` : ''}

    <div id="progress-slot"></div>

    <div id="exercise-list"></div>

    <button class="btn btn-outline btn-block btn--compact" id="add-exercise-btn">+ הוספת תרגיל</button>
    <button class="btn btn-secondary btn-block btn--compact" id="finish-workout-btn" style="margin-top:8px;">סיום אימון</button>

    ${picker.open ? renderPicker() : ''}
    ${lastTimeModal ? renderLastTimeModal() : ''}
  `;

  const list = container.querySelector('#exercise-list');
  session.exercises.forEach((ex) => {
    list.appendChild(buildExerciseCard(ex));
  });

  applyFocusMode();
  restoreScroll();

  container.querySelector('#finish-workout-btn').addEventListener('click', finishWorkout);
  container.querySelector('#cancel-edit-btn')?.addEventListener('click', cancelEditing);
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

// ---------- "last time" popup ----------

// A single pane: a bold headline set (what the toggle/swipe is actually
// comparing) above the existing full set-by-set breakdown for that workout —
// same setsTable() the "last time" view always used, just also reused for
// the PR workout now.
function renderLastTimePane(point, roleAttr) {
  return `
    <div class="last-time-pane" data-role="${roleAttr}">
      <div class="last-time-headline">
        <span class="num last-time-headline-value">${esc(formatWeight(point.set))} × ${esc(point.set.reps)}</span>
        <span class="last-time-headline-date">${esc(formatDateHe(point.date))}</span>
      </div>
      ${setsTable(point.sets)}
    </div>`;
}

function renderLastTimeModal() {
  const { name, pr, last } = lastTimeModal;
  // Always shown once both sides exist — including when they happen to be
  // identical (a single logged workout, or no progress since) — for a
  // consistent toggle across every exercise instead of some having it and
  // some not. Only genuinely missing data (no pr, or no last) falls back
  // to a single plain view.
  const hasToggle = !!(pr && last);

  let body;
  if (!pr && !last) {
    body = `<p class="text-muted">אין עדיין נתונים מפעם קודמת שביצעת את התרגיל הזה.</p>`;
  } else if (hasToggle) {
    body = `
      ${toggleGroup({
        name: 'lasttime-view',
        active: 'pr',
        label: 'שיא או פעם קודמת',
        groupAttrs: 'data-role="last-time-toggle"',
        options: [{ value: 'pr', label: 'שיא' }, { value: 'last', label: 'פעם קודמת' }],
      })}
      <div class="last-time-swipe">
        <div class="last-time-track" data-role="last-time-track">
          ${renderLastTimePane(pr, 'pane-pr')}
          ${renderLastTimePane(last, 'pane-last')}
        </div>
      </div>`;
  } else {
    body = renderLastTimePane(pr || last, 'pane-solo');
  }

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

// Segmented control (click) and horizontal swipe (drag) both drive the same
// two-pane track — reuses the app's existing sliding-pill toggle-group
// component and the same pointer-event drag pattern already used for
// exercise reordering, rather than inventing either from scratch. Purely
// local DOM state (the track's own transform); nothing here touches
// lastTimeModal, so a full re-render is never needed just to switch panes.
function wireLastTimeSwipe() {
  const toggleEl = container.querySelector('[data-role="last-time-toggle"]');
  const track = container.querySelector('[data-role="last-time-track"]');
  if (!toggleEl || !track) return; // identical/solo/no-data case — nothing to wire

  toggleEl.classList.add('toggle-group--live');
  let view = 'pr';

  function setView(next) {
    view = next;
    track.classList.toggle('last-time-track--last', view === 'last');
    patchToggleGroup(toggleEl, view);
  }

  toggleEl.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => setView(btn.dataset.value));
  });

  let dragStartX = null;
  let dragging = false;

  track.addEventListener('pointerdown', (e) => {
    dragStartX = e.clientX;
    dragging = true;
    track.classList.add('last-time-track--dragging');
    track.setPointerCapture(e.pointerId);
  });

  track.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dxPercent = ((e.clientX - dragStartX) / track.offsetWidth) * 100;
    const base = view === 'pr' ? 0 : -100;
    // Clamp so a drag past either edge just resists instead of overshooting
    // into blank space — there are only ever two panes.
    track.style.transform = `translateX(${Math.max(-100, Math.min(0, base + dxPercent))}%)`;
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    track.classList.remove('last-time-track--dragging');
    track.style.transform = '';
    const dx = e.clientX - dragStartX;
    const SWIPE_THRESHOLD = 40;
    // RTL: the PR pane sits first/rightmost, so a right-to-left swipe
    // (negative dx) advances to "last", mirroring the reading direction.
    if (dx <= -SWIPE_THRESHOLD && view === 'pr') setView('last');
    else if (dx >= SWIPE_THRESHOLD && view === 'last') setView('pr');
  }
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);

  setView('pr');
}

function wireLastTimeModal() {
  const overlay = container.querySelector('#last-time-overlay');
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeLastTimeModal();
  });
  container.querySelector('#last-time-close').addEventListener('click', closeLastTimeModal);
  wireLastTimeSwipe();

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
    getLastPerformance(lib.name, session?.editingWorkoutId),
    getExerciseHistory(lib.name, session?.editingWorkoutId),
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
      <div class="history-detail-inner exercise-detail-inner">
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
        <div class="row" style="gap:8px; margin-top:10px;">
          <button class="btn btn-dashed btn--compact" data-add-set>+ סט</button>
          <button type="button" class="btn btn-outline btn--compact" data-finish-exercise style="flex:1;">סיום תרגיל</button>
        </div>
      </div>
    </div>
  `;

  el.querySelector('[data-last-time]').addEventListener('click', () => {
    lastTimeModal = { name: ex.name, pr: findExercisePR(ex), last: findExerciseLast(ex) };
    render();
  });

  el.querySelector('[data-delete-exercise]').addEventListener('click', () => {
    requestDeleteExercise(ex);
  });

  // Both buttons are the exact same collapse action — the bottom one exists
  // purely so finishing an exercise doesn't force a scroll back up to the
  // header, not as a second mechanism. The exercise stays fully editable
  // either way; collapsing never touches its sets/data, only ex.collapsed.
  el.querySelector('[data-collapse-toggle]').addEventListener('click', () => {
    toggleExerciseCollapse(ex);
  });
  el.querySelector('[data-finish-exercise]').addEventListener('click', () => {
    toggleExerciseCollapse(ex);
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

function exerciseSetsSummary(ex) {
  return { done: ex.sets.filter((s) => s.done).length, total: ex.sets.length };
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
// you've moved on. Purely manual: only toggleExerciseCollapse() (the header
// chevron and the "סיום תרגיל" button both call it) ever changes ex.collapsed.
function patchExerciseCollapse(ex) {
  const refs = exerciseRefs.get(ex._uid);
  if (!refs) return;
  const isOpen = !ex.collapsed;
  refs.detailEl.classList.toggle('history-detail--open', isOpen);
  refs.chevronEl.classList.toggle('history-chevron--open', isOpen);
}

// The one place ex.collapsed is ever flipped — both collapse triggers on
// the card call this instead of duplicating the two-line toggle themselves.
function toggleExerciseCollapse(ex) {
  ex.collapsed = !ex.collapsed;
  patchExerciseCollapse(ex);
}

// ---------- drop sets: a set with children becomes the group's leader —
// a normal, fully editable set (own weight/reps/done-state, saved like any
// other) that also carries the group's controls (collapse, add another
// stage). Its stages are never DOM-nested inside it; they stay flat,
// ordinary siblings in ex.sets/#sets-list (just indented via CSS), which is
// what lets all the existing uid-keyed diffing below keep working
// unchanged. A child is simply a set with `parentUid` set; a parent is
// derived (never stored) as "any set something else points at".

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

// Position within ex.sets — matches how finishWorkout() now saves the
// array (a drop-set group's leader is a normal loggable set again, so
// nothing is skipped here), so "previous performance" lookups against last
// time's flat saved array stay positionally aligned.
function persistablePosition(ex, set) {
  return ex.sets.indexOf(set);
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
// `after`: the stage whose own "+ ירידה" was tapped — the new stage goes
// right after it and starts from its numbers. The leader's button (no
// `after`) appends to the end of the group.
function addDropStage(ex, parent, after = null) {
  const last = after || childrenOf(ex, parent).at(-1);
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
  patchExerciseCard(ex);
}

// What a row's type picker shows: a drop set's leader and stages always
// read as "דרופ סט", even if a stored type predates that (older saved
// workouts reopened for editing).
function shownSetType(set, role) {
  return role === 'parent' || role === 'child' ? 'dropset' : set.type;
}

// "רגיל"/"חימום" tapped on one stage: that stage leaves the group as a
// plain set, placed right after the group so the remaining stages stay
// together. Nothing is lost, so no confirmation. If it was the only stage,
// the leader is a plain set again too.
function detachStage(ex, stage, type) {
  const leader = ex.sets.find((s) => s._uid === stage.parentUid);
  ex.sets.splice(ex.sets.indexOf(stage), 1);
  delete stage.parentUid;
  stage.type = type;
  const anchor = leader ? (childrenOf(ex, leader).at(-1) || leader) : null;
  ex.sets.splice(anchor ? ex.sets.indexOf(anchor) + 1 : ex.sets.length, 0, stage);
  if (leader && !hasChildren(ex, leader)) leader.type = 'working';
  patchExerciseCard(ex);
  persistSession();
}

// "רגיל"/"חימום" tapped on a drop set's leader: back to a plain set. The
// leader keeps its own weight/reps; its stages go. Stages not logged yet
// just vanish — but if any was already marked done, that's real data, so
// it asks first (and leaves everything as it was on "no").
async function revertDropSet(ex, leader, type, typeGroupEl) {
  const stages = childrenOf(ex, leader);
  const doneCount = stages.filter((s) => s.done).length;
  if (doneCount > 0) {
    const confirmed = await confirmDialog({
      title: 'חזרה לסט רגיל',
      message: doneCount === 1
        ? 'ירידה אחת כבר סומנה כבוצעה. להסיר אותה? הסט עצמו יישאר.'
        : `${doneCount} ירידות כבר סומנו כבוצעו. להסיר אותן? הסט עצמו יישאר.`,
      confirmLabel: 'הסרה',
      danger: true,
    });
    if (!confirmed) {
      patchToggleGroup(typeGroupEl, 'dropset');
      return;
    }
  }
  for (const s of stages) ex.sets.splice(ex.sets.indexOf(s), 1);
  leader.type = type;
  patchExerciseCard(ex);
  persistSession();
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
      ctrl.closeWheel?.();
      ctrl.row.remove();
      refs.setsEls.delete(uid);
    }
  }

  ex.sets.forEach((set, idx) => {
    let ctrl = refs.setsEls.get(set._uid);
    const role = computeSetRole(ex, set);
    // Every role shares the same row shape now (own editable weight/reps) —
    // only the meta row's content differs (type picker vs. a stage's own
    // "+ ירידה"), and a leader's picker answers clicks differently — but
    // that is all built once up front, so a role change still rebuilds.
    const needsRebuild = ctrl && ctrl.role !== role;
    if (needsRebuild) {
      ctrl.closeWheel?.();
      ctrl.row.remove();
      refs.setsEls.delete(set._uid);
      ctrl = null;
    }
    const nodeAtIdx = refs.setsListEl.children[idx] || null;
    if (!ctrl) {
      ctrl = buildSetRow(ex, set, role);
      ctrl.role = role;
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
    patchSetRow(ex, set, ctrl);
  });
}

// Every row gets the exact same type picker — regular set, drop set leader
// and stage alike — so switching is one tap either way: "דרופ סט" turns a
// set into a group (adding its first stage); "רגיל"/"חימום" on a leader
// turns the group back into a plain set (revertDropSet), and on a stage
// takes just that stage out as a plain set (detachStage). Stages also get
// their own "+ ירידה", which adds the next stage right after them.
function buildSetRowMeta(set, role) {
  const picker = toggleGroup({
    name: 'type',
    active: shownSetType(set, role),
    label: 'סוג סט',
    groupAttrs: 'data-set-type-group',
    options: SET_TYPES.map((t) => ({ value: t.id, label: t.label })),
  });
  if (role !== 'child') return picker;
  return `${picker}<button type="button" class="btn-mini-dashed" data-role="add-stage-btn">+ ירידה</button>`;
}

function buildSetRow(ex, set, role) {
  const row = document.createElement('div');
  const roleClass = role === 'child' ? ' set-row--child' : role === 'parent' ? ' set-row--parent' : '';
  row.className = `set-row set-row--entering${roleClass}`;

  row.innerHTML = `
    <div class="set-row-main">
      <span class="set-index" data-role="set-index">${esc(setIndexLabel(ex, set, role))}</span>
      <div class="set-field set-field--weight" data-role="weight-slot"></div>
      <button type="button" class="set-field set-field--reps" data-role="reps-trigger" aria-expanded="false">
        <span class="reps-value num">${esc(set.reps)}</span>
        <span class="numeric-field-unit">חזרות</span>
      </button>
      <button type="button" class="set-done-btn${set.done ? ' set-done-btn--done' : ''}" data-role="done-btn" aria-label="סימון סט כבוצע">
        <span class="done-glyph">✓</span>
      </button>
    </div>
    <div class="wheel-picker-slot" data-role="wheel-slot" hidden></div>
    <div class="set-row-meta">
      ${buildSetRowMeta(set, role)}
      <button type="button" class="set-more-btn set-more-btn--meta" data-role="more-btn" aria-label="עוד אפשרויות לסט">⋯</button>
      <span class="pr-badge" data-role="pr-badge" ${set.isPR ? '' : 'hidden'}>שיא</span>
    </div>
    <span class="set-row-notes" data-role="notes" hidden></span>
  `;

  const typeGroupEl = row.querySelector('[data-set-type-group]');
  if (typeGroupEl) {
    typeGroupEl.classList.add('toggle-group--live', 'toggle-group--compact');
    patchToggleGroup(typeGroupEl, shownSetType(set, role));
    typeGroupEl.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (role === 'parent' || role === 'child') {
          if (btn.dataset.type === 'dropset') return;
          if (role === 'parent') revertDropSet(ex, set, btn.dataset.type, typeGroupEl);
          else detachStage(ex, set, btn.dataset.type);
          return;
        }
        set.type = btn.dataset.type;
        if (set.type === 'dropset') {
          // Picking "דרופ סט" immediately adds the group's first stage —
          // the set itself stays exactly as it is (still 80×8, still the
          // exact same set, never replaced or emptied) and becomes the
          // group's leader; addDropStage() below also patches the card,
          // which is what rebuilds this row into its 'parent' meta.
          addDropStage(ex, set);
          return;
        }
        patchToggleGroup(typeGroupEl, set.type);
        patchExerciseCard(ex);
      });
    });
  }

  row.querySelector('[data-role="add-stage-btn"]')?.addEventListener('click', () => {
    if (role === 'child') {
      const parent = ex.sets.find((s) => s._uid === set.parentUid);
      if (parent) addDropStage(ex, parent, set);
    } else {
      addDropStage(ex, set);
    }
  });

  const weightSlot = row.querySelector('[data-role="weight-slot"]');
  const numeric = mountNumericField(weightSlot, {
    value: set.weight,
    unitLabel: unitLabel(set.weightUnit).trim(),
    onCommit: (v) => { set.weight = v; persistSession(); },
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
        persistSession();
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
    notesEl: row.querySelector('[data-role="notes"]'),
    closeWheel,
  };

  row.querySelector('[data-role="more-btn"]').addEventListener('click', () => {
    closeWheel();
    openSetDetailSheet(ex, set, ctrl);
  });

  return ctrl;
}

function patchSetRow(ex, set, ctrl) {
  const wasDone = ctrl.row.classList.contains('set-row--done');

  patchToggleGroup(ctrl.typeGroupEl, shownSetType(set, ctrl.role));
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
// the accident this is meant to guard against. Uses the app's own
// confirmDialog, not the native confirm() this used to call — a native
// dialog is exactly the kind of browser chrome that can go missing or
// behave unreliably once the app is running installed/standalone (no
// address bar), which is what made this "sometimes not respond" at all;
// confirmDialog is plain in-app markup, so it can't depend on that.
async function requestDeleteExercise(ex) {
  const confirmed = await confirmDialog({
    title: 'מחיקת תרגיל',
    // confirmDialog renders via innerHTML (unlike the native confirm() this
    // replaces, which only ever took plain text) — ex.name can be a
    // user-typed custom exercise name, so it has to stay escaped here same
    // as everywhere else this file puts a name into markup.
    message: `למחוק את התרגיל "${esc(ex.name)}" מהאימון?`,
    confirmLabel: 'מחיקה',
    danger: true,
  });
  if (!confirmed) return;
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

// Deleting a set that hasChildren also removes its stages — leaving them
// behind with a parentUid pointing at a set that no longer exists would
// orphan them (and break setIndexLabel, which assumes a child's parent is
// always still present). Confirming a group deletion, if needed, is the
// caller's job (see openSetDetailSheet's delete handler).
function requestDeleteSet(ex, set) {
  const idx = ex.sets.indexOf(set);
  if (idx === -1) return;
  [set, ...childrenOf(ex, set)].forEach((s) => {
    const i = ex.sets.indexOf(s);
    if (i !== -1) ex.sets.splice(i, 1);
  });
  patchExerciseCard(ex);
}

function duplicateSet(ex, set) {
  const idx = ex.sets.indexOf(set);
  if (idx === -1) return;
  // Duplicating a drop-set group's leader shouldn't silently create another
  // "dropset"-typed set with no stages of its own — same fallback
  // prefillForNewSet() already uses when copying a set whose type was 'dropset'.
  const type = (!set.parentUid && set.type === 'dropset') ? 'working' : set.type;
  ex.sets.splice(idx + 1, 0, {
    _uid: nextUid(),
    parentUid: set.parentUid, // a duplicated stage stays in the same drop set
    type,
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
  // Shared by render() and onClose() below — the chart loads lazily (Chart.js
  // itself is fetched on first use) and needs destroying if the sheet closes
  // before or after it finishes rendering, same lifecycle Dashboard's own
  // chart instance goes through.
  let chartInstance = null;

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

        <button type="button" class="btn btn-outline btn-block" data-role="sheet-show-chart" style="margin-top:14px;">הצג גרף התקדמות</button>
        <div data-role="sheet-chart-container" hidden style="height:220px; margin-top:10px;"><canvas data-role="sheet-chart-canvas"></canvas></div>

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

      // Loaded on demand, not built into the sheet up front — most taps here
      // are a quick weight/reps edit, not a request for history, so the
      // chart (and the Chart.js library fetch behind it) only happens if
      // asked for. A second tap just toggles visibility rather than
      // re-fetching/re-rendering.
      const chartBtn = body.querySelector('[data-role="sheet-show-chart"]');
      const chartContainer = body.querySelector('[data-role="sheet-chart-container"]');
      chartBtn.addEventListener('click', async () => {
        if (chartInstance) {
          chartContainer.hidden = !chartContainer.hidden;
          return;
        }
        chartContainer.hidden = false;
        chartBtn.disabled = true;
        try {
          const history = await getExerciseHistory(ex.name, session?.editingWorkoutId);
          const canvas = body.querySelector('[data-role="sheet-chart-canvas"]');
          if (!canvas?.isConnected) return; // sheet closed while this was in flight
          chartInstance = await renderProgressChart(canvas, buildWeightSeries(history));
        } catch (err) {
          console.error('progress chart failed to render', err);
          chartContainer.hidden = true;
        } finally {
          chartBtn.disabled = false;
        }
      });

      const closeSheetAndPatch = () => { sheetApi.close(); };
      body.querySelector('[data-role="sheet-cancel"]').addEventListener('click', closeSheetAndPatch);
      body.querySelector('[data-role="sheet-save"]').addEventListener('click', closeSheetAndPatch);

      body.querySelector('[data-role="sheet-duplicate"]').addEventListener('click', () => {
        duplicateSet(ex, set);
        sheetApi.close();
      });

      body.querySelector('[data-role="sheet-delete"]').addEventListener('click', async () => {
        const children = childrenOf(ex, set);
        if (children.length > 0) {
          // Deleting a drop-set group's leader takes its stages with it —
          // a louder, explicit confirmation than the plain "already done"
          // one below, since it can remove several logged sets at once.
          // Closed first: confirmDialog reuses .modal-overlay, whose
          // z-index sits below the open bottom sheet's.
          sheetApi.close();
          const confirmed = await confirmDialog({
            title: 'מחיקת דרופ סט',
            message: 'למחוק את הדרופ סט וכל השלבים שבו? הפעולה לא הפיכה.',
            confirmLabel: 'מחיקה',
            danger: true,
          });
          if (confirmed) requestDeleteSet(ex, set);
          return;
        }
        if (set.done && !confirm('הסט הזה כבר סומן כהושלם. למחוק בכל זאת?')) return;
        requestDeleteSet(ex, set);
        sheetApi.close();
      });
    },
    onClose() {
      // Covers weight/reps/notes edits made while the sheet was open —
      // delete/duplicate already patch immediately on their own.
      if (exerciseRefs.has(ex._uid)) patchExerciseCard(ex);
      persistSession();
      chartInstance?.destroy();
      chartInstance = null;
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
    const loggableSets = ex.sets; // drop-set group leaders are loggable sets again too
    loggableSets.forEach((set, setIdx) => {
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
  persistSession();
  patchExerciseCard(ex);
}

function computePR(ex, set) {
  const history = ex.history || [];
  const bestPrev = history.flatMap((h) => h.sets || [])
    .filter((s) => s.weightMode === set.weightMode && (s.weightUnit || 'kg') === set.weightUnit)
    .reduce((max, s) => Math.max(max, s.weight), 0);
  return set.weight > bestPrev;
}

// ---------- "last time" popup: PR vs last-performance lookup ----------
// Reads only data already on `ex` (ex.history, ex.previous). Separate from
// computePR() below, which answers a different question (is this one set,
// logged this way, a new best) and drives the trophy, not this popup.
//
// The PR is the best whole workout across all history. Workouts are ranked by weight only, never reps, compared set by set from
// the heaviest down: 80/80/80 beats 80/80/75 even if the 75 set had more
// reps. Comparing only the single heaviest set (the earlier version) made
// those two a tie, and a tie kept the *older* workout — so "last time"
// could plainly outweigh the "PR" shown next to it. A full tie now goes to
// the newer workout, so a matched PR shows the same thing as last time.

// kg, total — so a set logged per side or in lb still compares fairly.
function comparableWeight(s) {
  const kg = convertWeight(Number(s.weight) || 0, s.weightUnit || 'kg', 'kg');
  return s.weightMode === 'perSide' ? kg * 2 : kg;
}

// A workout's set weights, heaviest first. Warm-ups don't count toward a PR.
function weightProfile(sets) {
  return (sets || [])
    .filter((s) => s.type !== 'warmup')
    .map(comparableWeight)
    .sort((a, b) => b - a);
}

// > 0 when profile a lifted more than b, 0 on an exact weight tie.
// Having an extra set at all beats not having it.
function compareWeightProfiles(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? -1;
    const y = b[i] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

// The headline row: heaviest set, and among equally heavy sets the one
// with the most reps.
function headlineSet(sets) {
  return (sets || []).reduce((top, s) => {
    if (!top) return s;
    const diff = comparableWeight(s) - comparableWeight(top);
    return diff > 0 || (diff === 0 && (Number(s.reps) || 0) > (Number(top.reps) || 0)) ? s : top;
  }, null);
}

function toPoint(date, sets) {
  const set = headlineSet(sets);
  return set ? { date, sets, set, profile: weightProfile(sets) } : null;
}

function findExercisePR(ex) {
  // ex.history is oldest first; `>= 0` lets a later workout take over a tie.
  let best = null;
  for (const h of ex.history || []) {
    const point = toPoint(h.date, h.sets);
    if (point && (!best || compareWeightProfiles(point.profile, best.profile) >= 0)) best = point;
  }
  // ex.previous comes from a separate lookup; never let it outrank the PR.
  const last = findExerciseLast(ex);
  if (last && (!best || compareWeightProfiles(last.profile, best.profile) >= 0)) best = last;
  return best;
}

// The most recent workout — ex.previous is already its full breakdown
// (see getLastPerformance).
function findExerciseLast(ex) {
  if (!ex.previous) return null;
  return toPoint(ex.previous.workoutDate, ex.previous.sets);
}

function startWorkout(customDate) {
  const real = new Date();
  // realStartedAt is real wall-clock time even for a retroactive (backdated)
  // workout — startedAt is what gets saved/displayed as the workout's date,
  // realStartedAt is only ever used to measure how long finishing it took
  // (see finishWorkout's endTime calc), which is unrelated to which day the
  // user picked.
  session = { startedAt: customDate || real, realStartedAt: real, exercises: [] };
  persistSession();
  render();
}

// History's "continue / edit" button. Turns a saved workout back into a live
// session — the reverse of buildSavedSets(), with dropGroup turned back into
// parentUid links — and stages it as the persisted draft, so the next mount
// restores it exactly like a resumed workout (fetching "last time" data on
// the way). Finishing it then updates that same record instead of creating
// a second one. Returns false, changing nothing, if a workout is already in
// progress: that one is never overwritten.
export function openWorkoutForEditing(workout) {
  if (session || loadPersistedSession()) return false;

  const exercises = (workout.exercises || []).map((savedEx) => {
    const leaderUidByGroup = new Map();
    const sets = (savedEx.sets || []).map((s) => {
      const set = {
        _uid: nextUid(),
        type: s.type,
        weight: s.weight,
        reps: s.reps,
        notes: s.notes || '',
        done: true,
        isPR: false,
        weightMode: s.weightMode || 'total',
        weightUnit: s.weightUnit || 'kg',
      };
      if (s.dropGroup) {
        // The first set of a group is its leader; the rest are its stages.
        if (leaderUidByGroup.has(s.dropGroup)) set.parentUid = leaderUidByGroup.get(s.dropGroup);
        else leaderUidByGroup.set(s.dropGroup, set._uid);
      }
      return set;
    });
    return {
      _uid: nextUid(),
      name: savedEx.name,
      category: savedEx.category || '',
      weightMode: sets[0]?.weightMode || 'total',
      weightUnit: sets[0]?.weightUnit || 'kg',
      sets,
    };
  });

  const startedAt = toDate(workout.startTime || workout.date);
  persistSession({
    startedAt,
    realStartedAt: new Date(),
    editingWorkoutId: workout.id,
    originalEndTime: workout.endTime ? toDate(workout.endTime) : startedAt,
    exercises,
  });
  return true;
}

// Leaves a reopened workout without saving — the stored one stays as it was.
async function cancelEditing() {
  const confirmed = await confirmDialog({
    title: 'ביטול עריכה',
    message: 'לצאת בלי לשמור? האימון השמור יישאר כמו שהיה.',
    confirmLabel: 'יציאה בלי שמירה',
    cancelLabel: 'המשך עריכה',
    danger: true,
  });
  if (!confirmed || !session) return;
  session = null;
  persistSession();
  render();
}

// Bottom sheet for logging a workout that already happened — lets the
// saved date (session.startedAt) differ from today, while session.realStartedAt
// still tracks the actual moment logging began (see startWorkout).
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

// A drop set's group leader is a normal loggable set now (own weight/reps),
// saved as its own row same as any other — not just its stages. Both the
// leader and its stages share one per-exercise `dropGroup` number so a
// future consumer (e.g. History) can regroup them; assigned fresh here
// since session-local uids aren't stable across saves, in the order each
// drop set first appears in the exercise.
function buildSavedSets(ex) {
  let nextDropGroup = 1;
  const dropGroupByParentUid = new Map();
  return ex.sets
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
      // A group's identity is always its leader's uid — a child's is its
      // own parentUid; the leader is its own group's identity.
      const groupUid = s.parentUid || (hasChildren(ex, s) ? s._uid : null);
      if (groupUid) {
        if (!dropGroupByParentUid.has(groupUid)) dropGroupByParentUid.set(groupUid, nextDropGroup++);
        entry.dropGroup = dropGroupByParentUid.get(groupUid);
      }
      return entry;
    });
}

// Previously had no try/catch at all: a network hiccup or a rejected
// createWorkout() call just threw, unhandled, out of this async function —
// no error shown, session never cleared, the button just sat there looking
// like it hadn't responded to the tap at all. That silent failure (not
// literally a missed click) was almost certainly the "sometimes doesn't
// respond" symptom. Also had no guard against a second tap firing a second
// save while the first was still in flight.
async function finishWorkout() {
  if (finishingWorkout || !session) return;
  // Set before the dialog, not after, so a second tap while it's open
  // can't stack another one on top.
  finishingWorkout = true;

  const isEdit = !!session.editingWorkoutId;
  const confirmed = await confirmDialog({
    title: isEdit ? 'שמירת השינויים' : 'סיום אימון',
    message: isEdit ? 'לשמור את השינויים באימון?' : 'לסיים ולשמור את האימון?',
    confirmLabel: isEdit ? 'שמירה' : 'סיום ושמירה',
    cancelLabel: 'המשך באימון',
  });
  if (!confirmed || !session) {
    finishingWorkout = false;
    return;
  }

  const btn = container?.querySelector('#finish-workout-btn');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('btn--loading');
    btn.textContent = 'שומר...';
  }

  try {
    const exercises = session.exercises
      .map((ex) => ({ name: ex.name, category: ex.category, sets: buildSavedSets(ex) }))
      .filter((ex) => ex.sets.length > 0);

    const elapsedMs = Date.now() - session.realStartedAt.getTime();
    if (isEdit) {
      // A reopened workout keeps its own date; the time spent now is added
      // on top of its original end, covering a workout closed by mistake
      // and then continued. Removing every set doesn't delete the saved
      // workout — that's what History's own delete button is for.
      if (exercises.length > 0) {
        await updateWorkout(session.editingWorkoutId, {
          endTime: new Date(session.originalEndTime.getTime() + elapsedMs),
          exercises,
        });
      }
    } else if (exercises.length > 0) {
      // endTime is anchored to the picked date plus the real time spent
      // logging — not wall-clock "now", which would blow up the duration
      // History computes whenever startedAt is a past retroactive date.
      await createWorkout({
        date: session.startedAt,
        startTime: session.startedAt,
        endTime: new Date(session.startedAt.getTime() + elapsedMs),
        exercises,
      });
    }

    // Only reached on success — a thrown error skips straight to catch,
    // leaving session (and the persisted draft) untouched so nothing is
    // lost if the save actually failed.
    session = null;
    localStorage.removeItem(SESSION_STORAGE_KEY);
    render();
    showToast(isEdit ? '✓ האימון עודכן' : '✓ האימון נשמר בהצלחה');
  } catch (err) {
    console.error('finishWorkout failed', err);
    showToast('שגיאה בשמירת האימון — נסה שוב');
  } finally {
    finishingWorkout = false;
    // Only re-enable the button if the workout is still open — on success
    // render() already swapped it out for the "ready to start" screen,
    // which has no #finish-workout-btn to restore.
    const btnAfter = session ? container?.querySelector('#finish-workout-btn') : null;
    if (btnAfter) {
      btnAfter.disabled = false;
      btnAfter.classList.remove('btn--loading');
      btnAfter.textContent = 'סיום אימון';
    }
  }
}
