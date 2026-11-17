# מסך האימון — מתחילים מהסוג, ורואים אימון פעיל מכל מקום
Milestone: M15c · Branch: feature/m15c-workout-screen · Status: built 2026-11-17, PR open
Requested by ירין on 2026-11-10 on the feedback board: "שיתחיל בכלל בהוספת סוג האימון ומשם לתרגילים … לייצר לוגיקה הגיונית של תהליכיות בהתחלת אימון". Plus M3d's unbuilt "אימון פעיל" pill (feedback 9.11). Answers on 2026-11-16:
- The kinds go straight on the empty workout screen, no extra sheet.
- כוח and אירובי as two big buttons; functional, CrossFit, Pilates and the user's own types as small buttons under them, with "+ סוג משלך".
- The pill says only "אימון פעיל" (no clock).
- It shows only for a live workout (started now), on every screen except the workout screen itself.

## למה (הבעיה)
היום כדי להתחיל אימון לוחצים "התחלת אימון", אחר כך "+ הוספת תרגיל", ורק אז בוחרים כוח, אירובי או סוג אחר. שלוש לחיצות לפני התרגיל הראשון, ומסך ריק באמצע. בנוסף, כשיוצאים מהאימון לתזונה או ל"היום" באמצע אימון, אין שום סימן שאימון עדיין רץ, וקל לשכוח לסיים אותו.

## מה זה עושה (במשפט אחד)
בוחרים סוג אימון בלחיצה אחת והתרגילים שלו נפתחים מיד, ומכל מסך רואים כפתור "אימון פעיל" שמחזיר לאימון.

## איך זה נראה
390px, RTL, מראה "זהב", בכל ערכות הצבעים (DARK, BRIGHT וכל ה־RANDOM).

**מסך האימון כשאין אימון פתוח** (במקום הכרטיס "מוכן להתחיל?"):
1. כרטיס האימון המתוכנן להיום מהמאמן, אם יש (כמו היום, בלי שינוי).
2. כרטיס "איזה אימון היום?":
   - שני כפתורים גדולים זה לצד זה: **כוח** (אייקון משקולת) · **אירובי** (אייקון ריצה).
   - מתחתם שורה "אימון אחר": כפתורים קטנים — פונקציונלי, קרוספיט, פילאטיס… והסוגים שלך, ובסוף "+ סוג משלך".
   - בתחתית, כפתור משני קטן: "הוספת אימון שכבר בוצע" (כמו היום).
3. הסוגים שלך נטענים ברקע: עד שהם מגיעים רואים את הסוגים המובנים, והשורה מתמלאת לבד.

**"אימון נוסף"** (ה־+ בלשוניות כשכבר יש אימון פתוח): אותו בחירת סוג בדף מלמטה, במקום "התחלת אימון".

**ה־+ הצף → "אימון"**: פותח את מסך האימון עם בחירת הסוג (מסך ריק, או "אימון נוסף" כשכבר יש אימון פתוח). כבר לא נוצר אימון ריק לפני שבחרת.

**כפתור "אימון פעיל"**:
- גלולה קטנה ממורכזת מעל סרגל הניווט, בצבע ההדגשה של ערכת הצבעים, עם אייקון משקולת והמילים "אימון פעיל".
- מופיעה בכל מסך חוץ ממסך האימון, רק כשיש אימון חי פתוח (התחלת עכשיו; לא אימון בדיעבד ולא עריכה מההיסטוריה).
- לחיצה → מסך האימון, על האימון שהיה פתוח.
- נעלמת מיד כשמסיימים או מוחקים את האימון. לא מכסה את ה־+ הצף ולא כפתורי שמירה; מתחבאת יחד איתו כשמקלדת או דף מלמטה פתוחים.
- אימון ששכחת פתוח מאתמול: הגלולה עדיין מופיעה — תזכורת עדינה לסיים, בלי צבע אזהרה.

**נקודה על אייקון האפליקציה**: בזמן אימון חי, האייקון במסך הבית מקבל את הספרה 1, ונמחקת בסיום. בטלפון זה עובד רק אחרי שהאפליקציה קיבלה הרשאת התראות (מגיע ב־M9), ולכן כרגע ייתכן שלא תראה אותה. במקום שלא תומך — פשוט לא קורה כלום.

## זרימה
1. לוחצים "אימון" בניווט → "איזה אימון היום?".
2. **כוח** → נפתח אימון חדש, ורשימת תרגילי הכוח פתוחה עם "לאחרונה", הקבוצות (חזה, גב…) והחיפוש. השורה "אימון אחר" לא חוזרת בתוך הרשימה (כבר בחרת סוג).
3. **אירובי** → נפתח אימון חדש, ורשימת האירובי פתוחה (הליכה, ריצה, אופניים…).
4. **סוג אחר** (פילאטיס וכו׳) → נפתח אימון חדש והסוג כבר בתוכו, מוכן למילוי.
5. **+ סוג משלך** → בונים סוג חדש; בשמירה נפתח אימון והסוג בפנים.
6. ממשיכים כמו היום: "+ הוספת תרגיל" מוסיף עוד תרגילים מכל סוג.
7. יוצאים למסך אחר → "אימון פעיל" מעל הניווט → לחיצה מחזירה.
8. "סיום אימון" → הגלולה והנקודה על האייקון נעלמות.

## חוקים ומספרים
אין מספרים חדשים. (המגבלה של עד 5 אימונים פתוחים נשארת כמו שהיא.)

## Data (Firestore)
No change. Nothing new is saved: the open workouts already live in the phone's `localStorage` (`gym-active-sessions-v2`, each with `live: true|false`), and the pill reads that. No `docs/DATA.md` change.

## Server / outside the app
None. No `api/` change, no env vars, **no `firestore.rules` change**.

Technical notes:
- `js/lib/active-workout.js` (pure, tested in `tools/test-active-workout.mjs`): `hasLiveWorkout(rawStorageString)` — true when any stored session is `live` and not an edit of a saved workout; tolerant of missing/broken storage.
- `js/ui/active-workout-pill.js`: one pill element added once by `js/app.js`; updates on route change, on a `gym-sessions-changed` event that `persistSession()` in `js/pages/active-session.js` dispatches, and on `storage` (another tab). Also calls `navigator.setAppBadge(1)` / `clearAppBadge()` when supported, only when the state changes, inside try/catch.
- The exercise picker's "אימון אחר — נכנס ישר" row shows only when no kind is chosen yet (an empty backdated workout opened with "+ הוספת תרגיל").
- `js/pages/active-session.js`: the empty state and "אימון נוסף" render one shared kind chooser; a pick starts the workout and opens the picker on that kind (`picker.mode`), or adds the type directly. The + button's "אימון" shows the chooser instead of starting an empty workout. "הליכה" from the + stays as it is.
- Styles: pill and chooser in `css/03-components.css`, colours only from tokens; hidden with the FAB's existing rules (sheet open, keyboard up).
- Service worker cache `gym-site-v19` (v18 is taken by the open M16a PR).

## לא בגרסה הזאת
- שעון רץ על הגלולה (בחרת בלי).
- תוכניות אימון מוכנות לפי סוג, או תרגילים מוצעים לפי הסוג מעבר לרשימות של היום.
- Live Activity של האייפון (אפליקציית אינטרנט לא יכולה).
- שינוי במסך האימון עצמו אחרי ההתחלה (גרירה, סטים, טיימר).

## הגדרת "גמור"
- ממסך האימון הריק: כוח → רשימת הכוח פתוחה בלחיצה אחת; אירובי → רשימת האירובי בלחיצה אחת; פילאטיס → פילאטיס כבר בתוך האימון בלחיצה אחת.
- ה־+ → "אימון" לא יוצר אימון ריק לפני בחירת סוג.
- באימון חי, הגלולה "אימון פעיל" מופיעה ב"היום", תזונה, שינה, משימות והיסטוריה, ולא במסך האימון; לחיצה מחזירה לאימון; אחרי סיום היא נעלמת.
- אימון בדיעבד או עריכה מההיסטוריה לא מציגים גלולה.
- הגלולה לא מסתירה את ה־+ ולא כפתור שמירה, גם כשהמקלדת פתוחה.
- הכל עובד במצב טיסה, ב־390px, בכל ערכות הצבעים, בלי שגיאות בקונסול.

## שאלות פתוחות
אין.
