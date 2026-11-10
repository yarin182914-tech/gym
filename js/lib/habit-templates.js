// Ready-made answers for the habit wizard (js/ui/habit-wizard.js) — pick
// one and only fix what's different. Values follow the plan's examples
// ("הגדרת הרגל: אשף של 6 שאלות", "הרגלים רעים: אשף גמילה"); each user
// sets their own.

export const GOOD_TEMPLATES = [
  {
    id: 'reading', name: 'קריאה', icon: 'book-open', area: 'personal',
    schedule: { type: 'weekly', perWeek: 4 }, measure: 'quantity', unit: 'דקות', full: 20, short: 10,
    partOfDay: 'night', anchor: 'לפני השינה', markedBy: 'coach',
  },
  {
    id: 'morning', name: 'שגרת בוקר', icon: 'sun', area: 'personal',
    schedule: { type: 'daily' }, measure: 'steps', steps: ['כוס מים', 'לסדר את המיטה', '10 דקות מתיחות', 'תכנון היום'], shortSteps: [0, 1],
    partOfDay: 'morning', anchor: 'מיד אחרי הקימה', markedBy: 'me',
  },
  {
    id: 'english', name: 'אנגלית', icon: 'languages', area: 'career',
    schedule: { type: 'days', days: [1, 2, 4] }, measure: 'quantity', unit: 'דקות', full: 15, short: 5,
    partOfDay: 'morning', reminder: '07:30', markedBy: 'me',
  },
  {
    id: 'screen', name: 'זמן מסך', icon: 'phone-off', area: 'personal',
    schedule: { type: 'daily' }, measure: 'limit', unit: 'דקות', full: 60, short: 75,
    partOfDay: 'evening', anchor: 'נבדק בערב', markedBy: 'coach',
  },
  {
    id: 'water', name: 'מים', icon: 'droplet', area: 'body',
    schedule: { type: 'daily' }, measure: 'quantity', unit: 'כוסות', full: 8, short: 5, markedBy: 'me',
  },
  {
    id: 'meditation', name: 'מדיטציה', icon: 'brain', area: 'personal',
    schedule: { type: 'daily' }, measure: 'quantity', unit: 'דקות', full: 10, short: 5,
    partOfDay: 'morning', anchor: 'אחרי הקפה', markedBy: 'me',
  },
];

export const BAD_TEMPLATES = [
  {
    id: 'phone-bed', kind: 'bad', name: 'טלפון לפני השינה', icon: 'phone-off', area: 'personal', measure: 'clean',
    why: 'נרדם מאוחר ועייף בבוקר', trigger: 'במיטה, מול מסך, כשעייף',
    replacement: 'ספר על השידה', friction: 'מטען בסלון, זמן השבתה מ-22:00', partOfDay: 'night', markedBy: 'me',
  },
  {
    id: 'nails', kind: 'bad', name: 'כסיסת ציפורניים', icon: 'heart', area: 'personal', measure: 'slips',
    trigger: 'מול מסך, בלחץ או בשעמום', replacement: 'לסגור אגרוף לדקה או ללחוץ כדור לחץ',
    friction: 'ציפורניים קצרות ולק מר', markedBy: 'me',
  },
  {
    id: 'instagram', kind: 'bad', name: 'אינסטגרם', icon: 'smartphone', area: 'personal',
    measure: 'limit', unit: 'דקות', full: 30, short: 45,
    why: 'הזמן נעלם ואני מרגיש פחות טוב אחרי', trigger: 'בהפסקות, בשעמום, לפני השינה',
    replacement: 'הליכה קצרה או כמה עמודים בספר', friction: 'הגבלת אפליקציה במסך הזמן ל-30 דקות',
    partOfDay: 'evening', markedBy: 'me',
  },
];

// Chips the trigger screen offers (a tap adds one).
export const TRIGGER_CHIPS = ['במיטה', 'מול מסך', 'בלחץ', 'בשעמום', 'אחרי אוכל', 'בהפסקות', 'כשעייף'];
