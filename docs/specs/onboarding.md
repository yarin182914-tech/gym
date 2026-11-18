# שאלון פתיחה — הבסיס
Milestone: M10a · Branch: feature/m10a-onboarding · Status: built 2026-11-18, PR open
Requested by ירין on 2026-11-17: "המטרה היא לא לבנות לה את האתר - אלא שהיא תוכל להשתמש כמו כל משתמש אחר שהוא לא אני - לייצר שאלון התחברות מלא שמבין את הצרכים של המשתמש … כל ההגדרות הראשוניות יהיו שם ואם הוא לא יגדיר משהו כי זה לא פי'צר שהוא מעוניין בו הוא יכול להמשיך הלאה".
Answers on 2026-11-17 and 2026-11-18:
- Split: the basics first (this PR), then areas, vision and a master plan (M10e). The switches that hide an area stay in M8.
- Skipping: only "דלג". A skipped area writes nothing and the app looks the same; the area is "not set up" until the user sets it, from the questionnaire again ("התכנית שלי") or from its own screen (the sleep ⚙, "יעדים").
- Who: opens by itself only on a new account's first visit (Maya included). Anyone can open it from "התכנית שלי".
- Habits: one tap from a ready list or a typed name, or the full wizard ("עם כל השאלות"), mainly for a habit to quit.
- Body and calories: a fixed formula in code (Mifflin-St Jeor, M16a), not AI and not a search; works offline.
- The coach: an instructions page made from the answers, which the user's Claude reads and the user doesn't have to see.

## למה (הבעיה)
משתמש חדש (מאיה, ואחריה חברים) נכנס לאפליקציה שמוגדרת לפי ירין: השינה, האוכל, האימונים ואפילו הרגלי הדוגמה. אין מקום אחד שבו הוא אומר מה חשוב לו. הקלוד שלו לא יודע מה הוא בחר, ולכן ישאל על הכול.

## מה זה עושה (במשפט אחד)
שאלון קצר בכניסה הראשונה מגדיר גוף, אימונים, שינה, אוכל והרגלים. כל שלב אפשר לדלג, ומה שנבחר הופך לדף הוראות לקלוד של המשתמש.

## איך זה נראה
מסך מלא מעל האפליקציה, 390px, RTL, בכל ערכות הצבעים. פנייה ברבים, כמו בשאר האפליקציה.
- **פתיחה:** הלוגו, "נעים להכיר!", שורה על 3 הדקות, ו"כל שאלה אפשר לדלג". כפתורים: "מתחילים" · "אחר כך".
- **בכל שלב:** 5 פסים של התקדמות, חזרה (›), סגירה (✕ = "אחר כך"), אייקון, כותרת ושורה. למטה "דלג" · "הבא".
  1. **הגוף שלי:** משקל, גובה, גיל ומין (אותם שדות בדיוק כמו "הגוף שלי" מ-M16a). השריפה ויעד החלבון מתעדכנים תוך כדי הקלדה.
  2. **אימונים:** כמה בשבוע (1–7), ובאיזה סוגים (כוח, אירובי, פונקציונלי, קרוספיט, פילאטיס, יוגה, שחייה, סטודיו, ספורט, סקי). אפשר לבחור כמה.
  3. **שינה:** יעד שינה, לכל המאוחר, שעת קימה, מינימום שעות, לילות גמישים (אותם שדות כמו ה-⚙ של השינה).
  4. **אוכל:** ארוחות ביום (1–6), יעד קלוריות ויעד חלבון (ממולאים ממה שחושב מהגוף).
  5. **הרגלים:** הרגלים מוכנים בלחיצה אחת (מים, קריאה, מדיטציה, שגרת בוקר, זמן מסך, ושלושה "להיגמל"), הרגל שכותבים בעצמכם, וכפתור "הרגל עם כל השאלות" שפותח את האשף המלא. עד 5 בבת אחת. מה שכבר קיים לא מוצע שוב.
- **סיום:** "סיימנו!" ושורה לכל תחום: מה הוגדר, או "לא הוגדר" באפור. "תחומי חיים, חזון ותכנית אב: בקרוב". כפתור "לעבור להיום".
- **היום:** כשהשאלון לא הסתיים, כרטיס "להמשיך את שאלון הפתיחה?" עם "להמשיך" ו"לא עכשיו" (נעלם ל-3 ימים). כרטיס "הגוף שלי" לא מופיע בזמן הזה, וגם לא אחרי שדילגו על הגוף.
- **התכנית שלי** (מתפריט הפרופיל): "שאלון פתיחה" עם "למלא" או "לעבור שוב". מתחת, שורה לכל תחום: מה הוגדר, או "לא הוגדר" באפור, עם "לשנות" או "להגדיר". לחיצה פותחת רק את השלב הזה, עם "שמירה" ו"ביטול". ב-`?dev` בלבד מופיע גם "מה הקלוד רואה", לבדיקה.
- **יעדים** (תזונה): שורה חדשה "ארוחות ביום". ליד מספר הארוחות כתוב "יעד: עד N".

## זרימה
1. משתמש חדש נכנס בפעם הראשונה, והשאלון נפתח מעל "היום".
2. "מתחילים". כל "הבא" שומר את השלב מיד, בלי לחכות לשרת (עובד גם בלי אינטרנט). "דלג" לא שומר כלום.
3. "אחר כך" או ✕ סוגרים את השאלון ושומרים באיזה שלב עצרו. בפעם הבאה ממשיכים מאותו שלב, מכרטיס "היום" או מ"התכנית שלי".
4. אחרי ההרגלים מגיע מסך הסיום, ואז "לעבור להיום".
5. מ"התכנית שלי" אפשר לפתוח שלב אחד ולשמור אותו. תחום שהוגדר כך, או מהמסך שלו, נחשב "הוגדר".

## חוקים ומספרים
In `js/lib/rules.js`:
- `ONBOARDING.fromDate`: `BODY.cardFromDate` (2026-11-14). Opens by itself only for accounts created on or after this date.
- `ONBOARDING.snoozeDays`: 3. "לא עכשיו" on the Today card.
- `ONBOARDING.quickHabits`: the one-tap habits (ids from `js/lib/habit-templates.js`).
- `ONBOARDING.maxHabits`: 5 at once.
- `NUTRITION.mealsRange`: [1, 6]. `NUTRITION.maxMeals` (2) stays the default.
- Points: the meal-logging points and the "meal count" grade follow `mealsPerDay`. Points already given never drop.

## Data (Firestore)
On `users/{uid}`, written by the app only (docs/DATA.md, "User settings"):
- `onboarding`: `{ startedAt, step, skipped: [], doneAt?, snoozedAt? }`. Missing means it never ran (older accounts, ירין's included). An older account gets the map only when it finishes, so opening and closing it changes nothing.
- `mealsPerDay`: number 1–6, missing → 2.
- `workoutKinds`: string[], missing → [].
- The steps write the existing fields (`body`/`baseKcal`/targets via `saveBodyProfile`, `weeklyWorkoutGoal`, the five sleep fields, `calorieTarget`/`proteinTarget`) and new habits with `source: 'onboarding'`.
- `habitsSeeded: true` when it starts. New accounts get no example habits.
- "Set up" per area is derived (`areasState` in `js/lib/onboarding.js`), never stored.

## Server / outside the app
- New MCP tool `get_brief` (`api/_lib/tools.js`): `{ today, areas, brief }`. `brief` is a Hebrew page from `coachBrief()` (`js/lib/coach-brief.js`) with these sections:
  - What to log every day, with the numbers.
  - What is not needed (don't ask, don't remind).
  - Body and targets.
  - How to work.
- The connector's instructions (`api/_lib/rpc.js`) start with "call get_brief first and follow it".
- `get_profile` adds `mealsPerDay` and `workoutKinds`.
- No `firestore.rules` change. No env vars.

## לא בגרסה הזאת
- תחומי חיים, חזון, מטרות ותכנית אב (M10e).
- הסתרת תחום מהאפליקציה (מתגים, M8).
- כניסה עם מייל וסיסמה, ומצב מינימלי (M10).
- חלון אכילה וצום, שעות עבודה ושגרה, התראות (M9 ואחריו).

## הגדרת "גמור"
- חשבון חדש רואה את השאלון בכניסה הראשונה ועונה עליו בכ-3 דקות. ירין לא רואה אותו מעצמו.
- שלב שדילגו עליו לא כותב כלום, ומופיע כ"לא הוגדר" ב"התכנית שלי" ובסיכום. בדף של הקלוד הוא תחת "לא נדרש".
- שמירה של אותו תחום מאוחר יותר (מהשאלון או מהמסך שלו) הופכת אותו ל"הוגדר", ודף הקלוד מתעדכן.
- 3 ארוחות ביום עם יעד של 3 מקבלות 3 פעמים את נקודות הרישום. אצל ירין (בלי `mealsPerDay`) הכול נשאר כמו שהיה.
- עובד בלי אינטרנט, ב-390px, בכל ערכות הצבעים.

## שאלות פתוחות
- להחליט אם לשאול גם על חלון אכילה וצום (כרגע לא, כי אין לו שימוש באפליקציה).
- הלילות הגמישים ממולאים מראש ב-ה׳ ו-ו׳ (ברירת המחדל). להשאיר כך, או להתחיל בלי?
