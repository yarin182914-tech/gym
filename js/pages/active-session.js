import { esc } from '../core/dom.js';
import { beginMount, isStale } from '../core/page.js';
import { setsTable, cardioTable } from '../ui/sets-table.js';
import { toggleGroup, patchToggleGroup } from '../ui/toggle-group.js';
import { mountNumericField } from '../ui/numeric-input.js';
import { mountClockField } from '../ui/clock-input.js';
import { mountWheelPicker } from '../ui/wheel-picker.js';
import { openBottomSheet } from '../ui/bottom-sheet.js';
import { showToast } from '../ui/toast.js';
import { emptyState } from '../ui/empty-state.js';
import { icon } from '../ui/icon.js';
import { openExerciseEditSheet } from '../ui/exercise-edit-sheet.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import { mountDateField, mountTimeField } from '../ui/date-time-picker.js';
import { createPlannedWorkoutCard } from '../ui/planned-workout-card.js';
import { todayKey } from '../lib/body-weight.js';
import { renderProgressChart, buildWeightSeries } from '../lib/charts.js';
import {
  formatDateHe, formatWeight, unitLabel, convertWeight, SET_TYPES,
  dateInputValue, parseDateInputValue, toDate, formatTimeHe, workoutHasTime, timeInputValue, formatDayMonthHe,
} from '../lib/format.js';
import {
  listExerciseLibrary, seedExerciseLibraryIfEmpty, addExerciseToLibrary,
  getLastPerformance, createWorkout, updateWorkout, deleteWorkout, getExerciseHistory, listWorkouts, CATEGORY_GROUPS,
  getPlannedWorkout, updatePlannedWorkout,
} from '../lib/firestore.js';
import {
  CARDIO_CATEGORY, CARDIO_LIBRARY, CARDIO_FIELDS, SEGMENT_KEYS, cardioActivity, hasInputModes,
  segmentFields, segmentMetrics, isEmptySegment, formatClock, formatKm, formatSpeed,
  summarizeSegments, formatSummary, findCardioRecords, brokenCardioRecords,
} from '../lib/cardio.js';

let container = null;
let library = [];
let libraryReady = false; // the library has loaded at least once this app session
// { id, startedAt, realStartedAt, hasTime, live, exercises: [...] } — plus
// editingWorkoutId / originalStartedAt / originalEndTime for a saved
// workout reopened from History. hasTime: startedAt carries a real time of
// day (one logged afterwards may have only a date). live: started with
// "התחלת אימון", so it ends now rather than after the time spent logging.
//
// Several workouts can be open at once, one per tab in the strip above the
// workout: `sessions` holds them all, `session` is the one on screen (always
// one of `sessions`, or null when none is open). Everything below that
// works on "the workout" works on `session`.
let session = null;
let sessions = [];
let sessionsLoaded = false; // read back from storage at least once this page load
const MAX_SESSIONS = 5;
let finishingWorkout = false; // guards finishWorkout() against double-submission while a save is in flight

// A page reload — or iOS discarding a backgrounded tab, which it does
// aggressively — used to wipe the workout outright, since it only ever lived
// in this module's memory. Mirroring every open one out to localStorage lets
// them be rebuilt from real wall-clock timestamps instead of silently
// resetting to nothing. Resumable regardless of how old a draft is —
// deliberately no age cutoff: a workout left open for a day or two is
// exactly the case this exists for, not a reason to discard it.
const SESSIONS_STORAGE_KEY = 'gym-active-sessions-v2';
// Before tabs: a single workout, under its own key — moved into the list on
// first load.
const LEGACY_SESSION_STORAGE_KEY = 'gym-active-session-v1';
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

  // Fresh page load, or the tab was reloaded/discarded while backgrounded —
  // pick the open workouts back up from storage before anything else.
  loadSessions();

  // Drawn right away: the workout itself is already in memory or
  // localStorage, so nothing here needs to wait on the network. This used
  // to await the exercise library first — on a weak signal that left the
  // previous screen showing for seconds after tapping "אימון".
  render();
  if (session) rehydrateSession(session);

  loadLibrary(token);
  loadTodayPlan(token);
  // A segment timer that was running when the page went away picks up
  // where the clock says it should be.
  if (session?.timer) ensureTimerRunning();
}

// Only the exercise picker needs the library, so it loads in the
// background. It stays in memory across visits, so after the first load
// the picker opens instantly while a fresh copy is fetched behind it.
async function loadLibrary(token) {
  try {
    let loaded = await listExerciseLibrary();
    if (loaded.length === 0) {
      await seedExerciseLibraryIfEmpty();
      loaded = await listExerciseLibrary();
    }
    library = loaded;
    libraryReady = true;
    if (!isStale(token) && picker.open) render();
  } catch (err) {
    // Keeps whatever copy is already in memory; the next visit retries.
    console.error('exercise library load failed', err);
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

// Saves every open workout, and which one is on screen. Only the fields
// needed to rebuild each are kept — deliberately not ex.previous/ex.history
// (Firestore-fetched lookups, refetched on restore by rehydrateExercise
// instead of round-tripped through JSON on every tick).
function persistSession() {
  try {
    if (sessions.length === 0) {
      localStorage.removeItem(SESSIONS_STORAGE_KEY);
    } else {
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify({
        activeId: session?.id ?? null,
        sessions: sessions.map(serializeSession),
      }));
    }
  } catch { /* storage full/blocked — the workouts just won't survive a reload */ }
  updateNavBadge();
}

function newSessionId() {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function serializeSession(s) {
  return {
    id: s.id,
    startedAt: s.startedAt.toISOString(),
    realStartedAt: s.realStartedAt.toISOString(),
    hasTime: s.hasTime !== false,
    live: !!s.live,
    editingWorkoutId: s.editingWorkoutId || null,
    originalStartedAt: s.originalStartedAt ? s.originalStartedAt.toISOString() : null,
    originalEndTime: s.originalEndTime ? s.originalEndTime.toISOString() : null,
    timer: s.timer || null,
    planId: s.planId || null,
    planTitle: s.planTitle || '',
    exercises: s.exercises.map((ex) => ({
      _uid: ex._uid,
      name: ex.name,
      category: ex.category,
      weightMode: ex.weightMode,
      weightUnit: ex.weightUnit,
      kind: ex.kind,
      activity: ex.activity,
      inputMode: ex.inputMode,
      sets: ex.sets,
    })),
  };
}

// Reads the open workouts back once per page load — a no-op after that,
// since from then on memory is the source of truth and storage its mirror.
function loadSessions() {
  if (sessionsLoaded) return;
  sessionsLoaded = true;
  let saved = null;
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (raw) {
      saved = JSON.parse(raw);
    } else {
      // The single workout saved before tabs existed becomes the first tab.
      const legacy = localStorage.getItem(LEGACY_SESSION_STORAGE_KEY);
      if (legacy) saved = { activeId: null, sessions: [JSON.parse(legacy)] };
    }
  } catch { /* unreadable — start clean */ }

  sessions = (saved?.sessions || []).map(deserializeSession).filter(Boolean);
  session = sessions.find((s) => s.id === saved?.activeId) || sessions[0] || null;
  // Restored _uid values came from a previous page load's counter — jump
  // past them so any newly-added exercise/set can't collide.
  if (sessions.length) uidSeq = Math.max(uidSeq, Date.now());
  persistSession(); // writes the migrated list
  // The legacy copy goes only once the list really holds it.
  try {
    if (sessions.length === 0 || localStorage.getItem(SESSIONS_STORAGE_KEY)) {
      localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
    }
  } catch { /* fine */ }
}

function deserializeSession(parsed) {
  try {
    return {
      id: parsed.id || newSessionId(),
      startedAt: new Date(parsed.startedAt),
      realStartedAt: new Date(parsed.realStartedAt),
      // Drafts saved before these fields existed: a same-day, non-edit
      // workout was a live one, and every start had a time.
      hasTime: parsed.hasTime ?? true,
      live: parsed.live ?? (!parsed.editingWorkoutId && isSameDay(new Date(parsed.startedAt), new Date(parsed.realStartedAt))),
      editingWorkoutId: parsed.editingWorkoutId || null,
      originalStartedAt: parsed.originalStartedAt
        ? new Date(parsed.originalStartedAt)
        : (parsed.editingWorkoutId ? new Date(parsed.startedAt) : null),
      originalEndTime: parsed.originalEndTime ? new Date(parsed.originalEndTime) : null,
      timer: parsed.timer || null,
      planId: parsed.planId || null,
      planTitle: parsed.planTitle || '',
      exercises: (parsed.exercises || []).map((ex) => ({
        ...ex,
        previous: null,
        prevLoaded: false,
        history: null,
      })),
    };
  } catch {
    return null; // one corrupt entry doesn't take the other workouts with it
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
// registration to guard against. The guard makes it a silent no-op whenever
// a different page is mounted or no workout is open.
function persistIfActive() {
  if (!container || !sessionsLoaded || sessions.length === 0) return;
  persistSession();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistIfActive();
});
window.addEventListener('pagehide', persistIfActive);

// Exercises restored from storage (or reopened from History) were kept
// without their "previous performance" data — fetched once per page load
// per workout, when it's first shown.
function rehydrateSession(s) {
  if (s.rehydrated) return;
  s.rehydrated = true;
  for (const entry of s.exercises) {
    if (!entry.prevLoaded) rehydrateExercise(entry, s);
  }
}

// Mirrors the tail of addExerciseToSession() for exercises that came back
// from storage rather than from the picker — same fetch, same patch-in-place
// (only if that workout is still the one on screen).
async function rehydrateExercise(entry, owner) {
  const [prev, hist] = await Promise.all([
    getLastPerformance(entry.name, owner.editingWorkoutId),
    getExerciseHistory(entry.name, owner.editingWorkoutId),
  ]);
  entry.previous = prev;
  entry.history = hist;
  entry.prevLoaded = true;
  if (container && owner === session) patchExerciseCard(entry);
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
      ${planCardVisible() ? '<div id="plan-slot"></div>' : ''}
      <div class="card" style="text-align:center;">
        <h2>מוכן להתחיל?</h2>
        <p class="text-muted">לחיצה תתחיל מעקב אחר האימון.</p>
        <button class="btn btn-primary btn-block" id="start-workout-btn">התחלת אימון</button>
        <button class="btn btn-secondary btn-block" id="start-past-workout-btn" style="margin-top:8px;">הוספת אימון שכבר בוצע</button>
      </div>`;
    container.querySelector('#start-workout-btn').addEventListener('click', () => startWorkout());
    container.querySelector('#start-past-workout-btn').addEventListener('click', openPastWorkoutSheet);
    container.querySelector('#plan-slot')?.replaceWith(planCardEl);
    restoreScroll();
    return;
  }

  const isEditing = !!session.editingWorkoutId;
  const whenText = `${isSameDay(session.startedAt, new Date()) ? 'היום' : formatDateHe(session.startedAt)}${session.hasTime ? ` · ${formatTimeHe(session.startedAt)}` : ''}`;

  container.innerHTML = `
    ${renderSessionTabs()}
    <div class="session-head">
      <button type="button" class="session-when" id="session-when-btn" aria-label="שינוי תאריך ושעה">
        ${icon('calendar-days', { className: 'icon--sm' })}
        <span>${esc(whenText)}</span>
        ${session.hasTime ? '' : '<span class="session-when-add">+ שעה</span>'}
      </button>
      <button type="button" class="session-delete" id="delete-workout-btn" aria-label="מחיקת האימון">${icon('trash-2', { className: 'icon--sm' })}</button>
    </div>
    ${isEditing ? `
    <div class="session-edit-banner">
      <span>עריכת אימון שמור</span>
      <button type="button" class="btn btn-secondary" id="cancel-edit-btn">ביטול עריכה</button>
    </div>` : ''}

    <div id="progress-slot"></div>

    <div id="exercise-list"></div>

    <button class="btn btn-outline btn-block" id="add-exercise-btn">+ הוספת תרגיל</button>
    <button class="btn btn-secondary btn-block" id="finish-workout-btn" style="margin-top:8px;">סיום אימון</button>

    ${picker.open ? renderPicker() : ''}
    ${lastTimeModal ? renderLastTimeModal() : ''}
  `;

  const list = container.querySelector('#exercise-list');
  session.exercises.forEach((ex) => {
    list.appendChild(buildExerciseCard(ex));
  });

  applyFocusMode();
  restoreScroll();

  wireSessionTabs();
  container.querySelector('#finish-workout-btn').addEventListener('click', finishWorkout);
  container.querySelector('#cancel-edit-btn')?.addEventListener('click', cancelEditing);
  container.querySelector('#session-when-btn').addEventListener('click', openWorkoutDetailsSheet);
  container.querySelector('#delete-workout-btn').addEventListener('click', deleteCurrentWorkout);
  container.querySelector('#add-exercise-btn').addEventListener('click', () => {
    picker = { open: true, query: '', category: null };
    render();
    loadRecentExercises();
  });

  if (picker.open) wirePicker();
  if (lastTimeModal) wireLastTimeModal();
}

// ---------- open-workout tabs ----------
//
// One tab per open workout, above it: what kind it is (the History colours
// — strength / cardio), when, "עריכה" for a saved one reopened, and a clock
// while one of its segment timers runs. "+" opens another, up to
// MAX_SESSIONS.

function sessionKinds(s) {
  const cardio = s.exercises.filter((ex) => ex.kind === 'cardio');
  const strength = s.exercises.some((ex) => ex.kind !== 'cardio');
  const activities = [...new Set(cardio.map((ex) => cardioActivity(ex.activity).name))];
  return { strength, cardio: cardio.length > 0, activities };
}

function sessionTabTitle(s) {
  if (s.planTitle) return s.planTitle;
  const { strength, activities } = sessionKinds(s);
  const parts = [...(strength ? ['כוח'] : []), ...activities];
  if (parts.length === 0) return 'אימון';
  return parts.length > 2 ? `${parts.slice(0, 2).join(' + ')}…` : parts.join(' + ');
}

function sessionTabWhen(s) {
  const today = isSameDay(s.startedAt, new Date());
  const day = today ? '' : formatDayMonthHe(s.startedAt);
  const time = s.hasTime ? formatTimeHe(s.startedAt) : '';
  const when = [day, time].filter(Boolean).join(' · ') || 'היום';
  return s.editingWorkoutId ? `עריכה · ${when}` : when;
}

function renderSessionTabs() {
  return `
    <div class="session-tabs" role="tablist" aria-label="אימונים פתוחים">
      ${sessions.map((s) => {
        const active = s === session;
        const { strength, cardio } = sessionKinds(s);
        const timing = s.timer && s.timer.pausedMs === null;
        return `
        <button type="button" class="session-tab${active ? ' session-tab--active' : ''}" role="tab" aria-selected="${active}" data-session-tab="${esc(s.id)}">
          <span class="session-tab-dots" aria-hidden="true">${strength ? '<span class="session-tab-dot session-tab-dot--strength"></span>' : ''}${cardio ? '<span class="session-tab-dot session-tab-dot--cardio"></span>' : ''}</span>
          <span class="session-tab-text">
            <span class="session-tab-title">${esc(sessionTabTitle(s))}</span>
            <span class="session-tab-when">${esc(sessionTabWhen(s))}</span>
          </span>
          ${timing ? `<span class="session-tab-timer" aria-label="טיימר פועל">${icon('clock', { className: 'icon--sm' })}</span>` : ''}
        </button>`;
      }).join('')}
      ${sessions.length < MAX_SESSIONS
        ? `<button type="button" class="session-tab session-tab--add" id="add-session-btn" aria-label="אימון נוסף">${icon('square-plus', { className: 'icon--sm' })}</button>`
        : ''}
    </div>`;
}

function wireSessionTabs() {
  container.querySelectorAll('[data-session-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchToSession(sessions.find((s) => s.id === btn.dataset.sessionTab)));
  });
  container.querySelector('#add-session-btn')?.addEventListener('click', openNewSessionSheet);
  // Keep the tab on screen in view when the strip scrolls sideways.
  container.querySelector('.session-tab--active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// Shows another open workout. The one being left keeps everything as is,
// its segment timer included — that runs off timestamps, so it's caught up
// the moment its tab is shown again.
function switchToSession(next) {
  if (!next || next === session || finishingWorkout) return;
  leaveSession();
  session = next;
  persistSession();
  render();
  window.scrollTo(0, 0);
  rehydrateSession(session);
  if (session.timer) ensureTimerRunning();
}

// Puts away whatever belongs to the workout on screen, before another is
// shown: open wheels, the exercise picker, the "last time" dialog, and the
// timer loop (which only ever drives the workout on screen).
function leaveSession() {
  for (const refs of exerciseRefs.values()) {
    for (const ctrl of refs.setsEls.values()) ctrl.closeWheel();
  }
  picker = { open: false, query: '', category: null };
  lastTimeModal = null;
  stopTimerLoop();
}

// Takes a workout off the tabs (finished, deleted, or an edit cancelled) and
// shows the one next to it — or the "start a workout" screen if it was the
// last.
function closeSession(s) {
  const idx = sessions.indexOf(s);
  if (idx === -1) return;
  sessions.splice(idx, 1);
  if (s === session) {
    leaveSession();
    session = sessions[Math.min(idx, sessions.length - 1)] || null;
  }
  persistSession();
  render();
  window.scrollTo(0, 0);
  if (session) {
    rehydrateSession(session);
    if (session.timer) ensureTimerRunning();
  }
}

function openNewSessionSheet() {
  openBottomSheet({
    ariaLabel: 'אימון נוסף',
    render(body, sheetApi) {
      body.innerHTML = `
        <h3 style="margin:0 0 14px; color:var(--text);">אימון נוסף</h3>
        <p class="text-muted" style="font-size:0.8rem; margin:0 0 14px;">האימונים הפתוחים נשארים כמו שהם — עוברים ביניהם בלשוניות למעלה.</p>
        <button type="button" class="btn btn-primary btn-block" data-new-live>התחלת אימון</button>
        <button type="button" class="btn btn-secondary btn-block" data-new-past style="margin-top:8px;">הוספת אימון שכבר בוצע</button>`;
      body.querySelector('[data-new-live]').addEventListener('click', () => {
        sheetApi.close();
        startWorkout();
      });
      body.querySelector('[data-new-past]').addEventListener('click', () => {
        sheetApi.close();
        openPastWorkoutSheet();
      });
    },
  });
}

// "אימון" in the bottom nav shows how many workouts are open, once there's
// more than one.
function updateNavBadge() {
  const link = document.querySelector('#bottom-nav a[data-route="session"]');
  if (!link) return;
  let badge = link.querySelector('.nav-badge');
  if (sessions.length > 1) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'nav-badge num';
      link.appendChild(badge);
    }
    badge.textContent = String(sessions.length);
    badge.setAttribute('aria-label', `${sessions.length} אימונים פתוחים`);
  } else {
    badge?.remove();
  }
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
    ? `תרגיל ${current.exIdx + 1} מתוך ${session.exercises.length} · ${session.exercises[current.exIdx].kind === 'cardio' ? 'קטע' : 'סט'} ${current.setIdx + 1} מתוך ${current.setCount}`
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

// Cardio's PR pane: its records, each with the date it was set (they can
// come from different workouts, so there's no single breakdown to show).
function renderCardioRecordsPane(records, roleAttr) {
  return `
    <div class="last-time-pane" data-role="${roleAttr}">
      <div class="cardio-records">
        ${records.map((r) => `
          <div class="cardio-record">
            <span class="cardio-record-label">${esc(r.label)}</span>
            <span class="num last-time-headline-value">${esc(r.text)}</span>
            <span class="last-time-headline-date">${esc(formatDateHe(r.date))}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderCardioLastPane({ workoutDate, sets }, activity, roleAttr) {
  return `
    <div class="last-time-pane" data-role="${roleAttr}">
      <div class="last-time-headline">
        <span class="last-time-headline-date">${esc(formatDateHe(workoutDate))}</span>
      </div>
      ${cardioTable({ activity, sets })}
    </div>`;
}

function renderLastTimeModal() {
  const { name } = lastTimeModal;
  // Each pane as markup (or null when there's no data for it) — cardio and
  // strength differ only in what goes inside them.
  let pr;
  let last;
  if (lastTimeModal.cardio) {
    const { records, activity } = lastTimeModal;
    pr = records.length ? (role) => renderCardioRecordsPane(records, role) : null;
    last = lastTimeModal.last ? (role) => renderCardioLastPane(lastTimeModal.last, activity, role) : null;
  } else {
    pr = lastTimeModal.pr && ((role) => renderLastTimePane(lastTimeModal.pr, role));
    last = lastTimeModal.last && ((role) => renderLastTimePane(lastTimeModal.last, role));
  }
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
          ${pr('pane-pr')}
          ${last('pane-last')}
        </div>
      </div>`;
  } else {
    body = (pr || last)('pane-solo');
  }

  return `
    <div class="modal-overlay" id="last-time-overlay">
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="last-time-title">
        <button class="modal-close" id="last-time-close" type="button" aria-label="סגירה">${icon('x', { className: 'icon--sm' })}</button>
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

// The library plus the built-in cardio activities, which aren't stored in it.
function pickableExercises() {
  return [...library, ...CARDIO_LIBRARY];
}

function renderPicker() {
  const q = picker.query.trim();
  const pickable = pickableExercises();
  const byCategory = picker.category ? pickable.filter((e) => e.category === picker.category) : pickable;
  const matches = byCategory.filter((e) => e.name.includes(q));
  const exactMatch = pickable.some((e) => e.name === q);

  // Skips exercises already in this session — the point is speeding up
  // what to add *next*, not re-suggesting what's already on screen.
  const alreadyAdded = new Set(session.exercises.map((e) => e.name));
  const recentEntries = recentExerciseNames
    .filter((name) => !alreadyAdded.has(name))
    .map((name) => pickable.find((e) => e.name === name))
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
      <div class="pill-row-label">${CARDIO_CATEGORY}</div>
      <div class="pill-row">
        ${CARDIO_LIBRARY.map((e) => `<button class="pill" data-pick="${esc(e.id)}">${esc(e.name)}</button>`).join('')}
      </div>
      <input type="text" id="picker-input" class="search-bar" placeholder="חיפוש תרגיל..." value="${esc(picker.query)}"
        style="margin:10px 0;">
      <div id="picker-results">
        ${matches.map((e) => `
          <div class="row" style="gap:6px; margin-bottom:4px;">
            <button class="btn btn-secondary" style="flex:1; justify-content:flex-start;" data-pick="${esc(e.id)}">${esc(e.name)}</button>
            ${e.kind === 'cardio' ? '' : `<button type="button" class="set-more-btn" style="min-width:var(--control-h); min-height:var(--control-h);" data-edit-lib="${esc(e.id)}" aria-label="עריכת התרגיל">${icon('pencil', { className: 'icon--sm' })}</button>`}
          </div>`).join('')}
        ${!libraryReady && library.length === 0
          ? `<p class="text-muted" style="text-align:center;">טוען תרגילים...</p>`
          : `${matches.length === 0 ? emptyState('אין תרגילים בקטגוריה הזו.', { centered: true }) : ''}
        ${q && !exactMatch ? `<button class="btn btn-primary btn-block" id="picker-add-new">+ הוספת "${esc(q)}" כתרגיל חדש</button>` : ''}`}
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
      const lib = pickableExercises().find((e) => e.id === btn.dataset.pick);
      if (lib) addExerciseToSession(lib);
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
  if (lib.kind === 'cardio') {
    Object.assign(entry, { kind: 'cardio', activity: lib.activity, inputMode: 'free' });
    // Starts with one segment ready, so "30 min walk" is just type and ✓.
    entry.sets.push(newCardioSegment(entry));
  }
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
  const isCardio = ex.kind === 'cardio';

  // Cardio swaps the weighting/unit switches for a free/treadmill switch
  // (walk and run only) and a running total of what's been done so far.
  const controlsHtml = isCardio ? `
        <div class="row cardio-controls">
          ${hasInputModes(ex.activity) ? toggleGroup({
            name: 'input',
            active: ex.inputMode,
            label: 'אופן הזנה',
            groupAttrs: 'data-input-mode-group',
            options: [{ value: 'free', label: 'חופשי' }, { value: 'treadmill', label: 'הליכון' }],
          }) : ''}
          <span class="cardio-summary num" data-role="cardio-summary"></span>
        </div>` : `
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
        </div>`;

  el.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
      <button type="button" class="set-more-btn exercise-drag-handle" data-role="drag-handle" aria-label="גרירה לשינוי סדר התרגילים" style="flex:none;">${icon('grip-vertical', { className: 'icon--sm' })}</button>
      <span class="exercise-num" data-role="exercise-num">${esc(exNum)}</span>
      <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:2px;">
        <span class="exercise-name">${esc(ex.name)}</span>
        <span class="exercise-meta${allDone ? ' exercise-meta--done' : ''}" data-role="exercise-meta">${esc(exerciseMetaText(ex))}</span>
      </div>
      <button type="button" class="set-more-btn" data-last-time aria-label="פעם קודמת">${icon('clock', { className: 'icon--sm' })}</button>
      <button type="button" class="set-more-btn set-more-btn--danger" data-delete-exercise aria-label="מחיקת התרגיל">${icon('trash-2', { className: 'icon--sm' })}</button>
      <button type="button" class="set-more-btn" data-collapse-toggle aria-label="כיווץ/הרחבת התרגיל">
        <span class="history-chevron${isOpen ? ' history-chevron--open' : ''}" data-collapse-chevron aria-hidden="true">${icon('chevron-down', { className: 'icon--sm' })}</span>
      </button>
    </div>
    <div class="history-detail${isOpen ? ' history-detail--open' : ''}" data-exercise-detail>
      <div class="history-detail-inner exercise-detail-inner">
        ${controlsHtml}
        <div class="sets-list"></div>
        <div class="row" style="gap:8px; margin-top:10px;">
          <button class="btn btn-dashed" data-add-set>${isCardio ? '+ קטע' : '+ סט'}</button>
          ${isCardio ? '<button type="button" class="btn btn-dashed" data-repeat-segments>חזרה ×</button>' : ''}
          <button type="button" class="btn btn-outline" data-finish-exercise style="flex:1;">סיום תרגיל</button>
        </div>
      </div>
    </div>
  `;

  el.querySelector('[data-last-time]').addEventListener('click', () => {
    lastTimeModal = isCardio
      ? { name: ex.name, cardio: true, activity: ex.activity, records: findCardioRecords(ex.activity, cardioPoints(ex)), last: ex.previous }
      : { name: ex.name, pr: findExercisePR(ex), last: findExerciseLast(ex) };
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
  el.querySelector('[data-repeat-segments]')?.addEventListener('click', () => openRepeatSheet(ex));
  el.querySelector('[data-finish-exercise]').addEventListener('click', () => {
    toggleExerciseCollapse(ex);
  });

  wireExerciseDragHandle(el.querySelector('[data-role="drag-handle"]'), ex, el);

  const modeGroupEl = el.querySelector('[data-weight-mode-group]');
  const unitGroupEl = el.querySelector('[data-weight-unit-group]');
  const inputModeGroupEl = el.querySelector('[data-input-mode-group]');
  [modeGroupEl, unitGroupEl, inputModeGroupEl].forEach((g) => g?.classList.add('toggle-group--live'));

  modeGroupEl?.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      setExerciseWeighting(ex, { weightMode: btn.dataset.mode });
      patchExerciseCard(ex);
    });
  });
  unitGroupEl?.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      convertExerciseWeightUnit(ex, btn.dataset.unit);
      patchExerciseCard(ex);
    });
  });
  // The rows' fields change with the mode, so syncSetRows rebuilds them
  // (cardioRole differs); entered values stay on the segments either way.
  inputModeGroupEl?.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      ex.inputMode = btn.dataset.input;
      patchExerciseCard(ex);
      persistSession();
    });
  });

  el.querySelector('[data-add-set]').addEventListener('click', () => {
    if (isCardio) {
      ex.sets.push(newCardioSegment(ex));
      patchExerciseCard(ex);
      return;
    }
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
    inputModeGroupEl,
    summaryEl: el.querySelector('[data-role="cardio-summary"]'),
    detailEl: el.querySelector('[data-exercise-detail]'),
    chevronEl: el.querySelector('[data-collapse-chevron]'),
    metaEl: el.querySelector('[data-role="exercise-meta"]'),
  };
  exerciseRefs.set(ex._uid, refs);

  patchToggleGroup(modeGroupEl, ex.weightMode);
  patchToggleGroup(unitGroupEl, ex.weightUnit);
  patchToggleGroup(inputModeGroupEl, ex.inputMode);
  syncSetRows(ex, refs);
  patchCardioSummary(ex, refs);

  return el;
}

// A new segment repeats this exercise's last one (the usual "same again"
// for intervals); else the same position from last time; else the
// activity's defaults — empty when logging a walk/run freely.
function newCardioSegment(ex) {
  const { defaults } = cardioActivity(ex.activity);
  const source = ex.sets.at(-1)
    || (ex.prevLoaded ? ex.previous?.sets?.[ex.sets.length] : null)
    || defaults[ex.inputMode] || defaults.free;
  const seg = { _uid: nextUid(), notes: '', done: false };
  for (const k of SEGMENT_KEYS) seg[k] = source[k] ?? null;
  return seg;
}

// Totals of the segments marked done — the same ones finishing saves.
function patchCardioSummary(ex, refs) {
  if (!refs.summaryEl) return;
  const doneSegments = ex.sets.filter((s) => s.done);
  const total = formatSummary(summarizeSegments(doneSegments), { withPace: hasInputModes(ex.activity) });
  refs.summaryEl.textContent = total ? `סה"כ ${total}` : '';
  // Stairs/bike have no switch, so until there's a total the row is empty.
  refs.summaryEl.parentElement.hidden = !refs.inputModeGroupEl && !total;
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
  patchToggleGroup(refs.inputModeGroupEl, ex.inputMode);
  patchCardioSummary(ex, refs);
  patchExerciseMeta(ex, refs);
  applyFocusMode();
  patchExerciseCollapse(ex);
}

function exerciseSetsSummary(ex) {
  return { done: ex.sets.filter((s) => s.done).length, total: ex.sets.length };
}

function exerciseMetaText(ex) {
  const { done, total } = exerciseSetsSummary(ex);
  return `${ex.category} · ${done}/${total} ${ex.kind === 'cardio' ? 'קטעים' : 'סטים'}`;
}

function patchExerciseMeta(ex, refs) {
  if (!refs.metaEl) return;
  const { done, total } = exerciseSetsSummary(ex);
  const allDone = total > 0 && done === total;
  refs.metaEl.textContent = exerciseMetaText(ex);
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

// What a row's type picker shows: a drop set's leader always reads as
// "דרופ סט", even if its stored type predates that (older saved workouts
// reopened for editing).
function shownSetType(set, role) {
  return role === 'parent' ? 'dropset' : set.type;
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
    const role = ex.kind === 'cardio' ? cardioRole(ex) : computeSetRole(ex, set);
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
      ctrl = ex.kind === 'cardio' ? buildCardioRow(ex, set) : buildSetRow(ex, set, role);
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
    if (ex.kind === 'cardio') patchCardioRow(ex, set, ctrl);
    else patchSetRow(ex, set, ctrl);
  });
}

// A regular set and a drop set's leader get the exact same type picker, so
// switching is one tap either way: "דרופ סט" turns a set into a group
// (adding its first stage), and "רגיל"/"חימום" on a leader turns the group
// back into a plain set (revertDropSet). A stage has no picker — it's
// always part of its group — just its own "+ ירידה", which adds the next
// stage right after it.
function buildSetRowMeta(set, role) {
  if (role === 'child') {
    return `<button type="button" class="btn-mini-dashed" data-role="add-stage-btn">+ ירידה</button>`;
  }
  return toggleGroup({
    name: 'type',
    active: shownSetType(set, role),
    label: 'סוג סט',
    groupAttrs: 'data-set-type-group',
    options: SET_TYPES.map((t) => ({ value: t.id, label: t.label })),
  });
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
        <span class="done-glyph">${icon('check', { className: 'icon--sm' })}</span>
      </button>
    </div>
    <div class="wheel-picker-slot" data-role="wheel-slot" hidden></div>
    <div class="set-row-meta">
      ${buildSetRowMeta(set, role)}
      <button type="button" class="set-more-btn set-more-btn--meta" data-role="more-btn" aria-label="עוד אפשרויות לסט">${icon('ellipsis', { className: 'icon--sm' })}</button>
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
        if (role === 'parent') {
          if (btn.dataset.type !== 'dropset') revertDropSet(ex, set, btn.dataset.type, typeGroupEl);
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

// ---------- cardio segments: same row shape as a set (index, fields, ✓),
// with the activity's own fields in place of weight/reps. Every field is
// optional; an empty one shows, greyed, whatever the others imply.

function cardioRole(ex) {
  return `cardio:${segmentFields(ex.activity, ex.inputMode).join(',')}`;
}

function onCardioEdit(ex) {
  persistSession();
  patchExerciseCard(ex);
}

// The greyed hint in an empty field — e.g. the pace that time + distance
// work out to. "—" when nothing implies it.
function cardioPlaceholder(fieldId, metrics) {
  const v = {
    duration: metrics.durationSec && formatClock(metrics.durationSec),
    distance: metrics.distanceKm && formatKm(metrics.distanceKm),
    pace: metrics.paceSec && formatClock(metrics.paceSec),
    speed: metrics.speedKmh && formatSpeed(metrics.speedKmh),
  }[fieldId];
  return v || '—';
}

// What the row's fields don't already show: on a treadmill, distance and
// pace; when logging freely, the pace/distance hints cover it.
function cardioDerivedText(ex, set) {
  const fields = segmentFields(ex.activity, ex.inputMode);
  if (!fields.includes('speed')) return '';
  const m = segmentMetrics(set);
  const parts = [];
  if (m.distanceKm) parts.push(`${formatKm(m.distanceKm)} ק"מ`);
  if (hasInputModes(ex.activity) && m.paceSec) parts.push(`${formatClock(m.paceSec)} /ק"מ`);
  return parts.join(' · ');
}

function buildCardioRow(ex, set) {
  const fields = segmentFields(ex.activity, ex.inputMode);
  const efforts = cardioActivity(ex.activity).efforts;
  const row = document.createElement('div');
  row.className = 'set-row set-row--entering';

  row.innerHTML = `
    <div class="set-row-main set-row-main--cardio" style="grid-template-columns:28px repeat(${fields.length}, minmax(0, 1fr)) 36px;">
      <span class="set-index" data-role="set-index"></span>
      ${fields.map((f) => `<div class="set-field" data-field="${f}"></div>`).join('')}
      <button type="button" class="set-done-btn${set.done ? ' set-done-btn--done' : ''}" data-role="done-btn" aria-label="סימון קטע כבוצע">
        <span class="done-glyph">${icon('check', { className: 'icon--sm' })}</span>
      </button>
    </div>
    <div class="set-row-meta">
      <button type="button" class="timer-chip num" data-role="timer-btn" aria-label="הפעלת טיימר לקטע">${icon('play', { className: 'icon--sm' })}</button>
      <button type="button" class="timer-chip" data-role="timer-stop" aria-label="עצירת הטיימר" hidden>${icon('square', { className: 'icon--sm' })}</button>
      ${efforts.length ? `
        <div class="effort-chips" role="group" aria-label="עצימות">
          ${efforts.map((e) => `<button type="button" class="effort-chip" data-effort="${e.id}" aria-pressed="false">${e.label}</button>`).join('')}
        </div>` : ''}
      <button type="button" class="set-more-btn set-more-btn--meta" data-role="more-btn" aria-label="עוד אפשרויות לקטע">${icon('ellipsis', { className: 'icon--sm' })}</button>
      <span class="cardio-derived num" data-role="derived"></span>
    </div>
    <span class="set-row-notes" data-role="notes" hidden></span>
  `;

  const inputs = {};
  for (const f of fields) {
    const { key, clock, unit, aria } = CARDIO_FIELDS[f];
    const slot = row.querySelector(`[data-field="${f}"]`);
    // Speed and pace are two forms of one value — entering one drops the
    // other, so a stale pace can't override a speed typed afterwards.
    const commit = (v) => {
      set[key] = v;
      if (v !== null && key === 'paceSec') set.speedKmh = null;
      if (v !== null && key === 'speedKmh') set.paceSec = null;
      onCardioEdit(ex);
    };
    inputs[f] = clock
      ? mountClockField(slot, { seconds: set[key], unitLabel: unit, ariaLabel: aria, onCommit: commit })
      : mountNumericField(slot, { value: set[key], unitLabel: unit, ariaLabel: aria, nullable: true, onCommit: commit });
  }

  // Tapping the selected intensity again clears it — it's optional too.
  row.querySelectorAll('[data-effort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      set.effort = set.effort === btn.dataset.effort ? null : btn.dataset.effort;
      onCardioEdit(ex);
    });
  });

  const doneBtn = row.querySelector('[data-role="done-btn"]');
  doneBtn.addEventListener('click', () => onToggleDone(ex, set));

  const ctrl = {
    row,
    inputs,
    doneBtn,
    effortBtns: [...row.querySelectorAll('[data-effort]')],
    timerBtn: row.querySelector('[data-role="timer-btn"]'),
    timerStopBtn: row.querySelector('[data-role="timer-stop"]'),
    indexEl: row.querySelector('[data-role="set-index"]'),
    derivedEl: row.querySelector('[data-role="derived"]'),
    notesEl: row.querySelector('[data-role="notes"]'),
    closeWheel() {},
  };

  row.querySelector('[data-role="more-btn"]').addEventListener('click', () => {
    openCardioSegmentSheet(ex, set);
  });

  // ▶ on this segment's own running timer pauses/resumes it; on any other
  // segment it (re)starts the timer there.
  ctrl.timerBtn.addEventListener('click', () => {
    const t = session.timer;
    if (t && t.exUid === ex._uid && t.segUid === set._uid) toggleTimerPause();
    else startSegmentTimer(ex, set);
  });
  ctrl.timerStopBtn.addEventListener('click', stopTimer);

  return ctrl;
}

function patchCardioRow(ex, set, ctrl) {
  const wasDone = ctrl.row.classList.contains('set-row--done');
  const metrics = segmentMetrics(set);

  ctrl.indexEl.textContent = String(ex.sets.indexOf(set) + 1);
  for (const [f, field] of Object.entries(ctrl.inputs)) {
    field.setValue(set[CARDIO_FIELDS[f].key]);
    field.setPlaceholder(cardioPlaceholder(f, metrics));
  }
  for (const btn of ctrl.effortBtns) {
    const on = set.effort === btn.dataset.effort;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  }
  ctrl.derivedEl.textContent = cardioDerivedText(ex, set);
  patchTimerChip(ex, set);

  ctrl.doneBtn.classList.toggle('set-done-btn--done', set.done);
  ctrl.row.classList.toggle('set-row--done', set.done);
  if (set.done && !wasDone) {
    ctrl.row.classList.remove('set-row--celebrate');
    void ctrl.row.offsetWidth;
    ctrl.row.classList.add('set-row--celebrate');
  }

  if (set.notes) {
    ctrl.notesEl.hidden = false;
    ctrl.notesEl.innerHTML = `${icon('sticky-note', { className: 'icon--sm' })} ${esc(set.notes)}`;
  } else {
    ctrl.notesEl.hidden = true;
  }
}

// ---------- segment timer ----------
// ▶ on a segment counts its time down — or, with no time entered, counts
// up like a stopwatch until ⏹. A countdown that ends marks the segment
// done and rolls straight into the next one, so a block of intervals runs
// hands-free.
//
// Lives on the session (session.timer), so it's persisted with it, and
// it's all timestamps rather than a running count: a locked phone, a
// backgrounded tab or a reload just catches up on the next tick instead of
// losing time. { exUid, segUid, mode: 'down'|'up', startedAt, endsAt,
// pausedMs } — pausedMs (ms left, or ms elapsed when counting up) is set
// only while paused.

let timerInterval = null;
let wakeLock = null;
let audioCtx = null;

function timerTarget() {
  const t = session?.timer;
  if (!t) return null;
  const ex = session.exercises.find((e) => e._uid === t.exUid);
  const set = ex?.sets.find((s) => s._uid === t.segUid);
  return set ? { t, ex, set } : null;
}

// ms left counting down, or ms elapsed counting up.
function timerReading(t, now = Date.now()) {
  if (t.pausedMs !== null) return t.pausedMs;
  return t.mode === 'down' ? Math.max(0, t.endsAt - now) : now - t.startedAt;
}

function startSegmentTimer(ex, set, startAt = Date.now()) {
  // Created on a tap so the browser lets it play the end-of-segment beep later.
  if (!audioCtx && window.AudioContext) {
    try { audioCtx = new AudioContext(); } catch { /* no sound, vibration still works */ }
  }
  const prev = timerTarget();
  session.timer = {
    exUid: ex._uid,
    segUid: set._uid,
    mode: set.durationSec ? 'down' : 'up',
    startedAt: startAt,
    endsAt: set.durationSec ? startAt + set.durationSec * 1000 : null,
    pausedMs: null,
  };
  if (prev && prev.ex !== ex) patchExerciseCard(prev.ex);
  ensureTimerRunning();
  patchExerciseCard(ex);
  persistSession();
}

function toggleTimerPause() {
  const t = session?.timer;
  if (!t) return;
  const now = Date.now();
  if (t.pausedMs === null) {
    t.pausedMs = timerReading(t, now);
    releaseWakeLock();
  } else {
    if (t.mode === 'down') t.endsAt = now + t.pausedMs;
    else t.startedAt = now - t.pausedMs;
    t.pausedMs = null;
    requestWakeLock();
  }
  const target = timerTarget();
  if (target) patchExerciseCard(target.ex);
  persistSession();
}

// ⏹: a stopwatch's time becomes the segment's and it's marked done; a
// countdown is just cancelled (✓ is still there if it was done anyway).
function stopTimer() {
  const target = timerTarget();
  session.timer = null;
  stopTimerLoop();
  if (!target) return;
  if (target.t.mode === 'up') {
    target.set.durationSec = Math.max(1, Math.round(timerReading(target.t) / 1000));
    if (!target.set.done) onToggleDone(target.ex, target.set);
  }
  patchExerciseCard(target.ex);
  persistSession();
}

function ensureTimerRunning() {
  if (!timerInterval) timerInterval = setInterval(tickTimer, 250);
  if (session?.timer?.pausedMs === null) requestWakeLock();
}

function stopTimerLoop() {
  clearInterval(timerInterval);
  timerInterval = null;
  releaseWakeLock();
}

function tickTimer() {
  const target = timerTarget();
  if (!target) {
    // The workout was finished/cancelled, or the segment deleted.
    if (session) session.timer = null;
    stopTimerLoop();
    return;
  }
  const { t, ex, set } = target;
  if (t.mode === 'down' && t.pausedMs === null && Date.now() >= t.endsAt) {
    completeTimedSegment(ex, set, t.endsAt);
    return;
  }
  patchTimerChip(ex, set);
}

// Next segment in this exercise still to do, with a time to count down —
// one without a time ends the run (it'd be a stopwatch needing a ⏹).
function nextTimedSegment(ex, set) {
  const after = ex.sets.slice(ex.sets.indexOf(set) + 1);
  const next = after.find((s) => !s.done);
  return next && next.durationSec ? next : null;
}

function completeTimedSegment(ex, set, endedAt) {
  if (!set.done) onToggleDone(ex, set);
  signalSegmentEnd();
  const next = nextTimedSegment(ex, set);
  if (next) {
    // From when this one actually ended, not from now — after a locked
    // screen, the next tick keeps rolling through what elapsed meanwhile.
    startSegmentTimer(ex, next, endedAt);
    tickTimer();
  } else {
    session.timer = null;
    stopTimerLoop();
    patchExerciseCard(ex);
    persistSession();
    showToast(`${icon('check', { className: 'icon--sm' })} סיימת את הקטעים`);
  }
}

function signalSegmentEnd() {
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  if (!audioCtx) return;
  try {
    audioCtx.resume?.();
    [0, 0.25].forEach((offset) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(audioCtx.destination);
      const start = audioCtx.currentTime + offset;
      osc.start(start);
      osc.stop(start + 0.15);
    });
  } catch { /* sound is a nicety */ }
}

// Keeps the screen on while a timer runs — reading it off a phone propped
// on a treadmill is the main use. Browsers drop the lock whenever the page
// is hidden, so it's re-requested on return (see the visibilitychange
// listener below).
async function requestWakeLock() {
  if (wakeLock || !navigator.wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch { /* denied or unsupported — the timer still works */ }
}

function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && session?.timer) {
    tickTimer();
    if (session?.timer?.pausedMs === null) requestWakeLock();
  }
});

// The row's timer chip — the only part of the screen updated every tick.
function patchTimerChip(ex, set) {
  const ctrl = exerciseRefs.get(ex._uid)?.setsEls.get(set._uid);
  if (!ctrl?.timerBtn) return;
  const t = session?.timer;
  const mine = t && t.exUid === ex._uid && t.segUid === set._uid;
  ctrl.row.classList.toggle('set-row--timing', !!mine);
  ctrl.timerStopBtn.hidden = !mine;
  if (!mine) {
    ctrl.timerBtn.innerHTML = icon('play', { className: 'icon--sm' });
    ctrl.timerBtn.setAttribute('aria-label', set.durationSec ? 'הפעלת טיימר לקטע' : 'הפעלת סטופר לקטע');
    ctrl.timerBtn.classList.remove('active');
    return;
  }
  const paused = t.pausedMs !== null;
  // A countdown shows 0:01 until it really ends; a stopwatch counts whole seconds done.
  const sec = (t.mode === 'down' ? Math.ceil : Math.floor)(timerReading(t) / 1000);
  ctrl.timerBtn.innerHTML = `${icon(paused ? 'play' : 'pause', { className: 'icon--sm' })}<span>${formatClock(sec)}</span>`;
  ctrl.timerBtn.setAttribute('aria-label', paused ? 'המשך טיימר' : 'השהיית טיימר');
  ctrl.timerBtn.classList.toggle('active', !paused);
}

// "חזרה ×": appends copies of the last few segments, e.g. a 1-min run +
// 1-min walk pair, 6 more times.
function openRepeatSheet(ex) {
  if (ex.sets.length === 0) return;
  const maxBlock = Math.min(4, ex.sets.length);
  let block = Math.min(2, maxBlock);
  let times = 3;

  openBottomSheet({
    ariaLabel: 'חזרה על קטעים',
    render(body, sheetApi) {
      body.innerHTML = `
        <h3 style="margin:0 0 14px; color:var(--text);">חזרה על קטעים</h3>
        <div class="sheet-field-label">אילו קטעים</div>
        <div class="pill-row">
          ${Array.from({ length: maxBlock }, (_, i) => i + 1).map((n) => `
            <button type="button" class="pill" data-block="${n}">${n === 1 ? 'הקטע האחרון' : `${n} האחרונים`}</button>`).join('')}
        </div>
        <div class="sheet-field-label">כמה פעמים נוספות</div>
        <div data-role="times-wheel"></div>
        <p class="text-muted" data-role="repeat-preview" style="margin:10px 0 0;"></p>
        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary" data-role="repeat-cancel">ביטול</button>
          <button type="button" class="btn btn-primary" data-role="repeat-add">הוספה</button>
        </div>
      `;
      const preview = body.querySelector('[data-role="repeat-preview"]');
      const refresh = () => {
        body.querySelectorAll('[data-block]').forEach((b) => b.classList.toggle('active', Number(b.dataset.block) === block));
        preview.textContent = `יתווספו ${block * times} קטעים`;
      };
      body.querySelectorAll('[data-block]').forEach((b) => {
        b.addEventListener('click', () => { block = Number(b.dataset.block); refresh(); });
      });
      mountWheelPicker(body.querySelector('[data-role="times-wheel"]'), {
        min: 1, max: 20, value: times, onCommit: (v) => { times = v; refresh(); },
      });
      refresh();

      body.querySelector('[data-role="repeat-cancel"]').addEventListener('click', () => sheetApi.close());
      body.querySelector('[data-role="repeat-add"]').addEventListener('click', () => {
        const source = ex.sets.slice(-block);
        for (let i = 0; i < times; i++) {
          for (const s of source) {
            const copy = { _uid: nextUid(), notes: s.notes || '', done: false };
            for (const k of SEGMENT_KEYS) copy[k] = s[k] ?? null;
            ex.sets.push(copy);
          }
        }
        sheetApi.close();
      });
    },
    onClose() {
      if (exerciseRefs.has(ex._uid)) patchExerciseCard(ex);
      persistSession();
    },
  });
}

// The "⋯" sheet for a segment: notes, duplicate (the quick way to build
// intervals), delete. Values themselves are edited inline on the row.
function openCardioSegmentSheet(ex, set) {
  const idx = ex.sets.indexOf(set);
  openBottomSheet({
    ariaLabel: `${ex.name}, קטע ${idx + 1}`,
    render(body, sheetApi) {
      body.innerHTML = `
        <h3 style="margin:0 0 2px; color:var(--text);">${esc(ex.name)}</h3>
        <p class="text-muted" style="margin:0 0 10px;">קטע ${idx + 1}</p>

        <div class="sheet-field-label">הערות (אופציונלי)</div>
        <textarea data-role="sheet-notes" rows="2" class="search-bar" style="width:100%; resize:vertical;"
          placeholder="לדוגמה: אינטרוול, עלייה">${esc(set.notes || '')}</textarea>

        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary" data-role="sheet-duplicate">שכפול קטע</button>
          <button type="button" class="btn btn-danger" data-role="sheet-delete">מחיקת קטע</button>
        </div>
        <div class="sheet-actions">
          <button type="button" class="btn btn-primary" data-role="sheet-close" style="flex:1;">סגירה</button>
        </div>
      `;

      body.querySelector('[data-role="sheet-notes"]').addEventListener('input', (e) => {
        set.notes = e.target.value;
      });
      body.querySelector('[data-role="sheet-close"]').addEventListener('click', () => sheetApi.close());
      body.querySelector('[data-role="sheet-duplicate"]').addEventListener('click', () => {
        const i = ex.sets.indexOf(set);
        if (i !== -1) ex.sets.splice(i + 1, 0, { ...set, _uid: nextUid(), done: false, notes: set.notes || '' });
        sheetApi.close();
      });
      body.querySelector('[data-role="sheet-delete"]').addEventListener('click', async () => {
        // Closed first either way: confirmDialog sits below an open sheet.
        sheetApi.close();
        if (set.done) {
          const confirmed = await confirmDialog({
            title: 'מחיקת קטע',
            message: 'הקטע הזה כבר סומן כבוצע. למחוק בכל זאת?',
            confirmLabel: 'מחיקה',
            danger: true,
          });
          if (!confirmed) return;
        }
        const i = ex.sets.indexOf(set);
        if (i !== -1) ex.sets.splice(i, 1);
        patchExerciseCard(ex);
        persistSession();
      });
    },
    onClose() {
      if (exerciseRefs.has(ex._uid)) patchExerciseCard(ex);
      persistSession();
    },
  });
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
  // Deleting a group's last stage leaves its leader a plain set — without
  // this it kept type 'dropset' and showed "דרופ סט" with no stages.
  const leader = set.parentUid && ex.sets.find((s) => s._uid === set.parentUid);
  if (leader && !hasChildren(ex, leader)) leader.type = 'working';
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
  if (set.done && ex.kind === 'cardio') {
    // A record is judged on the whole exercise so far, so it can be broken
    // by the 3rd segment rather than any one of them — each is announced
    // once per workout, not again on every segment after it.
    ex.announcedRecords ||= [];
    const fresh = brokenCardioRecords(ex.activity, cardioPoints(ex), ex.sets.filter((s) => s.done))
      .filter((r) => !ex.announcedRecords.includes(r));
    ex.announcedRecords.push(...fresh);
    if (navigator.vibrate) navigator.vibrate(fresh.length ? [20, 40, 20] : 15);
    if (fresh.length) showToast(`${icon('trophy', { className: 'icon--sm' })} שיא חדש — ${fresh.join(', ')}!`);
  } else if (set.done) {
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

// Every past workout of a cardio exercise, as { date, sets } — ex.previous
// comes from a separate lookup, so it's added in case history lags.
function cardioPoints(ex) {
  const points = [...(ex.history || [])];
  if (ex.previous) points.push({ date: ex.previous.workoutDate, sets: ex.previous.sets });
  return points;
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

function startWorkout(customDate, hasTime = false) {
  const real = new Date();
  // realStartedAt is real wall-clock time even for a retroactive (backdated)
  // workout — startedAt is what gets saved/displayed as the workout's date,
  // realStartedAt is only ever used to measure how long finishing it took
  // (see finishWorkout's endTime calc), which is unrelated to which day the
  // user picked.
  if (sessions.length >= MAX_SESSIONS) {
    showToast(`אפשר עד ${MAX_SESSIONS} אימונים פתוחים — צריך לסיים אחד קודם`);
    return;
  }
  const created = {
    id: newSessionId(),
    startedAt: customDate || real,
    realStartedAt: real,
    hasTime: !customDate || hasTime,
    live: !customDate,
    exercises: [],
    rehydrated: true, // nothing to fetch yet
  };
  leaveSession();
  sessions.push(created);
  session = created;
  persistSession();
  render();
  window.scrollTo(0, 0);
}

// History's "continue / edit" button. Turns a saved workout back into a live
// session — the reverse of buildSavedSets(), with dropGroup turned back into
// parentUid links — opened in a tab of its own, beside any workout already
// in progress, and made the one on screen; the next mount shows it (fetching
// "last time" data on the way). Finishing it then updates that same record
// instead of creating a second one. A workout already open for editing is
// just brought forward. Returns false, changing nothing, when MAX_SESSIONS
// workouts are already open.
export function openWorkoutForEditing(workout) {
  loadSessions();
  const alreadyOpen = sessions.find((s) => s.editingWorkoutId === workout.id);
  if (alreadyOpen) {
    if (alreadyOpen !== session) leaveSession();
    session = alreadyOpen;
    persistSession();
    return true;
  }
  if (sessions.length >= MAX_SESSIONS) return false;

  const startedAt = toDate(workout.startTime || workout.date);
  const reopened = {
    id: newSessionId(),
    startedAt,
    realStartedAt: new Date(),
    hasTime: workoutHasTime(workout),
    live: false,
    editingWorkoutId: workout.id,
    originalStartedAt: startedAt,
    originalEndTime: workout.endTime ? toDate(workout.endTime) : startedAt,
    exercises: sessionExercisesFrom(workout.exercises, { done: true }),
  };
  leaveSession();
  sessions.push(reopened);
  session = reopened;
  persistSession();
  return true;
}

// Saved exercises — a workout's, or a coach's plan's — as session
// exercises: the reverse of buildSavedSets(), with dropGroup turned back
// into parentUid links. done: every set starts ticked (a workout already
// done) or not (a plan, still to do). "Last time" data is fetched when the
// workout is first shown (rehydrateSession).
function sessionExercisesFrom(savedExercises, { done }) {
  return (savedExercises || []).map((savedEx) => {
    const lookups = { previous: null, prevLoaded: false, history: null };
    if (savedEx.kind === 'cardio') {
      return {
        _uid: nextUid(),
        name: savedEx.name,
        category: savedEx.category || CARDIO_CATEGORY,
        kind: 'cardio',
        activity: savedEx.activity,
        inputMode: savedEx.inputMode || 'free',
        ...lookups,
        sets: (savedEx.sets || []).map((s) => {
          const seg = { _uid: nextUid(), notes: s.notes || '', done };
          for (const k of SEGMENT_KEYS) seg[k] = s[k] ?? null;
          return seg;
        }),
      };
    }
    const leaderUidByGroup = new Map();
    const sets = (savedEx.sets || []).map((s) => {
      const set = {
        _uid: nextUid(),
        type: s.type || 'working',
        weight: s.weight,
        reps: s.reps,
        notes: s.notes || '',
        done,
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
      ...lookups,
      sets,
    };
  });
}

// ---------- the coach's planned workout ("אימון מומלץ") ----------
//
// Today's plannedWorkouts doc, fetched each time this screen mounts. Its
// card shows on the "start a workout" screen — only while nothing is open,
// and only while it's still a proposal. todayPlan is null when there's none.

let todayPlan = null;
let planCardEl = null; // the card, kept across renders so its draft survives

async function loadTodayPlan(token) {
  const key = todayKey();
  let plan = null;
  try {
    plan = await getPlannedWorkout(key);
  } catch (err) {
    console.error('[plan] load failed', err);
  }
  if (isStale(token)) return;
  const fresh = plan && plan.date === key ? plan : null;
  // A new or changed proposal gets a new card; the same one keeps its draft.
  if (!fresh || fresh.status !== 'proposed') {
    planCardEl = null;
  } else if (!planCardEl || todayPlan?.id !== fresh.id || planStamp(todayPlan) !== planStamp(fresh)) {
    planCardEl = buildPlanCard(fresh);
  }
  todayPlan = fresh;
  if (!session) render();
}

function buildPlanCard(plan) {
  return createPlannedWorkoutCard(plan, {
    getLibrary: () => library,
    lastWeight: async (name) => {
      const last = await getLastPerformance(name);
      const working = (last?.sets || []).filter((s) => s.type !== 'warmup');
      return working.length ? Math.max(...working.map((s) => Number(s.weight) || 0)) : null;
    },
    onStart: startFromPlan,
    onSkip: skipPlan,
    onFree: () => startWorkout(),
  });
}

const planStamp = (p) => {
  const t = p?.updatedAt;
  return t?.toMillis ? t.toMillis() : String(t ?? '');
};

const planCardVisible = () => !!(planCardEl && todayPlan?.status === 'proposed' && todayPlan.date === todayKey());

// "התחל אימון": the plan as edited, opened as a live workout with every set
// still to do. The plan records what was actually started.
async function startFromPlan(exercises, edited) {
  if (!todayPlan || sessions.length >= MAX_SESSIONS) return;
  const plan = todayPlan;
  const real = new Date();
  const created = {
    id: newSessionId(),
    startedAt: real,
    realStartedAt: real,
    hasTime: true,
    live: true,
    planId: plan.id,
    planTitle: plan.title || '',
    exercises: sessionExercisesFrom(exercises, { done: false }),
  };
  leaveSession();
  sessions.push(created);
  session = created;
  plan.status = 'started';
  persistSession();
  render();
  window.scrollTo(0, 0);
  rehydrateSession(created);
  try {
    await updatePlannedWorkout(plan.id, { status: 'started', startedExercises: exercises, edited });
  } catch (err) {
    // The workout is open either way; finishing it still marks the plan done.
    console.error('[plan] status update failed', err);
  }
}

// "לא היום".
async function skipPlan() {
  if (!todayPlan) return;
  try {
    await updatePlannedWorkout(todayPlan.id, { status: 'skipped' });
  } catch (err) {
    console.error('[plan] skip failed', err);
    showToast('לא הצלחתי לעדכן — נסה שוב');
    return;
  }
  todayPlan.status = 'skipped';
  planCardEl = null;
  render();
  showToast('התוכנית של היום סומנה "לא היום"');
}

// Leaves a reopened workout without saving — the stored one stays as it was.
async function cancelEditing() {
  const target = session;
  const confirmed = await confirmDialog({
    title: 'ביטול עריכה',
    message: 'לצאת בלי לשמור? האימון השמור יישאר כמו שהיה.',
    confirmLabel: 'יציאה בלי שמירה',
    cancelLabel: 'המשך עריכה',
    danger: true,
  });
  if (!confirmed || !target || !sessions.includes(target)) return;
  closeSession(target);
}

// A date at the given "hh:mm" — or left at noon (parseDateInputValue's
// default) when there's no time.
function withTime(date, time) {
  if (!time) return date;
  const [h, m] = time.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

// The header's date: change the day of any open workout and add or change
// its time — a live one whose start was missed, one logged afterwards, or
// a saved one being edited.
function openWorkoutDetailsSheet() {
  if (!session) return;
  openBottomSheet({
    ariaLabel: 'תאריך ושעת האימון',
    render(body, sheetApi) {
      body.innerHTML = `
        <h3 style="margin:0 0 14px; color:var(--text);">תאריך ושעה</h3>
        <div class="sheet-field-label">תאריך</div>
        <div data-when-date></div>
        <div class="sheet-field-label">שעה <span class="text-muted">(לא חובה)</span></div>
        <div data-when-time></div>
        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary" data-when-cancel>ביטול</button>
          <button type="button" class="btn btn-primary" data-when-save>שמירה</button>
        </div>`;
      const dateField = mountDateField(body.querySelector('[data-when-date]'), { value: dateInputValue(session.startedAt) });
      const timeField = mountTimeField(body.querySelector('[data-when-time]'), {
        value: session.hasTime ? timeInputValue(session.startedAt) : '',
      });
      body.querySelector('[data-when-cancel]').addEventListener('click', () => sheetApi.close());
      body.querySelector('[data-when-save]').addEventListener('click', () => {
        const day = dateField.getValue();
        if (!day || !session) return;
        const time = timeField.getValue();
        const next = withTime(parseDateInputValue(day), time);
        if (time && next > new Date()) {
          showToast('השעה הזו עוד לא הגיעה');
          return;
        }
        session.startedAt = next;
        session.hasTime = !!time;
        persistSession();
        sheetApi.close();
        render();
      });
    },
  });
}

// The header's 🗑 — throws away a workout started by mistake, or, while
// editing a saved one, deletes that workout from History too.
async function deleteCurrentWorkout() {
  if (!session) return;
  const target = session;
  const isEdit = !!session.editingWorkoutId;
  const confirmed = await confirmDialog({
    title: 'מחיקת אימון',
    message: isEdit
      ? `למחוק את האימון מ-${esc(formatDateHe(session.startedAt))}? הוא יימחק גם מההיסטוריה, והפעולה לא הפיכה.`
      : 'למחוק את האימון? כל מה שהוזן בו יימחק ולא יישמר.',
    confirmLabel: 'מחיקה',
    cancelLabel: 'חזרה לאימון',
    danger: true,
  });
  if (!confirmed || !sessions.includes(target)) return;
  if (isEdit) {
    try {
      await deleteWorkout(target.editingWorkoutId);
    } catch (err) {
      console.error('deleteWorkout failed', err);
      showToast('המחיקה נכשלה — נסה שוב');
      return;
    }
  }
  if (!isEdit && target.planId) {
    // Started from today's plan by mistake, or to start over: offer it again.
    updatePlannedWorkout(target.planId, { status: 'proposed' })
      .catch((err) => console.error('[plan] reopen failed', err));
    if (todayPlan?.id === target.planId) {
      todayPlan.status = 'proposed';
      planCardEl = buildPlanCard(todayPlan); // the coach's original, not the started edit
    }
  }
  closeSession(target);
  showToast('האימון נמחק');
}

// Bottom sheet for logging a workout that already happened — lets the
// saved date (session.startedAt) differ from today, while session.realStartedAt
// still tracks the actual moment logging began (see startWorkout).
function openPastWorkoutSheet() {
  openBottomSheet({
    ariaLabel: 'הוספת אימון שכבר בוצע',
    render(body, sheetApi) {
      body.innerHTML = `
        <h3 style="margin:0 0 14px; color:var(--text);">אימון שכבר בוצע</h3>
        <div class="sheet-field-label">תאריך האימון</div>
        <div data-past-date></div>
        <div class="sheet-field-label">שעה <span class="text-muted">(לא חובה)</span></div>
        <div data-past-time></div>
        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary" id="past-cancel-btn">ביטול</button>
          <button type="button" class="btn btn-primary" id="past-start-btn">התחלה</button>
        </div>
      `;
      const dateField = mountDateField(body.querySelector('[data-past-date]'), { value: dateInputValue(new Date()) });
      const timeField = mountTimeField(body.querySelector('[data-past-time]'), { value: '' });
      body.querySelector('#past-cancel-btn').addEventListener('click', () => sheetApi.close());
      body.querySelector('#past-start-btn').addEventListener('click', () => {
        const val = dateField.getValue();
        if (!val) return;
        const time = timeField.getValue();
        const picked = withTime(parseDateInputValue(val), time);
        if (time && picked > new Date()) {
          showToast('השעה הזו עוד לא הגיעה');
          return;
        }
        sheetApi.close();
        startWorkout(picked, !!time);
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
  if (ex.kind === 'cardio') return buildSavedSegments(ex);
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

// Only what was entered is written (no nulls), plus `calc`: the
// derived time/distance/speed/pace, for anything reading the raw data.
// A segment marked done with nothing entered at all isn't worth saving.
function buildSavedSegments(ex) {
  const round = (n, places) => (n === null ? null : Math.round(n * 10 ** places) / 10 ** places);
  return ex.sets
    .filter((s) => s.done && !isEmptySegment(s))
    .map((s, i) => {
      const entry = { setNumber: i + 1, notes: s.notes || '' };
      for (const k of SEGMENT_KEYS) {
        if (s[k] !== null && s[k] !== undefined && s[k] !== '') entry[k] = s[k];
      }
      const m = segmentMetrics(s);
      entry.calc = {
        durationSec: round(m.durationSec, 0),
        distanceKm: round(m.distanceKm, 3),
        speedKmh: round(m.speedKmh, 2),
        paceSec: round(m.paceSec, 0),
      };
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
      .map((ex) => ({
        name: ex.name,
        category: ex.category,
        ...(ex.kind === 'cardio' ? { kind: 'cardio', activity: ex.activity, inputMode: ex.inputMode } : {}),
        sets: buildSavedSets(ex),
      }))
      .filter((ex) => ex.sets.length > 0);

    const elapsedMs = Date.now() - session.realStartedAt.getTime();
    const start = session.startedAt.getTime();
    const noTime = !session.hasTime;
    if (isEdit) {
      // The end moves with the start if the date/time was changed, and the
      // time spent now is added on top of it, covering a workout closed by
      // mistake and then continued. Removing every set keeps the saved
      // workout (only its date/time is updated) — deleting it is the 🗑.
      const shiftMs = start - (session.originalStartedAt || session.startedAt).getTime();
      const when = {
        date: session.startedAt,
        startTime: session.startedAt,
        endTime: new Date(session.originalEndTime.getTime() + shiftMs + elapsedMs),
        noTime,
      };
      await updateWorkout(session.editingWorkoutId, exercises.length > 0 ? { ...when, exercises } : when);
    } else if (exercises.length > 0) {
      // A live workout ends now — even if its start was moved earlier
      // because "התחלת אימון" was pressed late. One logged afterwards is
      // anchored to its picked date plus the real time spent logging, not
      // wall-clock "now", which would blow up the duration History shows.
      const endMs = session.live && isSameDay(session.startedAt, new Date())
        ? Math.max(Date.now(), start + elapsedMs)
        : start + elapsedMs;
      const planId = session.planId || null;
      const workoutId = await createWorkout({
        date: session.startedAt,
        startTime: session.startedAt,
        endTime: new Date(endMs),
        noTime,
        exercises,
        ...(planId ? { planId } : {}),
      });
      if (planId) {
        updatePlannedWorkout(planId, { status: 'done', workoutId })
          .catch((err) => console.error('[plan] done update failed', err));
        if (todayPlan?.id === planId) todayPlan.status = 'done';
      }
    }

    // Only reached on success — a thrown error skips straight to catch,
    // leaving session (and the persisted draft) untouched so nothing is
    // lost if the save actually failed. Tab switching is held off while
    // finishingWorkout is set, so `session` is still the one just saved.
    closeSession(session);
    showToast(`${icon('check', { className: 'icon--sm' })} ${isEdit ? 'האימון עודכן' : 'האימון נשמר בהצלחה'}`);
  } catch (err) {
    console.error('finishWorkout failed', err);
    showToast('שגיאה בשמירת האימון — נסה שוב');
  } finally {
    finishingWorkout = false;
    // Only re-enable the button if a workout is still on screen — on
    // success closeSession() already re-rendered: either the next open
    // workout (its button is fresh, so this is a no-op) or the "ready to
    // start" screen, which has no #finish-workout-btn to restore.
    const btnAfter = session ? container?.querySelector('#finish-workout-btn') : null;
    if (btnAfter) {
      btnAfter.disabled = false;
      btnAfter.classList.remove('btn--loading');
      btnAfter.textContent = 'סיום אימון';
    }
  }
}

// Read the open workouts as soon as the app starts (app.js imports this
// module), so the nav's open-workout count shows before the workout screen
// is ever visited.
loadSessions();
