# שריפה ויעדים אישיים — "ספרו לג׳יני על הגוף"
Milestone: M16a · Branch: feature/m16a-body-burn · Status: built 2026-11-16, PR open
Requested by ירין on 2026-11-12: "לפתוח את ג׳ימי למאיה". Answers on 2026-11-16:
- M16 splits in two: M16a (this: a short body form → personal burn and targets), then M16b (Maya's Claude).
- Where: a card on Today that can be skipped, until it's filled. Always editable from "יעדים" on the nutrition screen.
- No goal question: the target stays "a little under the burn" (the existing 250 deficit), editable by hand.
- ירין's own app doesn't change: the card shows only for new accounts, and ירין stays on 1950.

## למה (הבעיה)
השריפה הבסיסית קבועה בקוד על 1950 קלוריות, המספר של ירין. מאיה (ואחריה חברים) מקבלת את המספר של ירין, ולכן יעד הקלוריות והחלבון שלה לא נכונים, והניקוד של התזונה נמדד מול יעדים של מישהו אחר.

## מה זה עושה (במשפט אחד)
ארבע שאלות קצרות (משקל, גובה, גיל, מין) נותנות לכל משתמש חדש שריפה בסיסית ויעדי קלוריות וחלבון משלו, ואפשר לתקן כל מספר ביד.

## איך זה נראה
390px, RTL, מראה "זהב", בכל ערכות הצבעים (DARK, BRIGHT וכל ה־RANDOM). פנייה ברבים, כמו בשאר האפליקציה ("ספרו", "מלאו").

**כרטיס במסך "היום"** (אחרי כרטיס "הצעד הבא", מעל המשימות וההרגלים):
- כותרת: "כמה אתם שורפים ביום?"
- שורה: "ארבע שאלות, ושריפה ויעדים שמתאימים לכם."
- כפתור "למלא" · קישור קטן "לא עכשיו" (מסתיר ל־3 ימים).
- מופיע רק לחשבון חדש (נוצר מ־14.11.2026 והלאה) שעוד לא מילא. ירין לא רואה אותו.

**הגיליון "הגוף שלי"** (נפתח מהכרטיס ומ"יעדים"):
- משקל (ק"ג): ממולא מהשקילה האחרונה אם יש.
- גובה (ס"מ), גיל (שנים).
- מין: שני כפתורים, "אישה" · "גבר".
- מתחת, מתעדכן תוך כדי הקלדה: "שריפה בסיסית 1,584 קל׳ ביום · יעד חלבון 95 גרם" (לפני שהכול מולא: "מלאו את כל השדות, והשריפה תופיע כאן."; אחרי שמירה עם שדה לא תקין: "כדאי לבדוק: משקל").
- שורה קטנה: "מחושב בנוסחת Mifflin-St Jeor. אימונים וצעדים נוספים על זה כל יום."
- כפתור "שמירה". אחרי שמירה: "נשמר. היעדים שלכם מעודכנים", והכרטיס נעלם.

**"יעדים" במסך התזונה:** שורה חדשה למעלה "שריפה בסיסית" (אפשר לערוך ביד), וקישור "חישוב מהגוף" שפותח את הגיליון. משתמש שלא מילא רואה 1950 כמו היום.

מצבים: ריק (בלי שקילה, השדות ריקים) · שגיאה (מספר לא סביר: הודעה אפורה ליד השדה, לא אדום) · בלי אינטרנט (נשמר בטלפון ויוצא כשחוזרת הרשת, כמו כל שמירה).

## זרימה
1. מאיה פותחת את "היום" ורואה את הכרטיס.
2. "למלא" ← הגיליון. ממלאת ארבעה שדות ורואה את התוצאה מתעדכנת.
3. "שמירה" ← נשמרים במסמך המשתמש: הנתונים, השריפה הבסיסית ויעדי הקלוריות והחלבון.
4. מהרגע הזה כל יום חדש נשמר עם השריפה שלה (גם כשהצעדים מגיעים מהאייפון וגם כשהקלוד רושם). היום הנוכחי מתעדכן מיד אם כבר נשמר לו יום. ימים קודמים נשארים כמו שהם.
5. עריכה מאוחרת מ"יעדים" עובדת אותו דבר: "חישוב מהגוף" פותח את הגיליון עם התשובות השמורות, ו"שריפה בסיסית" שמוקלדת ביד נשמרת (וגם מזיזה את היום הנוכחי) רק אם היא השתנתה. מספר ששונה ביד נשאר כמו שהוא עד שלוחצים שוב "חישוב מהגוף".

## חוקים ומספרים
Everything in `js/lib/rules.js`, new `BODY` block:
- BMR (Mifflin-St Jeor): `10·kg + 6.25·cm − 5·age + 5` (man) / `− 161` (woman).
- `baseKcal = round(BMR × BODY.baseFactor)`, `baseFactor: 1.2` (sedentary; steps and workouts are added on top, as today).
- `calorieTarget` (days with no burn logged) `= roundTo50(BMR × BODY.noBurnFactor) − calorieDeficit`, `noBurnFactor: 1.375` (lightly active).
- `proteinTarget = roundTo5(kg × BODY.proteinPerKg)`, `proteinPerKg: 1.6`.
- Limits: weight 30–250 kg, height 120–230 cm, age 14–100 (`BODY.limits`).
- `BODY.cardFromDate: '2026-11-14'`: the card shows only for accounts whose Firebase Auth `creationTime` is on or after this date.
- `BODY.snoozeDays: 3`.
- `ACTIVITY.baseKcal: 1950` stays as the default for anyone without a personal `baseKcal`.
- No points for filling the form (nothing to game; may come with M10).

## Data (Firestore)
`users/{uid}` (the user doc), new fields, written by the app with `merge`:

| Field | Type | Meaning |
|---|---|---|
| `body` | map | `{ weightKg: number, heightCm: number, birthYear: number, sex: 'female' \| 'male', updatedAt: Timestamp }`. Age is stored as `birthYear` (Israel-time year − age) so it doesn't go stale. |
| `baseKcal` | number | Personal resting + daily-life burn. Missing → `1950` (`ACTIVITY.baseKcal`). Used for every new `dailyActivity` doc. |

`calorieTarget` and `proteinTarget` already exist; the form writes them. `calorieDeficit` is not touched.

`users/{uid}/dailyActivity/{date}`: no shape change. New docs take `baseKcal` from the user doc instead of the fixed 1950 — in the app (nutrition burn sheet, workout calories), in `POST /api/steps`, and in the MCP `set_steps` path (`api/_lib/tools.js`). Existing docs keep their own `baseKcal`; the only rewrite is today's doc, when the user saves the form (`baseKcal` and `totalOutKcal` recomputed from its own `stepsKcal` + `workoutKcal`).

`bodyCardSnoozedAt` (Timestamp) on the user doc: "לא עכשיו" was tapped; the card returns `snoozeDays` later.

The MCP `get_profile` tool returns `body` and `baseKcal`, so the coach Claude sees them. All of this goes into `docs/DATA.md` (user settings + daily activity sections).

## Server / outside the app
- `api/steps.js` and `api/_lib/tools.js` read `users/{uid}.baseKcal` once per request when they create a new day doc (one extra read).
- No `firestore.rules` change (`users/{uid}/**` is already the user's). No env vars.

## לא בגרסה הזאת
- שאלה על מטרה (ירידה / שמירה / עלייה): לא עכשיו, לפי ירין.
- שקילה שנשמרת מהטופס כשקילה של היום.
- חישוב מחדש אוטומטי כשהמשקל משתנה.
- הקלוד של מאיה, עמוד "קלוד" והוראות לפרויקט "ניהול חיים": M16b.
- השאלון המלא של ההרשמה: M10 (שישתמש באותו גיליון).

## הגדרת "גמור"
- חשבון חדש רואה את הכרטיס ב"היום"; חשבון של ירין לא רואה אותו, והשריפה שלו נשארת 1950.
- 60 ק"ג, 165 ס"מ, גיל 30, אישה → שריפה בסיסית 1,584 (BMR 1,320.25 × 1.2), חלבון 95 גרם (בדיקה ב־`tools/test-body-burn.mjs`).
- אחרי שמירה: יום חדש מהאייפון (`/api/steps`) ומהקלוד נשמר עם השריפה האישית; ימים קודמים לא משתנים.
- עריכה ידנית של "שריפה בסיסית" ב"יעדים" נשמרת ומשמשת מאותו רגע.
- עובד בלי אינטרנט, ונראה נכון ב־390px בכל ערכות הצבעים.

## צילומי מסך
`docs/screenshots/m16a/`: הכרטיס (DARK, BRIGHT), הגיליון ממולא (DARK, BRIGHT, synthwave), "יעדים" (DARK).

## שאלות פתוחות
- אין.
