# דף המשוב — פרטי, מסודר ומהיר
Milestone: M15a · Branch: feature/m15a-feedback-page · Status: draft
Requested by ירין on 2026-11-12: "לפני פיצ׳רים חדשים, לתקן את מה שקיים … להתחיל מדף המשוב". Answers on 2026-11-15:
- Who sees what: "אנשים לא יכולים לראות את המשובים - אני יכול כמנהל האפליקצייה לראות בלבד - מי ששולח זה רושם לו הודעה של תודה ששלחת ומשאיר רק אצלו מקופל את המשובים שלו עם סטטוס ביצוע - מה שכבר בוצע יכול לרדת מהתצוגה אצל המשתמש. אצלי אני רואה הכל".
- Closed items: folded at the bottom. A user's done item disappears from their view after 7 days.
- The form: text + type as small buttons; the name comes from the Google account.
- A user may fix or delete their own item while it is still "חדש".
- No reply line from ירין in this version.

## למה (הבעיה)
היום כל מי שמחובר רואה את כל המשובים של כולם, עם השמות, ויכול לשנות להם סטטוס ואפילו למחוק אותם. כשמאיה (ואחריה חברים) תתחיל לדווח, זה לא פרטי ולא בטוח. בנוסף, פריטים שבוצעו מעורבבים עם פתוחים, וקשה לראות מה עוד מחכה. הטופס ארוך מדי לטלפון: שלושה שדות, כולל שם שמקלידים ביד.

## מה זה עושה (במשפט אחד)
כל משתמש שולח משוב בשניים־שלושה מגעים ורואה רק את המשובים שלו ומה קרה איתם, ורק ירין רואה את כולם ומנהל אותם.

## איך זה נראה
390px, RTL, מראה "זהב", בכל ערכות הצבעים (DARK, BRIGHT וכל ה־RANDOM).

**טופס השליחה** (אותו טופס מהדף ומתפריט הפרופיל, "שליחת משוב"):
- כותרת "משוב על ג׳יני".
- שדה טקסט: "מה שמת לב אליו?", עם דוגמה כמו היום.
- "סוג": כפתורים קטנים בשורה אחת שנגלשת: באג · חוויית שימוש · עיצוב · רעיון · אחר. ברירת מחדל: אחר. (הסוגים "פיצ׳ר חדש" ו"הצעה" מתאחדים ל"רעיון" בתצוגה; ערכים ישנים נשמרים כמו שהם.)
- שורה קטנה: "רק המפתח של ג׳יני רואה את זה."
- כפתור "שליחה". אין שדה שם: השם נלקח מחשבון הגוגל.
- אחרי שליחה: הודעה "תודה ששלחת! זה עוזר לשפר את ג׳יני". גם בלי אינטרנט: המשוב נשמר בטלפון ויוצא כשחוזרת הרשת.

**הדף, אצל משתמש רגיל** ("המשובים שלי" בתפריט הפרופיל):
1. כרטיס קטן למעלה: "ראית באג או יש לך רעיון? כאן כותבים למפתח." וכפתור "שליחת משוב".
2. שורה מקופלת "המשובים שלי (3)". לחיצה פותחת את הרשימה, החדשים קודם. בכל פריט: הטקסט, הסוג, התאריך ותגית מצב:
   - "נשלח" (חדש) · "בטיפול" · "בוצע ✓" · "נסגר" (מה שירין דחה; בלי המילה "נדחה" ובלי אדום).
   - פריט "בוצע" או "נסגר" נעלם מהרשימה 7 ימים אחרי שנסגר.
   - פריט "נשלח" אפשר לתקן או למחוק (כפתור ⋯). אחרי שירין התחיל לטפל אין כפתור.
3. אין משובים: שורה ריקה עדינה "עוד לא שלחת משוב." (בלי "תהיה הראשון").

**הדף, אצל ירין** ("כל המשובים" בתפריט):
1. אותו כרטיס קטן למעלה.
2. "פתוחים (5)": חדש ובטיפול, החדשים קודם. בכל פריט: הטקסט, הסוג, השם, התאריך ותגית מצב.
3. שורה מקופלת "סגורים (12)" בתחתית: בוצע ונדחה, כל ההיסטוריה (אצל ירין שום דבר לא נעלם).
4. ⋯ על פריט: סטטוס (חדש · בטיפול · בוצע · נדחה), עריכה ומחיקה, כמו היום.

**מצבים:** טעינה (שלד כמו היום) · ריק · בלי אינטרנט (מה שכבר נטען מוצג; שליחה נשמרת בטלפון) · שגיאה בשמירה (הודעה "לא נשמר, נסו שוב", הטופס נשאר פתוח עם הטקסט).

## זרימה
1. משתמש לוחץ "שליחת משוב" (בדף או בתפריט הפרופיל).
2. כותב, בוחר סוג (או משאיר "אחר"), לוחץ "שליחה".
3. הטופס נסגר, מופיעה הודעת התודה, והמשוב מופיע אצלו ב"המשובים שלי" עם התגית "נשלח".
4. ירין רואה אותו ב"פתוחים", משנה ל"בטיפול" ואחר כך ל"בוצע".
5. המשתמש רואה "בטיפול" ואז "בוצע ✓". אחרי 7 ימים הפריט יורד מהרשימה שלו. אצל ירין הוא נשאר ב"סגורים".

## חוקים ומספרים
In `js/lib/rules.js`, a new `FEEDBACK` block:
- `closedVisibleDays: 7`: how long a done/dismissed item stays in its author's list after `closedAt`.
- `listMax: 200`: how many items one read fetches (today a hard-coded 200).
- `adminUids: ['<ירין's uid>']`: who sees and manages every item. A Firebase uid is not a secret (it grants nothing by itself), so it can sit in the public repo. The same list is written into `firestore.rules`, and a test checks the two match.

No points, levels or streaks for feedback.

## Data (Firestore)
`siteFeedback/{id}` (top level, unchanged location), written by the app only:
- `text` string, `category` string (`bug | ux | ui | feature | suggestion | other`; the form now writes `bug | ux | ui | feature | other`, and `suggestion` still reads as "רעיון"), `status` string (`new | in_progress | done | dismissed`), `authorUid` string, `createdAt` / `updatedAt` Timestamp: as today.
- `author` string: now always the Google display name at the time of sending (no longer typed). Old items keep what was typed.
- **New:** `closedAt` Timestamp | null. Set to the server time when the status becomes `done` or `dismissed`, set back to `null` when it goes back to `new` / `in_progress`. Old items have no `closedAt`: the app falls back to `updatedAt`.
- Old items with no `authorUid` (if any exist) become visible to ירין only.

Reads: the admin lists everything (newest first, `listMax`). A user lists `where('authorUid', '==', uid)` only, with no `orderBy`, so no composite index is needed; the app sorts on the phone.

`docs/DATA.md` gets a short `siteFeedback` section with these fields and who may read them.

## Server / outside the app
**`firestore.rules` changes** (the rule today lets any signed-in user read, edit and delete everything):
- read: the admin, or the item's author.
- create: any signed-in user, only as themselves (`authorUid == auth.uid`), with `status == 'new'` and `closedAt == null`.
- update: the admin; or the author while the item is `new`, without changing `status`, `authorUid`, `closedAt` or `createdAt`.
- delete: the admin; or the author while the item is `new`.

**ירין must run `firebase deploy --only firestore:rules` before the merge.** Without it, the live site keeps today's open rule; with the new rules but the old app, a user's "all feedback" read is refused (that's why the deploy goes right before the merge, not days earlier).

This takes the feedback part out of M9s ("the feedback board readable and editable only by its author plus an admin"); M9s keeps the rest.

`privacy.html`: the line "מה שכותבים ב'משוב' גלוי לכל המשתמשים, עם השם שלך" becomes "מה שכותבים ב'משוב' רואים רק את/ה ומפתח ג׳יני".

## לא בגרסה הזאת
- תשובה כתובה של ירין למשוב (אולי בהמשך).
- צילום מסך מצורף.
- התראה למשתמש כשהסטטוס משתנה (שייך ל־M9, התראות).
- סינון לפי סוג או חיפוש אצל ירין.
- שאר המסכים של M15 (M15b והלאה).

## הגדרת "גמור"
- משתמש שני (לא ירין) רואה רק את המשובים שלו. גם קריאה ישירה ל־Firestore של משוב של מישהו אחר נדחית (בדיקה מול הכללים החדשים).
- משתמש לא יכול לשנות סטטוס, ולא יכול לערוך או למחוק משוב שכבר "בטיפול", גם לא בקריאה ישירה.
- שליחה בשני מגעים (טקסט ושליחה) או בשלושה (עם סוג), עם הודעת תודה, גם במצב טיסה.
- אצל ירין: "פתוחים" למעלה ו"סגורים" מקופל למטה; שינוי סטטוס מעביר פריט ביניהם מיד.
- פריט "בוצע" נעלם מהרשימה של המשתמש אחרי 7 ימים, ונשאר אצל ירין.
- הכל נראה טוב ב־390px, RTL, בכל ערכות הצבעים, בלי שגיאות בקונסול.
- `tools/test-feedback.mjs` עובר (חלוקה לפתוחים/סגורים, הסתרה אחרי 7 ימים, מי יכול לערוך, התאמת רשימת המנהלים לכללים).

## שאלות פתוחות
- (אין. הכל נענה ב־2026-11-15.)
