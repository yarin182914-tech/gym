// Decisions (M6b): pure functions — no DOM, no Firestore — so
// tools/test-decisions.mjs can run them under Node. The flow is
// js/ui/decision-sheet.js, the list js/pages/tasks.js ("להחליט"); the data
// shape is docs/DATA.md "Decisions". All numbers: DECISIONS in rules.js.
//
// A decision is triaged into a track (small / medium), gets a time budget
// from startedAt, and earns its points by being decided inside it. Nothing
// here judges whether the choice was right.

import { DECISIONS } from './rules.js';
import { dateKey, shiftDays, parseKey } from './sleep.js';
import { toDate } from './format.js';

export const TRACKS = { small: 'קטנה', medium: 'בינונית' };
export const IMPACTS = { low: 'כמעט כלום', some: 'קצת', high: 'הרבה' };
export const FEELINGS = { happy: 'שמחתי', unsure: 'לא בטוח', disappointed: 'התאכזבתי' };
// "What's missing to decide?" — the ladder's question after two weeks.
export const MISSING = { info: 'מידע', talk: 'שיחה עם מישהו', courage: 'אומץ' };
export const MISSING_TIPS = {
  info: 'כתוב את השאלה האחת שהתשובה עליה תכריע, ומתי תבדוק.',
  talk: 'עם מי? קבע איתו עכשיו, ואחר כך תחליט.',
  courage: 'רוב ההחלטות הפיכות. נסה את המסלול הקטן: 2 דקות והגרלה.',
};
const METHODS = ['manual', 'feet', 'score'];
const STATUSES = ['open', 'decided', 'dropped'];
const DAY_MS = 86400000;

const clampInt = (v, [lo, hi], fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : fallback;
};

// A stored decision with every field present and valid.
export function normalizeDecision(raw = {}) {
  const criteria = (Array.isArray(raw.criteria) ? raw.criteria : [])
    .filter((c) => c && c.id)
    .slice(0, DECISIONS.maxCriteria)
    .map((c) => ({
      id: String(c.id),
      name: String(c.name || '').trim(),
      weight: DECISIONS.weights.includes(Number(c.weight)) ? Number(c.weight) : 1,
    }));
  const options = (Array.isArray(raw.options) ? raw.options : [])
    .filter((o) => o && o.id)
    .slice(0, DECISIONS.maxOptions)
    .map((o) => {
      const scores = {};
      for (const c of criteria) {
        const s = clampInt(o.scores?.[c.id], DECISIONS.scoreRange, null);
        if (s !== null) scores[c.id] = s;
      }
      return { id: String(o.id), text: String(o.text || '').trim(), scores };
    });
  const track = TRACKS[raw.track] ? raw.track : 'small';
  const goodEnough = Number(raw.goodEnough);
  return {
    id: raw.id,
    question: String(raw.question || '').trim() || 'החלטה',
    track,
    triage: {
      reversible: typeof raw.triage?.reversible === 'boolean' ? raw.triage.reversible : null,
      impact: IMPACTS[raw.triage?.impact] ? raw.triage.impact : null,
    },
    options,
    criteria,
    goodEnough: Number.isFinite(goodEnough) && goodEnough >= 1 && goodEnough <= 5 ? goodEnough : DECISIONS.goodEnough,
    tenTenTen: String(raw.tenTenTen || ''),
    budgetSec: Number(raw.budgetSec) > 0 ? Number(raw.budgetSec) : DECISIONS.budgetSec[track],
    startedAt: raw.startedAt || null,
    decideBy: raw.decideBy || null,
    decidedAt: raw.decidedAt || null,
    choiceId: raw.choiceId || null,
    method: METHODS.includes(raw.method) ? raw.method : null,
    reopened: raw.reopened === true,
    reason: String(raw.reason || ''),
    feeling: FEELINGS[raw.feeling] ? raw.feeling : null,
    stuckReason: MISSING[raw.stuckReason] ? raw.stuckReason : null,
    status: STATUSES.includes(raw.status) ? raw.status : 'open',
    source: raw.source || 'manual',
    createdAt: raw.createdAt || null,
  };
}

// Two questions → the track. Undoable and small in a year → small; can't
// be undone and big in a year → large (which runs as medium until M6c);
// anything between → medium. Unanswered counts as the lighter answer.
export function triage({ reversible = null, impact = null } = {}) {
  const undoable = reversible !== false;
  if (impact === 'high' && !undoable) return { track: 'medium', large: true };
  if (undoable && (impact === 'low' || impact === null)) return { track: 'small', large: false };
  return { track: 'medium', large: false };
}

// When the budget ends (a Date), or null before it started. Small: the
// budget's seconds. Medium: its seconds, or the end of the next day in
// local (Israel) time — whichever is later.
export function deadline(d) {
  if (!d.startedAt) return null;
  const start = toDate(d.startedAt);
  const bySeconds = new Date(start.getTime() + d.budgetSec * 1000);
  if (d.track !== 'medium') return bySeconds;
  const end = parseKey(shiftDays(dateKey(start), DECISIONS.mediumDaysToDecide + 1));
  end.setHours(0, 0, 0, 0);
  return end > bySeconds ? end : bySeconds;
}

// Decided inside the budget? A medium one decided at midnight that ends
// its "by tomorrow" is already late; a small one at exactly 2:00 is in.
export function isOnTime(d) {
  const end = deadline(d);
  if (!end || !d.decidedAt) return false;
  const at = toDate(d.decidedAt).getTime();
  return d.track === 'medium' ? at < end.getTime() : at <= end.getTime();
}

// Seconds left of the visible timer (the budget's seconds), never below 0.
export function secondsLeft(d, now = new Date()) {
  if (!d.startedAt) return d.budgetSec;
  const used = (now.getTime() - toDate(d.startedAt).getTime()) / 1000;
  return Math.max(0, Math.ceil(d.budgetSec - used));
}

// An option's weighted average over the criteria it was scored on (1–5),
// or null with none scored.
export function optionScore(option, criteria) {
  let sum = 0;
  let weights = 0;
  for (const c of criteria) {
    const s = option.scores?.[c.id];
    if (s === undefined || s === null) continue;
    sum += s * c.weight;
    weights += c.weight;
  }
  return weights ? Math.round((sum / weights) * 100) / 100 : null;
}

// The suggested option: the first (in the order written) that reaches the
// good-enough bar — the satisficer's pick — else the highest score.
// → { id, score, goodEnough } or null with nothing scored.
export function suggestion(d) {
  const scored = d.options.map((o) => ({ id: o.id, score: optionScore(o, d.criteria) })).filter((o) => o.score !== null);
  if (!scored.length) return null;
  const enough = scored.find((o) => o.score >= d.goodEnough);
  if (enough) return { ...enough, goodEnough: true };
  const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
  return { ...best, goodEnough: false };
}

// Points for a decided decision: { raw, onTime, first } (first: the bonus
// for not reopening it). Nothing for an open or dropped one.
export function decisionPoints(d) {
  if (d.status !== 'decided' || !d.decidedAt) return { raw: 0, onTime: false, first: 0 };
  const onTime = isOnTime(d);
  const table = DECISIONS.points[d.track];
  return { raw: onTime ? table.onTime : table.late, onTime, first: d.reopened ? 0 : DECISIONS.firstChoiceBonus };
}

// The procrastination ladder for an open decision with no decide-by date:
// null, 'setDate' (a week: "לקבוע תאריך החלטה"), 'missing' (two weeks:
// "מה חסר כדי להחליט?"). Never red, never a penalty.
export function ladderStage(d, now = new Date()) {
  if (d.status !== 'open' || d.decideBy || !d.createdAt) return null;
  const days = Math.floor((now - toDate(d.createdAt)) / DAY_MS);
  if (days >= DECISIONS.ladder.missing) return 'missing';
  if (days >= DECISIONS.ladder.setDate) return 'setDate';
  return null;
}

// Open decisions, nearest first: by decide-by date, then the oldest.
export function openDecisions(list) {
  const time = (v) => (v ? toDate(v).getTime() : Infinity);
  return list
    .filter((d) => d.status === 'open')
    .sort((a, b) => time(a.decideBy) - time(b.decideBy) || time(a.createdAt) - time(b.createdAt));
}

// Decided ones, newest first.
export function decidedDecisions(list) {
  return list
    .filter((d) => d.status === 'decided' && d.decidedAt)
    .sort((a, b) => toDate(b.decidedAt) - toDate(a.decidedAt));
}

export const choiceText = (d) => d.options.find((o) => o.id === d.choiceId)?.text || '';

// ---------- the draw ----------

// A uniform float in [0, 1) from the platform's secure random source.
export function secureRandom() {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}

// A fair whole number in 0 … n-1. rand: a [0, 1) source (tests pass a
// seeded one).
export function pickRandom(n, rand = secureRandom) {
  if (!(n >= 1)) throw new Error('pickRandom: n must be at least 1');
  return Math.min(n - 1, Math.floor(rand() * n));
}

// The drum roll the game plays: [{ at (ms from the start), foot }], the
// beats speeding up from firstBeatMs to lastBeatMs and ending by drumMs.
// Feet take turns at random but never the same foot twice in a row — it
// says nothing about the winner, which is drawn apart (pickRandom).
export function drumPlan(n, rand = secureRandom, game = DECISIONS.game) {
  const beats = [];
  let at = 0;
  let last = -1;
  while (at < game.drumMs) {
    const t = at / game.drumMs;
    // Ease-in: long gaps first, short ones at the end.
    const gap = game.firstBeatMs + (game.lastBeatMs - game.firstBeatMs) * Math.sqrt(t);
    let foot = pickRandom(n, rand);
    if (n > 1 && foot === last) foot = (foot + 1 + pickRandom(n - 1, rand)) % n;
    beats.push({ at: Math.round(at), foot });
    last = foot;
    at += gap;
  }
  return beats;
}
