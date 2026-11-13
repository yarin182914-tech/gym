// Google Calendar (M7): bringing the calendar in line with a task — the
// calls to make and what to remember on the task. Everything outside comes
// in through `io`, so tools/test-calendar-sync.mjs runs it with no
// Firebase and no network:
//
//   io.readTask(taskId)          → the task document's data, or null when it is gone
//   io.writeTask(taskId, patch)  → merges into an existing task document
//   io.call(method, path, body)  → { ok, status, data } from …/calendars/primary/events<path>
//
// api/_lib/calendar.js supplies the real ones.

import { createHash } from 'node:crypto';
import { normalizeTask } from '../../js/lib/tasks.js';
import { planSync, eventFor } from '../../js/lib/calendar-event.js';

const gone = (r) => r.status === 404 || r.status === 410 || (r.ok && r.data.status === 'cancelled');
const failure = (what, r) => new Error(`calendar ${what} failed: ${r.status} ${r.data?.error?.message || ''}`);

// A task's own event id: the same task always asks for the same event, so
// a request sent twice can't make two. (Google takes ids in base32hex;
// hex digits are inside it.)
export const eventIdFor = (uid, taskId) => createHash('sha256').update(`${uid}:${taskId}`).digest('hex');

async function createEvent(io, uid, taskId, event) {
  const id = eventIdFor(uid, taskId);
  let r = await io.call('POST', '', { id, ...event });
  if (r.status === 409) {
    // The id was used before — a retry, or an event deleted by hand: bring
    // it back as it should be now.
    r = await io.call('PATCH', `/${id}`, { ...event, status: 'confirmed' });
    if (!r.ok || r.data.status === 'cancelled') r = await io.call('POST', '', event);
  }
  if (!r.ok) throw failure('insert', r);
  return r.data.id;
}

// Deletes only an event ג׳ימי made: its own id, or one carrying the mark.
async function deleteEvent(io, uid, taskId, eventId) {
  const path = `/${encodeURIComponent(eventId)}`;
  if (eventId !== eventIdFor(uid, taskId)) {
    const seen = await io.call('GET', path);
    if (gone(seen)) return;
    if (!seen.ok) throw failure('get', seen);
    if (seen.data.extendedProperties?.private?.gymi !== 'true') return;
  }
  const r = await io.call('DELETE', path);
  if (!r.ok && !gone(r)) throw failure('delete', r);
}

// One task. Returns true when its event was touched.
export async function syncTask(io, uid, taskId) {
  const raw = await io.readTask(taskId);
  const task = raw ? normalizeTask({ id: taskId, ...raw }) : null;
  // A deleted task has no document to hold the id; its event (if it ever
  // had one) is under the task's own event id.
  const eventId = raw ? raw.calendarEventId || null : eventIdFor(uid, taskId);
  const plan = planSync(task, { eventId, signature: raw?.calendarSync || null });
  if (plan.action === 'none') return false;

  let nextId = eventId;
  if (plan.action === 'create') {
    nextId = await createEvent(io, uid, taskId, plan.event);
  } else if (plan.action === 'delete') {
    await deleteEvent(io, uid, taskId, eventId);
    nextId = null;
  } else {
    const r = await io.call('PATCH', `/${encodeURIComponent(eventId)}`, plan.body);
    if (gone(r)) {
      // Deleted by hand in the calendar. It comes back only with a new
      // day or time.
      nextId = plan.body.start ? await createEvent(io, uid, taskId, eventFor(task)) : null;
    } else if (!r.ok) {
      throw failure('patch', r);
    }
  }
  if (raw) await io.writeTask(taskId, { calendarEventId: nextId, calendarSync: plan.signature });
  return true;
}

// Several tasks, `width` at a time: a failure on one doesn't stop the rest.
// Returns { touched, done, failed } — `done` the ids now in line with the
// calendar, `failed` [{ id, message }] the ones to try again. `stop(err)`
// true = give up at once (no consent to use).
export async function syncAll(io, uid, taskIds, stop = () => false, width = 1) {
  let touched = 0;
  const done = [];
  const failed = [];
  let next = 0;
  let fatal = null;
  async function worker() {
    while (next < taskIds.length && !fatal) {
      const id = taskIds[next];
      next += 1;
      try {
        if (await syncTask(io, uid, id)) touched += 1;
        done.push(id);
      } catch (err) {
        if (stop(err)) {
          fatal = err;
          return;
        }
        failed.push({ id, message: String(err?.message || err).slice(0, 200) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(width, taskIds.length)) }, worker));
  if (fatal) throw fatal;
  return { touched, done, failed };
}

// users/{uid}.calendar as the card reads it. Times go out as milliseconds:
// a Firestore Timestamp turns into { _seconds, _nanoseconds } in JSON,
// which the app can't read as a date.
const ms = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : null);
export function forCard(calendar) {
  if (!calendar) return null;
  const err = calendar.lastError;
  return {
    connected: calendar.connected === true,
    email: calendar.email || '',
    needsReconnect: calendar.needsReconnect === true,
    connectedAt: ms(calendar.connectedAt),
    lastSyncAt: ms(calendar.lastSyncAt),
    lastError: err ? { at: ms(err.at), count: Number(err.count) || 1, message: String(err.message || '') } : null,
  };
}
