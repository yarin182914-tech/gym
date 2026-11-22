// The coach's instructions page (M10a, docs/specs/onboarding.md): what the
// user's own Claude should ask about every day and what to leave alone,
// built from the questionnaire's answers and the settings saved since.
// Pure and shared — the app (a ?dev preview) and the MCP tool get_brief
// (api/_lib/tools.js) both call coachBrief(). Never stored: worked out on
// every call, so it follows every later change in the app.

import { areasState, workoutKindsOf, kindName, STEP_NAMES } from './onboarding.js';
import { sleepSettings } from './sleep.js';
import { nutritionGoals, mealsPerDay, weeklyWorkoutGoal } from './rewards.js';
import { userBaseKcal } from './body-burn.js';
import { normalizeHabit, PARTS_OF_DAY } from './habits.js';
import { briefLines } from './life-plan.js';

const LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const fmt = (n) => Math.round(n).toLocaleString('he-IL');
const dateHe = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return y && m && d ? `${d}.${m}.${y}` : String(key);
};

function scheduleText(h) {
  if (h.schedule.type === 'weekly') return `${h.schedule.perWeek} פעמים בשבוע`;
  if (h.schedule.type === 'days') return `בימים ${h.schedule.days.map((d) => LETTERS[d]).join(', ')}`;
  return 'כל יום';
}

function measureText(h) {
  const unit = h.unit ? ` ${h.unit}` : '';
  const n = (v) => (Number.isFinite(v) ? fmt(v) : v);
  h = { ...h, full: n(h.full), short: Number.isFinite(h.short) ? fmt(h.short) : h.short };
  if (h.kind === 'bad') {
    if (h.measure === 'limit') return `עד ${h.full}${unit} ביום`;
    if (h.measure === 'slips') return 'כמה מעידות היו (0 = יום נקי)';
    return 'יום נקי: כן / לא';
  }
  if (h.measure === 'quantity') return `${h.full}${unit}${h.short !== null && h.short !== undefined ? ` (מקוצר: ${h.short}${unit})` : ''}`;
  if (h.measure === 'limit') return `עד ${h.full}${unit}`;
  if (h.measure === 'steps') return h.steps.length ? `שגרה: ${h.steps.join(', ')}` : 'שגרה';
  if (h.autoSource) return `${h.full ?? ''}${unit}`.trim() || 'אוטומטי';
  return 'כן / לא';
}

function whoMarks(h) {
  if (h.markedBy === 'auto' || h.autoSource) return 'נרשם אוטומטית — לא לשאול';
  if (h.markedBy === 'coach') return 'לשאול בבדיקת הערב';
  return 'מסמנים באפליקציה; לשאול בערב רק אם לא סומן';
}

export function habitLine(h) {
  const parts = [`"${h.name}"${h.kind === 'bad' ? ' (להיגמל)' : ''}`, scheduleText(h), measureText(h)];
  if (h.partOfDay) parts.push(PARTS_OF_DAY[h.partOfDay]);
  if (h.reminder) parts.push(`תזכורת ${h.reminder}`);
  parts.push(whoMarks(h));
  return parts.join(' · ');
}

// user: the users/{uid} doc; habits: its habits (any shape); today:
// 'yyyy-mm-dd' in Israel time. Returns Hebrew markdown.
export function coachBrief({ user = {}, habits = [], today }) {
  const u = user || {};
  const active = (habits || []).map(normalizeHabit).filter((h) => h.active).sort((a, b) => a.order - b.order);
  const set = areasState(u, active);
  const female = u.body?.sex === 'female';
  const male = u.body?.sex === 'male';
  const g = (f, m, n) => (female ? f : male ? m : n);
  const who = g('המשתמשת', 'המשתמש', 'המשתמש/ת');

  const daily = [];
  const notNeeded = [];
  if (set.sleep) {
    const s = sleepSettings(u);
    const flex = s.sleepFlexibleNights.length ? ` לילות גמישים (לפי ערב): ${s.sleepFlexibleNights.map((d) => LETTERS[d]).join(', ')} — נספר רק המשך.` : '';
    daily.push(`- **שינה:** לילה אחד בכל בוקר — מתי ${g('נרדמה ומתי קמה', 'נרדם ומתי קם', 'נרדם/ה ומתי קם/ה')}. יעד שינה ${s.sleepBedtimeTarget} (לכל המאוחר ${s.sleepBedtimeLatest}), קימה ${s.sleepWakeTime}, לפחות ${s.sleepMinHours} שעות.${flex}`);
  } else notNeeded.push('sleep');
  if (set.food) {
    const g = nutritionGoals(u);
    daily.push(`- **אוכל:** עד ${mealsPerDay(u)} ארוחות ביום, כל ארוחה עם קלוריות וחלבון. יעד ${fmt(g.calorieTarget)} קל׳ ביום שלא נרשמה בו שריפה (אחרת: השריפה של היום פחות גירעון ${fmt(g.calorieDeficit)}), ו-${fmt(g.proteinTarget)} גרם חלבון.`);
  } else notNeeded.push('food');
  if (set.workouts) {
    const kinds = workoutKindsOf(u).map(kindName);
    daily.push(`- **אימונים:** ${weeklyWorkoutGoal(u)} בשבוע${kinds.length ? ` (${kinds.join(', ')})` : ''}. לרשום כל אימון שנעשה; לא כל יום הוא יום אימון.`);
  } else notNeeded.push('workouts');
  if (set.habits) {
    daily.push('- **הרגלים:**');
    for (const h of active) daily.push(`  - ${habitLine(h)}`);
  } else notNeeded.push('habits');
  if (!set.body) notNeeded.push('body');

  const lines = [
    `# דף הוראות: ${who} (נכון ל-${dateHe(today)})`,
    `מחושב מההגדרות ${g('שלה', 'שלו', 'שלו/ה')} בג׳יני בכל קריאה. זה המקור למה לשאול ומה לא.`,
    '',
    '## מה למלא כל יום',
    ...(daily.length ? daily : ['- כלום עדיין. לא לשאול על רישומים; אפשר להציע פעם אחת לעבור על "שאלון פתיחה" ב"התכנית שלי".']),
    '',
    '## לא נדרש — לא לשאול ולא להזכיר',
    ...(notNeeded.length
      ? [...notNeeded.map((a) => `- ${STEP_NAMES[a]} (לא הוגדר).`), '- אם זה עולה בשיחה, אפשר להציע להגדיר ב"התכנית שלי" באפליקציה. לא לדחוף.']
      : ['- הכול הוגדר.']),
    '',
    '## גוף ויעדים',
  ];
  if (set.body && u.body) {
    const b = u.body;
    const year = Number(String(today).slice(0, 4));
    const bits = [
      Number.isFinite(b.weightKg) ? `${b.weightKg} ק״ג` : '',
      Number.isFinite(b.heightCm) ? `${b.heightCm} ס״מ` : '',
      Number.isFinite(b.birthYear) && year ? `${g('בת', 'בן', 'בן/בת')} ${year - b.birthYear}` : '',
      b.sex === 'female' ? 'אישה' : b.sex === 'male' ? 'גבר' : '',
    ].filter(Boolean);
    lines.push(`- ${bits.join(' · ')}.`);
  }
  lines.push(`- שריפה בסיסית ${fmt(userBaseKcal(u))} קל׳ ביום${set.body ? '' : ' (ברירת המחדל — הגוף לא מולא)'}; צעדים ואימונים נוספים עליה.`);
  if (set.body) lines.push('- שקילה: כשיש — לרשום. אין חובה יומית.');
  // "מטרות לחיים" (M10e): the goals, and when to offer more.
  const plan = briefLines(u, active);
  if (plan.goals.length) lines.push('', ...plan.goals);
  lines.push(
    '',
    '## איך לעבוד',
    '- לפני כל רישום: להראות בעברית בדיוק מה יישמר ולחכות ל"כן".',
    '- לשאול רק על מה שב"מה למלא כל יום", פעם אחת בבדיקת הערב.',
    '- נקודות ורמות האפליקציה מחשבת. לא להבטיח מספר נקודות.',
    ...plan.how,
  );
  return lines.join('\n');
}
