// "מטרות לחיים" (M10e, docs/specs/life-goals.md): the plan's level 2 —
// life areas, where I am today (1–10), the one thing to change in 3 months
// and how I'll know. Pure: no DOM, no Firestore — tools/test-life-plan.mjs
// runs it in Node, and the coach's page (js/lib/coach-brief.js) uses it on
// the server too.
//
// Stored on the user doc as `lifePlan` (docs/DATA.md, "User settings").
// Which areas are active, whether there are goals, and what is linked to
// an area are worked out here, never stored.

import { LIFE_PLAN } from './rules.js';
import { LIFE_AREAS, AREA_BY_ID, CUSTOM_AREA } from './plan-templates.js';
import { israelDateKey } from './steps-import.js';

const isCustom = (id) => /^custom-\d+$/.test(String(id));
const plainPlan = (user) => (user?.lifePlan && typeof user.lifePlan === 'object' ? user.lifePlan : null);

// An area's look and content: a built-in one from js/lib/plan-templates.js,
// or one of your own (its name and icon from the stored doc).
export function areaInfo(id, doc = {}) {
  const built = AREA_BY_ID.get(id);
  if (built) return { ...built, custom: false };
  return { ...CUSTOM_AREA, id, name: String(doc?.name || 'תחום משלי'), icon: doc?.icon || CUSTOM_AREA.icon, custom: true };
}

export const knownArea = (id) => AREA_BY_ID.has(id) || isCustom(id);

// The plan's areas that are on (not removed), in the order chosen; areas
// missing from `order` follow in the built-in order, own ones last.
export function activeAreas(user) {
  const plan = plainPlan(user);
  const areas = plan?.areas && typeof plan.areas === 'object' ? plan.areas : {};
  const ids = Object.keys(areas).filter((id) => knownArea(id) && areas[id] && !areas[id].removed);
  const order = Array.isArray(plan?.order) ? plan.order : [];
  const builtIndex = (id) => {
    const i = LIFE_AREAS.findIndex((a) => a.id === id);
    return i < 0 ? LIFE_AREAS.length : i;
  };
  const rank = (id) => {
    const i = order.indexOf(id);
    return i < 0 ? order.length + builtIndex(id) : i;
  };
  return ids.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map((id) => ({ id, ...areas[id], info: areaInfo(id, areas[id]) }));
}

// Every id the plan has ever had, removed ones included (to bring back
// answers when an area is picked again, and to count own areas).
export function storedAreaIds(user) {
  const areas = plainPlan(user)?.areas;
  return areas && typeof areas === 'object' ? Object.keys(areas).filter(knownArea) : [];
}

export const hasGoals = (user) => activeAreas(user).length > 0;

// 'basic' (never set goals, or declined) · 'goals' (at least one area).
export function planDepth(user) {
  return hasGoals(user) ? 'goals' : 'basic';
}

// The answer to "רוצים גם להגדיר מטרות?": 'later' · 'never' · null.
export function planOffer(user) {
  const offer = plainPlan(user)?.offer;
  return offer === 'later' || offer === 'never' ? offer : null;
}

// The next free own-area id, or null once LIFE_PLAN.maxCustomAreas are
// on (removed ones don't count, and their ids aren't reused).
export function newCustomId(user) {
  const stored = storedAreaIds(user).filter(isCustom);
  const on = activeAreas(user).filter((a) => a.info.custom).length;
  if (on >= LIFE_PLAN.maxCustomAreas) return null;
  const used = stored.map((id) => Number(id.split('-')[1]));
  return `custom-${(used.length ? Math.max(...used) : 0) + 1}`;
}

export function clampScore(n) {
  const [lo, hi] = LIFE_PLAN.scoreRange;
  const v = Math.round(Number(n));
  return Number.isFinite(v) && v >= lo && v <= hi ? v : null;
}

// 'yyyy-mm-dd' LIFE_PLAN.horizonMonths after `todayKey` (the same day of
// the month, or the month's last day when it has fewer days).
export function defaultDueKey(todayKey, months = LIFE_PLAN.horizonMonths) {
  const [y, m, d] = String(todayKey).split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

// A stored dueDate (Timestamp, Date or ISO string) → 'yyyy-mm-dd' in
// Israel time, or ''.
export function dueKeyOf(value) {
  if (!value) return '';
  const date = value?.toDate ? value.toDate() : Number.isFinite(value?.seconds) ? new Date(value.seconds * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : israelDateKey(date);
}

export function dateHe(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return y && m && d ? `${d}.${m}.${y}` : '';
}

// The fields one area's screen saves. `dueDate` is local noon of the
// picked day (docs/DATA.md: date-only values are local noon).
export function areaFields({ score, wish3m, successMetric, dueKey }, { name, icon } = {}) {
  let dueDate = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(dueKey || ''))) {
    const [y, m, d] = dueKey.split('-').map(Number);
    dueDate = new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  return {
    score: clampScore(score),
    wish3m: String(wish3m || '').trim().slice(0, 200),
    successMetric: String(successMetric || '').trim().slice(0, 200),
    dueDate,
    removed: false,
    ...(name ? { name: String(name).trim().slice(0, 40), icon: icon || CUSTOM_AREA.icon } : {}),
  };
}

// One line for a row: "6/10 · לחסוך 1,000 ₪ בחודש", or '' when empty.
export function areaLine(area) {
  const [, hi] = LIFE_PLAN.scoreRange;
  return [Number.isFinite(area?.score) ? `${area.score}/${hi}` : '', String(area?.wish3m || '').trim()].filter(Boolean).join(' · ');
}

// The ideas an area's screen offers: the first LIFE_PLAN.ideasPerArea
// whose name isn't already a habit or a task (active or not).
export function ideasFor(areaId, { habits = [], tasks = [] } = {}) {
  const taken = new Set([
    ...(habits || []).map((h) => String(h?.name || '').trim()),
    ...(tasks || []).map((t) => String(t?.title || '').trim()),
  ]);
  return areaInfo(areaId).ideas.filter((i) => !taken.has(i.name)).slice(0, LIFE_PLAN.ideasPerArea);
}

// What a habit idea gives the wizard: its template, the area mapped to a
// habit area, a good habit.
export function ideaHabitTemplate(idea, areaId) {
  return { kind: 'good', icon: 'check', ...idea.template, area: areaInfo(areaId).habitArea };
}

// What a task idea prefills in the task form.
export function ideaTaskPrefill(idea, areaId) {
  const { kind, name, ...fields } = idea;
  return { ...fields, area: areaInfo(areaId).habitArea, planArea: areaId };
}

// Habits linked to an area (planArea), active only.
export const linkedHabits = (areaId, habits = []) => (habits || []).filter((h) => h?.planArea === areaId && h.active !== false);

// The plan as plain JSON for the coach (get_profile): active areas only,
// dates as 'yyyy-mm-dd'.
export function planForCoach(user) {
  return {
    planDepth: planDepth(user),
    offer: planOffer(user),
    areas: activeAreas(user).map((a) => ({
      id: a.id,
      name: a.info.name,
      score: Number.isFinite(a.score) ? a.score : null,
      wish3m: a.wish3m || '',
      successMetric: a.successMetric || '',
      dueDate: dueKeyOf(a.dueDate) || null,
    })),
  };
}

// The coach's section (js/lib/coach-brief.js). Returns markdown lines.
export function briefLines(user, habits = []) {
  const areas = activeAreas(user);
  const offer = planOffer(user);
  const lines = [];
  if (areas.length) {
    lines.push('## מטרות לחיים');
    for (const a of areas) {
      const [, hi] = LIFE_PLAN.scoreRange;
      const bits = [`**${a.info.name}**`];
      if (Number.isFinite(a.score)) bits.push(`היום ${a.score}/${hi}`);
      lines.push(`- ${bits.join(' · ')}`);
      if (a.wish3m) lines.push(`  - לשנות ב-3 החודשים הקרובים: ${a.wish3m}`);
      const due = dueKeyOf(a.dueDate);
      if (a.successMetric || due) lines.push(`  - הצלחה: ${[a.successMetric, due ? `עד ${dateHe(due)}` : ''].filter(Boolean).join(', ')}`);
      const linked = linkedHabits(a.id, habits).map((h) => `"${h.name}"`);
      if (linked.length) lines.push(`  - הרגלים שקשורים: ${linked.join(', ')}`);
    }
  }
  const how = [];
  // Goals set later win over an earlier "אף פעם".
  if (areas.length) {
    how.push('- לקשור הצעות למטרות שלמעלה. לא להוסיף מטרות שלא נבחרו.');
    how.push(`- להעמיק לתכנית מלאה מציעים לכל היותר פעם ב-${LIFE_PLAN.coachOfferDays} יום, ברגע טבעי (אחרי שבוע טוב, בסיכום חודשי, כשמשהו גדול קורה). אחרי ${LIFE_PLAN.coachMaxDeclines} סירובים מפסיקים עד שמבקשים.`);
  } else if (offer === 'never') how.push('- מטרות לחיים: בחר/ה לא להגדיר. לא מציעים, אלא אם ביקש/ה.');
  else how.push('- מטרות לחיים: עוד לא הוגדרו. אפשר להציע פעם אחת, ברגע טבעי, להגדיר ב"התכנית שלי". לא לדחוף.');
  return { goals: lines, how };
}
