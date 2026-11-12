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
import { addPending } from './calendar-event.js';

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
}

async function call(action, extra = {}) {
  const token = await auth.currentUser.getIdToken();
  const res = await fetch('/api/calendar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...extra }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.message || `calendar ${action} failed (${res.status})`);
  return body;
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

// Sends what is waiting. Called after saves, at app start and when the
// network comes back.
export function flushCalendarSync() {
  if (useCloud && calendarOn() && pending().length) schedule(0);
}

async function flush() {
  if (running || !auth?.currentUser) return;
  if (!pending().length) return;
  running = true;
  dirty.clear();
  try {
    // The server reads the task from Firestore, so the save has to be
    // there first. Offline this waits for the network.
    await waitForPendingWrites(db);
    let ids = pending();
    while (ids.length) {
      const batch = ids.slice(0, CALENDAR.batchSize);
      const res = await call('sync', { taskIds: batch });
      if (res.connected === false) {
        setCalendarOn(false);
        return;
      }
      // Keep what was queued again meanwhile: it changed after this read.
      ids = pending().filter((id) => !batch.includes(id) || dirty.has(id));
      write(PENDING_KEY, JSON.stringify(ids));
      if (dirty.size) break;
    }
  } catch (err) {
    // Stays queued; the next save or app start tries again.
    console.error('[calendar] sync failed', err);
  } finally {
    running = false;
    if (dirty.size && pending().length) schedule();
  }
}

if (typeof window !== 'undefined') window.addEventListener('online', flushCalendarSync);
