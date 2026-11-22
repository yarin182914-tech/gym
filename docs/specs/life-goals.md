# מטרות לחיים — תחומים ומטרה ל-3 חודשים
Milestone: M10e · Branch: feature/m10e-life-plan · Status: built 2026-11-19, PR open
Requested by ירין on 2026-11-17: "שאלון התחברות מלא שמבין את הצרכים של המשתמש … אם הוא לא יגדיר משהו … הוא יכול להמשיך הלאה". The second part of that request, after the basics (M10a).
Answers on 2026-11-19:
- Split in two: this PR is the plan's level 2 ("מטרות"); level 3 ("תכנית חיים מלאה": a picture of a win in a year, why, 2–3 goals per area with horizons, A/B/C, weekly steps) is M10f.
- Entry: the questionnaire's last screen asks "רוצה גם להגדיר מטרות?" (עכשיו / אחר כך / אף פעם), and a section in "התכנית שלי".
- A ready idea (a habit or a task for the area) opens the habit wizard or the task form, filled in, to check before saving.
- The coach: reads the goals in `get_brief` and suggests in chat; it writes nothing (writing is M11b).
- Areas: the plan's eight plus one of your own (my default, not asked).

## למה (הבעיה)
ג׳יני יודעת היום מה אוכלים, כמה ישנים ואילו הרגלים יש. היא לא יודעת מה חשוב למשתמש בחיים ולאן הוא רוצה להגיע. בלי זה ההרגלים והמשימות הם רשימה, לא דרך, והקלוד לא יכול לעזור לכוון.

## מה זה עושה (במשפט אחד)
בוחרים תחומי חיים שחשובים לך, ולכל תחום עונים על שלוש שאלות קצרות (איפה אני היום, מה לשנות ב-3 החודשים הקרובים, ואיך אדע שהצלחתי), עם רעיונות מוכנים להרגלים ומשימות. הכול אפשר לדלג.

## איך זה נראה
מסך מלא מעל האפליקציה, כמו שאלון הפתיחה (אותה מסגרת, פסי התקדמות, ›, ✕). 390px, RTL, בכל ערכות הצבעים. פנייה ברבים.
- **פתיחה:** אייקון מטרה, "מטרות לחיים", "בוחרים מה חשוב לכם, ולכל תחום שלוש שאלות קצרות. כ-10 דקות, וכל שאלה אפשר לדלג." כפתורים: "מתחילים" · "אחר כך".
- **מה חשוב לכם עכשיו?** שמונה תחומים כאריחים לבחירה (בריאות וגוף, זוגיות, משפחה וחברים, קריירה ולימודים, כסף, התפתחות אישית, פנאי ותרבות, בית), ו"תחום משלי" שפותח שדה לשם. שורה קטנה: "מומלץ להתחיל ב-2 או 3". "הבא" פעיל רק אחרי בחירה של תחום אחד לפחות; "דלג" סוגר בלי לשמור.
- **מסך לכל תחום שנבחר** (אייקון ושם התחום בכותרת):
  1. "איפה אני היום?" — עשרה כפתורים קטנים 1–10 בשורה אחת. בלי צבעים של טוב/רע.
  2. "מה הדבר האחד שהייתם רוצים לשנות ב-3 החודשים הקרובים?" — שדה טקסט, ומתחתיו 3 דוגמאות לתחום שלחיצה ממלאת.
  3. "איך תדעו שהצלחתם?" — שדה טקסט (למשל "חוסך 1,000 ₪ בחודש"), ותאריך יעד (ברירת מחדל: בעוד 3 חודשים).
  4. "רעיונות שיעזרו" — 2–4 שורות של הרגל או משימה לתחום. לחיצה פותחת את אשף ההרגלים או את טופס המשימה, ממולאים. אחרי שמירה השורה מסומנת "נוסף ✓". מה שכבר קיים (באותו שם) לא מוצע.
  - למטה "דלג" (לא שומר כלום לתחום הזה) · "הבא" (שומר מה שמולא; גם שדה ריק בסדר).
- **סיום:** "התכנית מוכנה!" ושורה לכל תחום: השם, "6/10" והמשפט של 3 החודשים (תחום שדילגו עליו לא מופיע). "תכנית חיים מלאה, עם חזון ומטרות לטווח ארוך: בקרוב". כפתור "סיום".
- **בחירה מחדש:** תחום שהיה מסומן וירד ממנו הסימון במסך הבחירה כבה (כמו "להסיר", התשובות נשמרות).
- **מסך הסיום של שאלון הפתיחה:** במקום "בקרוב" — כרטיס "רוצים גם להגדיר מטרות לחיים? כ-10 דקות" עם "עכשיו" · "אחר כך" · "אף פעם". "עכשיו" פותח את המטרות. "אחר כך" ו"אף פעם" מחליפים את הכרטיס בשורה "אפשר תמיד ב'התכנית שלי'" (ב"אף פעם" לפניה "בסדר, לא נציע שוב."). מי שכבר הגדיר מטרות רואה שורה "מטרות לחיים: כבר הוגדרו".
- **התכנית שלי:** חלק חדש "מטרות לחיים" מתחת לחמשת התחומים של השאלון.
  - בלי מטרות: שורה "תחומים ומטרה ל-3 חודשים · כ-10 דקות" עם "להגדיר". אם נבחר "אף פעם": אותה שורה באפור, "בחרתם לא להגדיר" ו"להגדיר בכל זאת".
  - עם מטרות: שורה לכל תחום (אייקון, שם, "6/10", המשפט של 3 החודשים, והתאריך). לחיצה פותחת רק את המסך של התחום, עם "שמירה" · "ביטול", ולמטה "להסיר את התחום" (התשובות נשמרות, וחוזרות אם בוחרים בו שוב). מתחת: "+ תחום" שפותח את מסך הבחירה.
  - השורה "בקרוב" משתנה ל"בקרוב: תכנית חיים מלאה ושאר ההגדרות".
  - ב-`?dev` "מה הקלוד רואה" מראה גם את המטרות.
- **"+ תחום":** פותח את מסך הבחירה, ואחריו רק את התחומים החדשים.
- **מצבים:** בלי אינטרנט — הכול נשמר מקומית ונשלח אחר כך, כמו השאלון. טעינה — "טוען את התכנית…" הקיים. אין מצב שגיאה חדש: שמירה שנכשלת נרשמת בקונסול כמו היום (הודעה גלויה מגיעה ב-M10c).

## זרימה
1. משתמש מסיים את שאלון הפתיחה ולוחץ "עכשיו" בכרטיס המטרות (או "להגדיר" ב"התכנית שלי").
2. פתיחה → "מתחילים" → בוחר תחומים → "הבא".
3. מסך לכל תחום, בסדר שנבחרו. כל "הבא" שומר את התחום מיד, בלי לחכות לשרת. "דלג" עובר הלאה בלי לשמור.
4. ברעיונות, לחיצה פותחת את האשף או את טופס המשימה מעל המסך. שמירה שם יוצרת את ההרגל או המשימה כרגיל (עם הניקוד הרגיל שלהם), מקושרים לתחום.
5. "אחר כך" או ✕ סוגרים ושומרים מה שכבר נענה. פתיחה מחדש מ"התכנית שלי" מתחילה ממסך הבחירה, עם התחומים שכבר נבחרו מסומנים.
6. מסך הסיום → "סיום" חוזר למסך שממנו נפתח.

## חוקים ומספרים
In `js/lib/rules.js`, a new `LIFE_PLAN` block:
- `suggestedAreas`: 3 ("מומלץ להתחיל ב-2 או 3"; a hint only, no hard limit).
- `maxCustomAreas`: 3 areas of your own.
- `horizonMonths`: 3 (the default target date, local noon).
- `scoreRange`: [1, 10].
- `ideasPerArea`: 4 (the most ideas shown on an area's screen).
- `coachOfferDays`: 30 and `coachMaxDeclines`: 2 (the coach offers to go deeper at most once in 30 days and stops after 2 refusals; used in the brief's text).
- Points: none for the goals themselves. Habits and tasks made from the ideas get their usual points. Nothing goes down.

The areas (ids, Hebrew names, icons, the habit area each maps to) and the ideas live in `js/lib/plan-templates.js`, as content, not numbers.

## Data (Firestore)
On `users/{uid}` (the user doc), written by the app only; the coach reads it through `get_brief`. Goes into docs/DATA.md, "User settings".
- `lifePlan`: map. Missing = never opened (every account today, ירין's included).
  - `planDepth`: `'basic'` · `'goals'`. `'goals'` once one area is saved; `'full'` comes with M10f.
  - `offer`: `'later'` · `'never'`, from the questionnaire's card or the "התכנית שלי" row; `offerAt`: Timestamp.
  - `areas`: map by area id (`health`, `relationship`, `family`, `career`, `money`, `growth`, `fun`, `home`, or `custom-<n>`) → `{ score: number 1–10 | null, wish3m: string, successMetric: string, dueDate: Timestamp (local noon) | null, name?: string and icon?: string (own areas only), removed?: boolean, createdAt: Timestamp, updatedAt: Timestamp }`. Empty strings are fine (answered nothing on that line).
  - `order`: string[] — area ids in the order chosen.
  - `updatedAt`: Timestamp.
  - Writes merge (`setDoc` merge), so saving one area never touches another.
- Habits (`users/{uid}/habits`) and tasks (`users/{uid}/tasks`) made from an idea get a new optional `planArea: string` (the area id). Habits also get `source: 'plan'`; their `area` (body · personal · relationship · career) comes from the area's mapping. Missing `planArea` = not linked, like every habit and task today.
- `offer` with areas: the areas win (the coach gets the goals, not "don't offer").
- Derived, never stored: which areas are active (not `removed`), whether the plan has goals, the linked habits and tasks of an area.

## Server / outside the app
- `get_brief` (`api/_lib/tools.js`, page from `coachBrief()` in `js/lib/coach-brief.js`) adds a "מטרות לחיים" section: each active area with its score, the 3-month change, how success is measured and the date, and the habits linked to it. And in "איך לעבוד":
  - No plan: "אפשר להציע פעם אחת, ברגע טבעי, להגדיר מטרות ב'התכנית שלי'."
  - `offer: 'never'`: "בחר לא להגדיר מטרות. לא מציעים, אלא אם ביקש."
  - Goals: "קושרים הצעות למטרות. להעמיק לתכנית מלאה מציעים לכל היותר פעם ב-30 יום, ואחרי 2 סירובים מפסיקים."
- `get_profile` adds `lifePlan`.
- The server imports the same pure helpers from `js/lib/` (as `get_brief` already does), so the app and the coach read the plan the same way.
- **No `firestore.rules` change** (everything is under `users/{uid}`). No env vars.

## לא בגרסה הזאת
- תכנית חיים מלאה: חזון לשנה, למה, 2–3 מטרות לתחום, אופקים, A/B/C, צעדים שבועיים (M10f).
- בדיקה שבועית/חודשית/רבעונית של המטרות ותזכורות (M10f ו-M9).
- הקלוד כותב או משנה מטרות, וכרטיסי הצעה לאישור (M11b).
- ניקוד או תגים על מטרות.
- סימון משימה שמקדמת מטרה כ"חשובה" אוטומטית.

## הגדרת "גמור"
- מסיום שאלון הפתיחה, "עכשיו" פותח את המטרות; בחירת שני תחומים ומילוי שלוש השאלות לוקחים כ-5 דקות, והם מופיעים ב"התכנית שלי".
- "דלג" בתחום לא שומר כלום לתחום; "אף פעם" נשמר, והשורה ב"התכנית שלי" אפורה עם "להגדיר בכל זאת".
- רעיון של הרגל פותח את האשף ממולא; אחרי שמירה ההרגל מופיע ב"היום" והשורה מסומנת "נוסף ✓". רעיון של משימה פותח את טופס המשימה ממולא.
- "להסיר את התחום" מוריד אותו מהרשימה, ובחירה בו שוב מחזירה את התשובות.
- דף הקלוד (`get_brief`) מראה את המטרות, ואומר לא להציע כשנבחר "אף פעם".
- ירין (בלי `lifePlan`) רואה את אותה אפליקציה, ורק שורה חדשה ב"התכנית שלי".
- עובד בלי אינטרנט, ב-390px, ב-DARK, BRIGHT ובחמש הערכות האקראיות.

## Built (2026-11-19)
- `js/lib/plan-templates.js` (areas and ideas), `js/lib/life-plan.js` (pure helpers, the coach's section), `LIFE_PLAN` in `js/lib/rules.js`, test `tools/test-life-plan.mjs`.
- `js/ui/life-plan.js` (the screen, in the questionnaire's frame and styles), the offer in `js/ui/onboarding.js`, the section in `js/pages/plan.js`.
- `openHabitWizard({ template })` opens a new habit on its first question, filled in; `openTaskSheet` keeps `prefill.planArea` on a new task.
- `saveLifePlan()` in `js/lib/firestore.js`. The `?dev` sandbox now merges nested maps like Firestore's `setDoc` merge.
- Six Lucide icons: users, briefcase, wallet, sprout, music, house. No new colour tokens.
- `get_profile` adds `lifePlan` (`planForCoach`), `get_brief` adds `planDepth`. Service worker cache v22. `privacy.html` lists goals among what is saved.

## שאלות פתוחות
- הקלוד לא יכול לרשום "סירוב" (אין לו כלי כתיבה עד M11b), אז "2 סירובים" נשען על הזיכרון של הצ׳אט. לרשום את זה ב-M11c (זיכרון המאמן)?
- 8 התחומים ותחום משלי: ברירת המחדל שלי, לא נשאל. לשנות אם צריך.
