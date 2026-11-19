// "מטרות לחיים" (M10e, docs/specs/life-goals.md): the life areas the plan
// offers, and ready ideas for each — the plan's "בסיס שעובד בלי קלוד".
// Content, not numbers (those are LIFE_PLAN in js/lib/rules.js). Works
// offline: nothing here needs the server or Claude.
//
// Each area:
//   id, name, icon (js/ui/icon.js), habitArea — the habit/task `area` its
//   ideas get (body · personal · relationship · career, js/lib/habits.js),
//   wishes — examples for "מה הדבר האחד…" (a tap fills the field),
//   metric — the placeholder of "איך תדעו שהצלחתם?",
//   ideas — { kind: 'habit', template } (the habit wizard's template shape,
//   js/lib/habit-templates.js) or { kind: 'task', title, … } (task fields).

import { GOOD_TEMPLATES } from './habit-templates.js';

const tpl = (id) => {
  const { id: _id, ...fields } = GOOD_TEMPLATES.find((t) => t.id === id);
  return fields;
};
const habit = (template) => ({ kind: 'habit', name: template.name, template });
const task = (title, fields = {}) => ({ kind: 'task', name: title, title, ...fields });

export const LIFE_AREAS = [
  {
    id: 'health', name: 'בריאות וגוף', icon: 'heart', habitArea: 'body',
    wishes: ['להתאמן 3 פעמים בשבוע', 'לישון 7 שעות רוב הלילות', 'לרדת 4 ק״ג'],
    metric: 'למשל: 3 אימונים בשבוע, 6 שבועות ברצף',
    ideas: [
      habit(tpl('water')),
      habit({ name: 'הליכה', icon: 'walk', schedule: { type: 'weekly', perWeek: 4 }, measure: 'quantity', unit: 'דקות', full: 30, short: 15, markedBy: 'me' }),
      habit({ name: 'מתיחות', icon: 'activity', schedule: { type: 'daily' }, measure: 'quantity', unit: 'דקות', full: 10, short: 5, partOfDay: 'evening', markedBy: 'me' }),
      task('לקבוע בדיקות דם שנתיות'),
    ],
  },
  {
    id: 'relationship', name: 'זוגיות', icon: 'heart', habitArea: 'relationship',
    wishes: ['יותר זמן איכות ביחד', 'ערב זוגי קבוע כל שבוע', 'לדבר יותר על מה שחשוב'],
    metric: 'למשל: ערב זוגי ב-10 מתוך 12 שבועות',
    ideas: [
      habit({ name: 'ערב זוגי', icon: 'heart', schedule: { type: 'weekly', perWeek: 1 }, measure: 'yesno', partOfDay: 'evening', markedBy: 'me' }),
      habit({ name: '10 דקות שיחה בלי טלפונים', icon: 'phone-off', schedule: { type: 'daily' }, measure: 'yesno', partOfDay: 'evening', markedBy: 'me' }),
      task('לתכנן חופשה זוגית'),
    ],
  },
  {
    id: 'family', name: 'משפחה וחברים', icon: 'users', habitArea: 'personal',
    wishes: ['לדבר עם ההורים כל שבוע', 'להיפגש עם חברים פעמיים בחודש', 'לחזור לקשר עם חבר ותיק'],
    metric: 'למשל: מפגש עם חברים פעמיים בחודש',
    ideas: [
      habit({ name: 'שיחה עם ההורים', icon: 'message-square', schedule: { type: 'weekly', perWeek: 2 }, measure: 'yesno', markedBy: 'me' }),
      habit({ name: 'הודעה לחבר', icon: 'message-square', schedule: { type: 'weekly', perWeek: 1 }, measure: 'yesno', markedBy: 'me' }),
      task('לקבוע ערב עם חברים'),
    ],
  },
  {
    id: 'career', name: 'קריירה ולימודים', icon: 'briefcase', habitArea: 'career',
    wishes: ['ללמוד מיומנות חדשה', 'לסיים קורס שהתחלתי', 'לבקש קידום או העלאה'],
    metric: 'למשל: לסיים את הקורס עד התאריך',
    ideas: [
      habit({ name: 'למידה', icon: 'book-open', schedule: { type: 'weekly', perWeek: 3 }, measure: 'quantity', unit: 'דקות', full: 30, short: 10, markedBy: 'me' }),
      habit(tpl('english')),
      task('לעדכן קורות חיים ופרופיל לינקדאין'),
    ],
  },
  {
    id: 'money', name: 'כסף', icon: 'wallet', habitArea: 'personal',
    wishes: ['לדעת לאן הולך הכסף', 'לחסוך סכום קבוע כל חודש', 'לסגור חוב'],
    metric: 'למשל: חוסך 1,000 ₪ בחודש',
    ideas: [
      habit({ name: 'מעקב הוצאות', icon: 'wallet', schedule: { type: 'weekly', perWeek: 1 }, measure: 'yesno', markedBy: 'me' }),
      task('להגדיר הוראת קבע לחיסכון'),
      task('לעבור על המנויים ולבטל מה שלא צריך'),
    ],
  },
  {
    id: 'growth', name: 'התפתחות אישית', icon: 'sprout', habitArea: 'personal',
    wishes: ['לקרוא יותר', 'להתחיל מדיטציה', 'לכתוב יומן'],
    metric: 'למשל: 3 ספרים עד התאריך',
    ideas: [
      habit(tpl('reading')),
      habit(tpl('meditation')),
      habit({ name: 'יומן', icon: 'pencil', schedule: { type: 'daily' }, measure: 'yesno', partOfDay: 'night', anchor: 'לפני השינה', markedBy: 'me' }),
      task('לבחור את הספר הבא'),
    ],
  },
  {
    id: 'fun', name: 'פנאי ותרבות', icon: 'music', habitArea: 'personal',
    wishes: ['למצוא תחביב חדש', 'לצאת להופעה או הצגה פעם בחודש', 'לטייל יותר בטבע'],
    metric: 'למשל: יציאה אחת בחודש',
    ideas: [
      habit({ name: 'זמן לתחביב', icon: 'sparkles', schedule: { type: 'weekly', perWeek: 2 }, measure: 'quantity', unit: 'דקות', full: 45, short: 20, markedBy: 'me' }),
      task('לקנות כרטיסים להופעה'),
      task('לתכנן טיול'),
    ],
  },
  {
    id: 'home', name: 'בית', icon: 'house', habitArea: 'personal',
    wishes: ['בית מסודר ונעים', 'לסיים תיקון שמחכה', 'לפנות דברים שלא צריך'],
    metric: 'למשל: כל החדרים מסודרים עד התאריך',
    ideas: [
      habit({ name: '10 דקות סידור', icon: 'check', schedule: { type: 'daily' }, measure: 'yesno', partOfDay: 'evening', markedBy: 'me' }),
      task('לסדר את הארון'),
      task('להזמין איש מקצוע לתיקון'),
    ],
  },
];

// An area of your own ("תחום משלי"): no ideas, a neutral icon.
export const CUSTOM_AREA = {
  icon: 'target', habitArea: 'personal', wishes: [], metric: 'למשל: מספר ותאריך', ideas: [],
};

export const AREA_BY_ID = new Map(LIFE_AREAS.map((a) => [a.id, a]));
