// Tasks (M6): pure functions — no DOM, no Firestore — so
// tools/test-tasks.mjs can run them under Node. The page is
// js/pages/tasks.js; the data shape is docs/DATA.md "Tasks".
//
// Three kinds: a one-off ('once', done once), a daily one ('daily', on
// chosen weekdays) and a repeating one ('recurring', weekly or monthly).
// A repeating task is never "done" for good: each day it's done goes into
// doneDates.

import { TASKS } from './rules.js';
import { dateKey, shiftDays, parseKey } from './sleep.js';
import { toDate } from './format.js';
import { AREAS } from './habits.js';

export { AREAS };
export const OWNERS = { me: 'אני', assistant: 'העוזר', shared: 'משותף' };
export const SIZES = { S: 'קטנה', M: 'בינונית', L: 'גדולה' };
export const SIZE_HINTS = { S: 'עד 15 דק׳', M: 'עד שעה', L: 'יותר משעה' };
export const TYPES = { once: 'חד־פעמית', daily: 'יומית', recurring: 'חוזרת' };
export const TIMINGS = { exact: 'שעה מדויקת', day: 'יום', week: 'השבוע', claude: 'שקלוד יקבע' };
// "Why stuck?" answers (the plan's ladder, two weeks in) and what each offers.
export const STUCK_REASONS = {
  unclear: 'לא ברור מה לעשות',
  big: 'גדול מדי',
  unpleasant: 'לא נעים',
  stressful: 'מלחיץ',
  notImportant: 'לא באמת חשוב',
};
export const STUCK_TIPS = {
  unclear: 'כתוב מה נחשב "בוצע" ומה הצעד הראשון.',
  big: 'פרק אותה: כתוב רק את הצעד הראשון, והשאר כמשימות נפרדות.',
  unpleasant: 'הצמד אותה למשהו נעים (פודקאסט, קפה) או לשעת הסידורים.',
  stressful: 'רק 10 דקות. אחרי זה מותר לעצור.',
  notImportant: 'אפשר להעביר ל"מתישהו" — בלי אשמה.',
};

const DAY_MS = 86400000;
const todayKey = () => dateKey(new Date());
const keyOf = (v) => (v ? dateKey(toDate(v)) : null);

// A stored task with every field present and valid.
export function normalizeTask(raw = {}) {
  const type = TYPES[raw.type] ? raw.type : 'once';
  let recurrence = null;
  if (type === 'daily') {
    const days = Array.isArray(raw.recurrence?.days) ? raw.recurrence.days.filter((d) => d >= 0 && d <= 6) : [];
    recurrence = { days: days.length ? [...new Set(days)].sort() : [0, 1, 2, 3, 4, 5, 6] };
  } else if (type === 'recurring') {
    const every = raw.recurrence?.every === 'month' ? 'month' : 'week';
    const max = every === 'month' ? TASKS.maxMonthDay : 6;
    const min = every === 'month' ? 1 : 0;
    const day = Number(raw.recurrence?.day);
    recurrence = { every, day: Number.isInteger(day) && day >= min && day <= max ? day : min };
  }
  const status = ['inbox', 'open', 'done', 'someday'].includes(raw.status) ? raw.status : 'open';
  return {
    id: raw.id,
    title: String(raw.title || '').trim() || 'משימה',
    type,
    recurrence,
    area: AREAS[raw.area] ? raw.area : null,
    owner: OWNERS[raw.owner] ? raw.owner : 'me',
    complexity: SIZES[raw.complexity] ? raw.complexity : 'S',
    important: raw.important === true,
    urgent: raw.urgent === true,
    dueDate: raw.dueDate || null,
    timing: TIMINGS[raw.timing] ? raw.timing : null,
    scheduledAt: raw.scheduledAt || null,
    status: type === 'once' ? status : status === 'done' ? 'open' : status,
    doneAt: raw.doneAt || null,
    doneDates: Array.isArray(raw.doneDates) ? raw.doneDates : [],
    postponeCount: Number(raw.postponeCount) || 0,
    firstStep: String(raw.firstStep || ''),
    stuckReason: STUCK_REASONS[raw.stuckReason] ? raw.stuckReason : null,
    startedAt: raw.startedAt || null,
    calendarEventId: raw.calendarEventId || null,
    calendarSync: raw.calendarSync || null,
    source: raw.source || 'manual',
    createdAt: raw.createdAt || null,
  };
}

export const isRepeating = (t) => t.type !== 'once';
export const dueKey = (t) => keyOf(t.dueDate);
export const scheduledKey = (t) => keyOf(t.scheduledAt);

// The Sunday of the week a day is in (weeks run Sunday → Saturday).
export function weekOf(key) {
  return shiftDays(key, -parseKey(key).getDay());
}

// Does a repeating task fall on this day?
export function repeatsOn(t, key) {
  const d = parseKey(key);
  if (t.type === 'daily') return t.recurrence.days.includes(d.getDay());
  if (t.type === 'recurring') {
    if (t.recurrence.every === 'week') return d.getDay() === t.recurrence.day;
    return d.getDate() === t.recurrence.day;
  }
  return false;
}

export function isDoneOn(t, key) {
  if (isRepeating(t)) return t.doneDates.includes(key);
  return t.status === 'done' && keyOf(t.doneAt) === key;
}

export const isOpen = (t) => (isRepeating(t) ? t.status === 'open' : t.status === 'open' || t.status === 'inbox');

// Has no time yet: waiting in the "מחכה לשיבוץ" queue.
export const isUnscheduled = (t) => !isRepeating(t) && isOpen(t) && (!t.timing || t.timing === 'claude' || (t.timing !== 'week' && !t.scheduledAt));

// Urgent: marked so, or due (or scheduled) within TASKS.urgentDays days.
export function isUrgent(t, today = todayKey()) {
  if (t.urgent) return true;
  const limit = shiftDays(today, TASKS.urgentDays - 1);
  const due = dueKey(t);
  if (due && due <= limit) return true;
  const at = t.timing === 'exact' || t.timing === 'day' ? scheduledKey(t) : null;
  return !!(at && at <= limit);
}

// Eisenhower quadrant: do (important + urgent), plan (important), quick
// (urgent), drop (neither).
export function quadrant(t, today = todayKey()) {
  const u = isUrgent(t, today);
  if (t.important) return u ? 'do' : 'plan';
  return u ? 'quick' : 'drop';
}

// What belongs on a day's list: a repeating task that falls on it; a
// one-off scheduled for it, this week's, or overdue / due by it. Done ones
// (done that day) included — the screen shows them ticked.
export function isForDay(t, key, today = todayKey()) {
  if (isRepeating(t)) return t.status === 'open' && repeatsOn(t, key);
  if (t.status === 'done') return keyOf(t.doneAt) === key;
  if (!isOpen(t)) return false;
  const at = scheduledKey(t);
  if ((t.timing === 'exact' || t.timing === 'day') && at) return key === today ? at <= key : at === key;
  if (t.timing === 'week' && at) return key === today && weekOf(at) <= weekOf(key);
  const due = dueKey(t);
  return !!due && (key === today ? due <= key : due === key);
}

const RANK = { do: 0, plan: 1, quick: 2, drop: 3 };
const time = (v) => (v ? toDate(v).getTime() : Infinity);

// Most pressing first: quadrant, then time, then oldest added.
export function sortTasks(list, today = todayKey()) {
  return [...list].sort((a, b) => RANK[quadrant(a, today)] - RANK[quadrant(b, today)]
    || time(a.scheduledAt) - time(b.scheduledAt)
    || time(a.dueDate) - time(b.dueDate)
    || time(a.createdAt) - time(b.createdAt));
}

// A day's list, open first then done.
export function dayList(tasks, key, today = todayKey()) {
  const list = tasks.filter((t) => isForDay(t, key, today));
  const open = sortTasks(list.filter((t) => !isDoneOn(t, key)), today);
  const done = list.filter((t) => isDoneOn(t, key));
  return [...open, ...done];
}

// The home screen's few: today's open ones, most pressing first.
export function topToday(tasks, today = todayKey(), count = TASKS.homeCount) {
  return dayList(tasks, today, today).filter((t) => !isDoneOn(t, today)).slice(0, count);
}

// Important tasks already on a day (the plan's limit of 3), not counting `exceptId`.
export function importantOn(tasks, key, exceptId = null, today = todayKey()) {
  return tasks.filter((t) => t.id !== exceptId && t.important && isForDay(t, key, today) && !isDoneOn(t, key)).length;
}

// The procrastination ladder for a task with no time: null, 'waiting'
// (a week), 'stuck' (two weeks, or moved TASKS.stuckAfterPostpones times),
// 'decide' (three weeks). Someday tasks and repeating ones sit outside it.
export function ladderStage(t, now = new Date()) {
  if (isRepeating(t) || !isOpen(t)) return null;
  const days = t.createdAt ? Math.floor((now - toDate(t.createdAt)) / DAY_MS) : 0;
  const L = TASKS.ladder;
  if (isUnscheduled(t)) {
    if (days >= L.decide) return 'decide';
    if (days >= L.stuck) return 'stuck';
  }
  if (t.postponeCount >= TASKS.stuckAfterPostpones) return 'stuck';
  if (isUnscheduled(t) && days >= L.waiting) return 'waiting';
  return null;
}

// Points for finishing a task on a day: { raw, onTime }.
export function taskPoints(t, key) {
  if (t.type === 'daily') return { raw: TASKS.dailyPoints, onTime: false };
  const base = TASKS.points[t.complexity] * (t.important ? TASKS.importantFactor : 1);
  const due = isRepeating(t) ? null : dueKey(t);
  const onTime = !!due && key <= due;
  return { raw: base + (onTime ? TASKS.onTimeBonus : 0), onTime };
}

// Marks a repeating task done / not done on a day; returns the new doneDates
// (newest first, the oldest past TASKS.keepDoneDays dropped).
export function toggleDoneDate(doneDates, key, done) {
  const set = new Set(doneDates);
  if (done) set.add(key);
  else set.delete(key);
  const oldest = shiftDays(key, -TASKS.keepDoneDays);
  return [...set].filter((k) => k >= oldest).sort().reverse();
}

// Local noon of a day — the app's "date only" value (docs/DATA.md).
export function noonOf(key) {
  const d = parseKey(key);
  d.setHours(12, 0, 0, 0);
  return d;
}

// A Date for a day at 'hh:mm' local time.
export function atTime(key, hhmm) {
  const d = parseKey(key);
  const [h, m] = String(hhmm).split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

// "היום" / "מחר" / "יום ה׳ 13.11" for a day key.
export function shortDay(key, today = todayKey()) {
  if (key === today) return 'היום';
  if (key === shiftDays(today, 1)) return 'מחר';
  if (key === shiftDays(today, -1)) return 'אתמול';
  const d = parseKey(key);
  const day = 'אבגדהוש'[d.getDay()];
  return `יום ${day}׳ ${d.getDate()}.${d.getMonth() + 1}`;
}

// The one line under a task's name on a list (M14a): when, and the two
// states that used to be tags — still in the inbox, a week with no time.
export function rowLine(t, today = todayKey(), now = new Date()) {
  const parts = [];
  const when = whenText(t, today);
  if (when) parts.push(when);
  if (t.status === 'inbox') parts.push('בתיבה');
  if (ladderStage(t, now) === 'waiting') parts.push('מחכה שבוע');
  return parts.join(' · ');
}

// "מחר" is offered on an open one-off with a day or a time that has come.
export function canPostpone(t, today = todayKey()) {
  if (isRepeating(t) || !isOpen(t)) return false;
  const at = t.timing === 'exact' || t.timing === 'day' ? scheduledKey(t) : null;
  return !!at && at <= today;
}

// One line under the title: when, and what's due.
export function whenText(t, today = todayKey()) {
  if (t.type === 'daily') {
    const days = t.recurrence.days;
    return days.length === 7 ? 'כל יום' : `ימים ${days.map((d) => `${'אבגדהוש'[d]}׳`).join(' ')}`;
  }
  if (t.type === 'recurring') {
    return t.recurrence.every === 'week' ? `כל שבוע, יום ${'אבגדהוש'[t.recurrence.day]}׳` : `כל חודש, ב־${t.recurrence.day}`;
  }
  const parts = [];
  const at = scheduledKey(t);
  if (t.timing === 'exact' && at) {
    const d = toDate(t.scheduledAt);
    parts.push(`${shortDay(at, today)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  } else if (t.timing === 'day' && at) parts.push(shortDay(at, today));
  else if (t.timing === 'week') parts.push('השבוע');
  else if (t.timing === 'claude') parts.push('קלוד ישבץ');
  const due = dueKey(t);
  if (due) parts.push(due < today ? `היה ליעד ${shortDay(due, today)}` : `יעד: ${shortDay(due, today)}`);
  return parts.join(' · ');
}
