// App time from the iPhone (M3e): pure functions shared by api/usage.js
// and the app — no DOM, no Firestore — so tools/test-app-usage.mjs runs
// them under Node. Data shape: docs/DATA.md "App usage".
//
// An "opened" event starts a session, "closed" ends it; the seconds go to
// the day the session started (Israel time). A session past
// USAGE.maxSessionMin is a missed "closed" and isn't counted.
//
// Apps: the ready-made ones in USAGE.apps (by id, Hebrew name, iPhone name
// or alias), or any other name — its id is then "c-" + the name.

import { USAGE } from './rules.js';
import { levelFor, normalizeHabit } from './habits.js';

export const EVENTS = ['open', 'close'];

const clean = (v) => String(v ?? '').trim().replace(/^["'`״]+|["'`״]+$/gu, '').replace(/\s+/g, ' ').trim();
const fold = (v) => clean(v).toLowerCase();

// A name or id → { id, name, builtIn }, or null when empty / too long.
export function appMeta(value) {
  const text = clean(value);
  if (!text || text.length > USAGE.maxNameLength) return null;
  const key = fold(text);
  for (const [id, a] of Object.entries(USAGE.apps)) {
    const names = [id, a.name, a.ios, ...(a.aliases || [])].map(fold);
    if (names.includes(key)) return { id, name: a.name, builtIn: true };
  }
  const slug = key.replace(/[\/.#$[\]~*]+/g, '').replace(/\s+/g, '-');
  return slug ? { id: `c-${slug}`, name: text, builtIn: false } : null;
}

export function eventOf(value) {
  const key = fold(value);
  return EVENTS.find((e) => USAGE.events[e].map(fold).includes(key)) || null;
}

// The request body → { app: meta, event } or { error } (Hebrew).
// Either { input: "<app name> <event word>" } — the shared shortcut sends
// the automation's text — or { app, event }.
export function parseUsageBody(body) {
  let name = body?.app;
  let ev = body?.event;
  if (typeof body?.input === 'string' && !name) {
    const words = clean(body.input).split(' ');
    ev = words.pop();
    name = words.join(' ');
  }
  const app = appMeta(name);
  if (!app) return { error: 'חסר שם אפליקציה. בטקסט כותבים את השם ואחריו נפתח או נסגר' };
  const event = eventOf(ev);
  if (!event) return { error: 'בסוף הטקסט צריך לכתוב נפתח או נסגר' };
  return { app, event };
}

// The user's chosen apps (users/{uid}.usageApps, names) → metas, no repeats.
export function chosenApps(names) {
  const out = [];
  for (const n of Array.isArray(names) ? names : []) {
    const m = appMeta(n);
    if (m && !out.some((o) => o.id === m.id)) out.push(m);
  }
  return out.slice(0, USAGE.maxApps);
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const ms = (v) => (v instanceof Date ? v.getTime() : v?.toMillis ? v.toMillis() : v ? new Date(v).getTime() : null);

// state: { openSince, openDay } (or null) → what to write.
// Returns { state, add: { day, seconds, opens } | null, counted }.
export function applyEvent(state, event, now, dayOf) {
  const since = ms(state?.openSince);
  const max = USAGE.maxSessionMin * 60000;
  const t = ms(now);
  if (event === 'open') {
    return {
      state: { openSince: new Date(t), openDay: dayOf(new Date(t)) },
      add: { day: dayOf(new Date(t)), seconds: 0, opens: 1 },
      counted: 0,
    };
  }
  // close
  if (!since || t < since || t - since > max) return { state: { openSince: null, openDay: null }, add: null, counted: 0 };
  const seconds = Math.round((t - since) / 1000);
  return {
    state: { openSince: null, openDay: null },
    add: { day: state.openDay || dayOf(new Date(since)), seconds, opens: 0 },
    counted: seconds,
  };
}

export const minutesOf = (seconds) => Math.round(num(seconds) / 60);

// The habit the app's minutes go into: one that names the app explicitly
// (`usageApp`), else the first active bad "limit" habit with a part named
// after the app, else one named after the app with no parts.
// app: a meta from appMeta (or a name/id). → { habit, part } or null
// (part null = the whole value).
export function findUsageHabit(rawHabits, app) {
  const meta = typeof app === 'string' ? appMeta(app) : app;
  if (!meta) return null;
  const same = (a, b) => fold(a) === fold(b);
  const habits = rawHabits.map(normalizeHabit).filter((h) => h.active && h.measure === 'limit');
  const partOf = (h) => h.parts.find((p) => same(p, meta.name)) || null;
  const pick = (h) => ({ habit: h, part: partOf(h) });
  const explicit = habits.find((h) => h.usageApp === meta.id);
  if (explicit) return explicit.parts.length && !partOf(explicit) ? null : pick(explicit);
  const byPart = habits.find((h) => partOf(h));
  if (byPart) return pick(byPart);
  const byName = habits.find((h) => !h.parts.length && fold(h.name).includes(fold(meta.name)));
  return byName ? pick(byName) : null;
}

// The day's mark with the app's minutes in: other parts (typed by hand)
// kept, the sum and level recomputed. `mark` is the existing one or null.
export function usageMark(habit, part, mark, minutes) {
  const parts = part ? { ...(mark?.parts || {}), [part]: minutes } : null;
  const value = parts ? Object.values(parts).reduce((a, b) => a + num(b), 0) : minutes;
  const level = levelFor(habit, value);
  return {
    clean: level === 'full',
    slips: Array.isArray(mark?.slips) ? mark.slips : [],
    value,
    ...(parts ? { parts } : {}),
    level,
    source: 'shortcut',
  };
}
