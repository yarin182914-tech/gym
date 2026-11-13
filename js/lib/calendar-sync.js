// Google Calendar sync (M7), the app's side: tells the server
// (/api/calendar) which tasks changed, and it creates / moves / marks ✓ /
// deletes their events. The spec is docs/specs/calendar-sync.md; what an
// event looks like is js/lib/calendar-event.js.
//
// A changed task's id waits in localStorage until the server has both the
// saved task and the request — so a save in airplane mode reaches the
// calendar the next time the app is open with a network. Nothing here ever
// blocks or fails a save.

import { waitForPendingWrites } from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js';
import { auth, db, useCloud } from '../firebase-config.js';
import { CALENDAR } from './rules.js';
import { addPending, tasksMissingEvent } from './calendar-event.js';

const PENDING_KEY = 'gymi.calendar.pending';
const ON_KEY = 'gymi.calendar.on';

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch { /* private mode: the sync just won't survive a reload */ }
}

function pending() {
  try {
    const list = JSON.parse(read(PENDING_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// Is this user's calendar connected? Remembered on the device (set from
// users/{uid}.calendar at app start and by the "חיבורים" card) so every
// save doesn't have to ask. The local sandbox (`?dev`) has no Google: it
// only shows the connected look, on until "ניתוק" is tapped.
export const calendarOn = () => (useCloud ? read(ON_KEY) === '1' : read(ON_KEY) !== '0');
export function setCalendarOn(on) {
  write(ON_KEY, on ? '1' : '0');
  if (!on) write(PENDING_KEY, '[]');
  // A screen may have loaded its tasks before this was known.
  else if (lastTasks) catchUpCalendar(lastTasks);
}

// `background`: the request may finish after the app is put away (the
// iPhone freezes a hidden page), and always ends — with an answer or an
// error — so a frozen one can't block the sends after it.
async function call(action, extra = {}, { background = false } = {}) {
  const token = await auth.currentUser.getIdToken();
  const stop = new AbortController();
  const timeout = setTimeout(() => stop.abort(), CALENDAR.requestTimeoutMs);
  try {
    const res = await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...extra }),
      keepalive: background,
      signal: stop.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) throw new Error(body.message || `calendar ${action} failed (${res.status})`);
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

// { configured, calendar } — `calendar` is the map on users/{uid}, or null.
export async function calendarStatus() {
  if (!useCloud) return { configured: true, demo: true, calendar: { connected: calendarOn(), email: '', lastSyncAt: null } };
  const status = await call('status');
  setCalendarOn(!!status.calendar?.connected);
  return status;
}

// Google's consent screen; it comes back to #/connections?calendar=<result>.
// Returns false when the page stays (the sandbox).
export async function startCalendarConnect() {
  if (!useCloud) {
    setCalendarOn(true);
    return false;
  }
  const { url } = await call('start');
  location.href = url;
  return true;
}

export async function disconnectCalendar() {
  if (useCloud) await call('disconnect');
  setCalendarOn(false);
}

let timer = null;
let running = false;
let retries = 0; // tries after a failure, in a row (CALENDAR.retryDelaysMs)
const dirty = new Set(); // ids queued again while a flush was in the air

function schedule(delay = CALENDAR.syncDelayMs) {
  clearTimeout(timer);
  timer = setTimeout(flush, delay);
}

// Tasks that were just saved or deleted (ids). Safe to call for any task:
// the server works out whether its event has to change.
export function queueCalendarSync(ids) {
  if (!useCloud || !calendarOn() || !ids.length) return;
  write(PENDING_KEY, JSON.stringify(addPending(pending(), ids)));
  if (running) ids.forEach((id) => dirty.add(id));
  else schedule();
}

// The screens that load the tasks hand them over (normalized): any that
// should have an event and never got one is sent now. This is what fills
// the calendar after connecting, wherever Google's screen came back to.
// Each task is tried once per visit to the app.
const caughtUp = new Set();
let lastTasks = null;
export function catchUpCalendar(tasks) {
  lastTasks = tasks;
  if (!useCloud || !calendarOn()) return;
  const ids = tasksMissingEvent(tasks).filter((id) => !caughtUp.has(id));
  ids.forEach((id) => caughtUp.add(id));
  queueCalendarSync(ids);
}

// Sends what is waiting. Called after saves, at app start, when the
// network comes back and when the app is brought back to the front.
export function flushCalendarSync() {
  if (useCloud && calendarOn() && pending().length) schedule(0);
}

async function flush() {
  if (running || !auth?.currentUser) return;
  if (!pending().length) return;
  running = true;
  dirty.clear();
  let failed = false;
  try {
    // The server reads the task from Firestore, so the save has to be
    // there first. Offline this waits for the network.
    await waitForPendingWrites(db);
    const tried = new Set();
    for (;;) {
      const batch = pending().filter((id) => !tried.has(id)).slice(0, CALENDAR.batchSize);
      if (!batch.length) break;
      batch.forEach((id) => tried.add(id));
      const res = await call('sync', { taskIds: batch }, { background: true });
      // No consent, or a server with no Google setup (a branch preview).
      if (res.connected === false || res.configured === false) {
        setCalendarOn(false);
        return;
      }
      // The server says which tasks it settled; the rest wait for another
      // try. So does anything queued again meanwhile: it changed since.
      const done = Array.isArray(res.done) ? res.done : batch;
      if (done.length < batch.length) failed = true;
      write(PENDING_KEY, JSON.stringify(pending().filter((id) => !done.includes(id) || dirty.has(id))));
      if (dirty.size) break;
    }
  } catch (err) {
    failed = true;
    console.error('[calendar] sync failed', err);
  } finally {
    running = false;
    if (!failed) retries = 0;
    if (dirty.size && pending().length) {
      schedule();
    } else if (failed && pending().length && retries < CALENDAR.retryDelaysMs.length) {
      // A few more tries, further and further apart; after that the next
      // save, app start or return to the app picks it up.
      schedule(CALENDAR.retryDelaysMs[retries]);
      retries += 1;
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', flushCalendarSync);
  // Back from another app (say, Google Calendar): a send the iPhone froze
  // halfway carries on.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    retries = 0;
    flushCalendarSync();
  });
}
