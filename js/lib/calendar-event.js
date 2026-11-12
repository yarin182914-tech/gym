// Google Calendar sync (M7): which event a task should have, and what to
// do about it. Pure — no DOM, no network — so the server (api/calendar.js)
// and tools/test-calendar-event.mjs share it. The spec is
// docs/specs/calendar-sync.md; the fields are docs/DATA.md "Tasks".
//
// Only a one-off task with a time (a timed event, its length by the task's
// size) or a day (an all-day event) gets one. Done keeps the event and
// adds ✓ to its name.

import { CALENDAR } from './rules.js';
import { toDate } from './format.js';

const DONE_MARK = '✓ ';

// yyyy-mm-dd of an instant in Israel, whatever the machine's time zone.
function israelKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CALENDAR.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function nextKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// Does this (normalized) task belong in the calendar at all?
export function wantsEvent(task) {
  if (!task || task.type !== 'once' || !task.scheduledAt) return false;
  if (task.status !== 'open' && task.status !== 'inbox' && task.status !== 'done') return false;
  return task.timing === 'exact' || task.timing === 'day';
}

// The Google Calendar event of a task, or null when it shouldn't have one.
export function eventFor(task) {
  if (!wantsEvent(task)) return null;
  const at = toDate(task.scheduledAt);
  if (Number.isNaN(at.getTime())) return null;
  let start;
  let end;
  if (task.timing === 'exact') {
    const minutes = CALENDAR.durationMin[task.complexity] || CALENDAR.durationMin.S;
    start = { dateTime: at.toISOString(), timeZone: CALENDAR.timeZone };
    end = { dateTime: new Date(at.getTime() + minutes * 60000).toISOString(), timeZone: CALENDAR.timeZone };
  } else {
    const day = israelKey(at);
    start = { date: day };
    end = { date: nextKey(day) }; // an all-day event ends on the next morning
  }
  return {
    summary: `${task.status === 'done' ? DONE_MARK : ''}${task.title}`,
    description: `נוצר מג׳ימי\n${CALENDAR.appUrl}`,
    start,
    end,
    extendedProperties: { private: { gymi: 'true', taskId: String(task.id) } },
  };
}

// What was last sent, as "<when>#<name>" — kept on the task
// (`calendarSync`) so an unchanged task costs no Google call.
const whenOf = (event) => `${event.start.dateTime || event.start.date}|${event.end.dateTime || event.end.date}`;
export const signatureOf = (event) => `${whenOf(event)}#${event.summary}`;
const whenPart = (signature) => String(signature || '').split('#')[0];

// What to do for a task. `task` is normalized, or null when its document
// is gone. Returns { action, event?, body?, signature }:
//   none   — nothing to send
//   create — insert `event`
//   patch  — send `body` (only the name when only the name changed, so an
//            event moved by hand in the calendar stays where it was put)
//   delete — remove the linked event
export function planSync(task, { eventId = null, signature = null } = {}) {
  const event = task ? eventFor(task) : null;
  if (!event) return eventId ? { action: 'delete', signature: null } : { action: 'none', signature: null };
  const next = signatureOf(event);
  if (!eventId) {
    // A signature with no event: the user deleted it in the calendar. It
    // comes back only when the task's day or time changes.
    if (signature && whenPart(signature) === whenOf(event)) return { action: 'none', signature: next };
    return { action: 'create', event, signature: next };
  }
  if (signature === next) return { action: 'none', signature: next };
  if (signature && whenPart(signature) === whenOf(event)) {
    return { action: 'patch', body: { summary: event.summary }, signature: next };
  }
  return { action: 'patch', body: { summary: event.summary, start: event.start, end: event.end }, signature: next };
}

// Tasks to push right after connecting: open, with an event, from today on.
export function tasksToConnect(tasks, now = new Date()) {
  const today = israelKey(now);
  return tasks
    .filter((t) => t.status !== 'done' && wantsEvent(t) && israelKey(toDate(t.scheduledAt)) >= today)
    .sort((a, b) => toDate(a.scheduledAt) - toDate(b.scheduledAt))
    .slice(0, CALENDAR.connectSyncMax)
    .map((t) => t.id);
}

// Tasks that should be in the calendar and were never sent: connected on
// another screen or device, written from outside the app, or a send that
// got lost. An event the user deleted by hand (a signature with no event)
// is left alone.
export function tasksMissingEvent(tasks, now = new Date()) {
  return tasksToConnect(tasks.filter((t) => !t.calendarEventId && !t.calendarSync), now);
}

// The retry list kept on the device: newest last, no repeats, capped.
export function addPending(list, ids) {
  const merged = [...(Array.isArray(list) ? list : []).filter((id) => !ids.includes(id)), ...ids];
  return merged.slice(-CALENDAR.retryMax);
}
