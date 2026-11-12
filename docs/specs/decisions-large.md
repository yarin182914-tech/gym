# להחליט, חלק 2 — החלטות גדולות, כללים אישיים ובדיקה
Milestone: M6c · Branch: feature/m6c-decisions-large · Status: draft
Requested by ירין on 2026-11-12: "/feature" (the next milestone; plan: "קבלת החלטות: "להחליט"", the parts M6b left out).

## למה (הבעיה)
M6b פתר החלטות קטנות ובינוניות. נשארו שלושה חורים:
1. **החלטות גדולות** (עבודה, דירה, קשר) רצות היום כבינוניות, בלי זמן לחשוב ובלי כלים שמורידים חרדה.
2. **אותה התלבטות חוזרת** (איזו מסעדה, לקנות או לא) נפתחת כל פעם מאפס.
3. **אין סגירת מעגל:** לא רואים בדיעבד שרוב ההחלטות יצאו בסדר, וזה מה שמוריד את החרדה בפעם הבאה.

## מה זה עושה (במשפט אחד)
מסלול "גדולה" עם שלבי WRAP ושבוע לחשוב; כללים אישיים שסוגרים התלבטות חוזרת בלחיצה אחת; ושאלה "איך זה יצא?" חודש או שלושה חודשים אחרי.

## איך זה נראה
- **מסלול גדול** (בחלון ההחלטה הקיים): כשהמיון אומר "גדולה" (או כשבוחרים אותה ביד), היא כבר לא רצה כבינונית.
  פס שלבים למעלה, וכל שלב הוא רשות. כפתור "החלטתי" קבוע בתחתית בכל שלב.
  1. **אפשרויות:** לפחות 3 (עד 4). רמז: "ואם אף אחת מהן לא הייתה קיימת?"
  2. **מה היית אומר לחבר?** שורת טקסט.
  3. **בדיקה מול המציאות:** הקריטריונים והציונים מהמסלול הבינוני (רשות), עם ההצעה המחושבת.
  4. **מרחק:** שאלת 10-10-10 (כמו בבינונית).
  5. **Premortem:** "עברה שנה וזה לא הצליח. למה?" שורת טקסט.
  6. **ניסוי קטן:** מה בודקים + עד מתי (רשות). כשיש ניסוי פתוח, ההחלטה מסומנת ברשימה "מחכה לניסוי",
     וכשחוזרים אליה כותבים "מה למדתי".
  - **תאריך החלטה:** ברירת מחדל שבוע מהיום. אפשר לשנות. אין טיימר דקות, רק "עוד X ימים".
- **כללים אישיים:**
  - כשכותבים שאלה חדשה ויש כלל שאחת ממילות המפתח שלו מופיעה בה, מופיע כרטיס: "יש לך כלל לזה: מסעדה — הראשונה שנראית טובה"
    עם "להשתמש בכלל" (ההחלטה נסגרת מיד) או "לא הפעם" (ממשיכים כרגיל).
  - בסוף כל החלטה שהוחלטה: "להפוך לכלל?" עם טקסט מוכן מהבחירה והנימוק, ומילות מפתח מוצעות מהשאלה. אפשר לערוך.
  - בלשונית "להחליט": כפתור "הכללים שלי" → רשימה, הוספה, עריכה, מחיקה. ריקה: הסבר במשפט אחד ודוגמה.
- **"איך זה יצא?":**
  - בינונית: 30 יום אחרי ההחלטה. גדולה: 90 יום. קטנה: אין.
  - ביום שהגיע הזמן: שורה אחת ב"היום" (מתחת להחלטה הקרובה), ותג "לבדוק" על ההחלטה בלשונית "החלטתי".
  - התשובות: "טוב" / "בסדר" / "פחות", ושורת הערה. אין תשובה נכונה, והנקודות זהות לכולן.
- 390px, RTL, בכל ערכות הצבעים (DARK, BRIGHT, וכל ה-RANDOM). בלי אדום: תאריך שעבר הופך אפור, "פחות" אפור.
- בלי אינטרנט: הכול עובד מהמטמון המקומי, כולל התאמת הכללים.

## זרימה
**גדולה**
1. שאלה → מיון → "גדולה" (מוצעת או נבחרת) → "להתחיל". נשמרים `startedAt` ו־`decideBy` = עוד 7 ימים (צהריים).
2. עוברים בין השלבים בפס למעלה או ב"הבא". כל מה שנכתב נשמר כשיוצאים משדה וכשסוגרים.
3. "החלטתי" בכל שלב → בחירת אפשרות → נימוק והרגשה → נשמר כ"החלטתי". 40 נקודות עד סוף יום התאריך, 10 אחריו.
4. אפשר לסגור באמצע; היא נשארת פתוחה עם "עוד X ימים". אפשר להזיז את התאריך (זה לא עונש, רק משנה את הגבול).

**כלל**
1. כותבים שאלה → אם כלל מתאים, מופיע הכרטיס לפני המיון.
2. "להשתמש בכלל" → ההחלטה נשמרת מיד כ"החלטתי", `method: 'rule'`, `ruleId`, הבחירה = טקסט הכלל. 5 נקודות (קטנה בזמן) + 3 על הכלל.
3. אחרי כל החלטה אחרת: "להפוך לכלל?" → שם (למשל "מסעדה"), מה עושים ("הראשונה שנראית טובה"), מילות מפתח → נשמר. +10 נקודות.

**בדיקה**
1. ביום הבדיקה השורה מופיעה ב"היום". לחיצה → חלון קטן עם השאלה, מה החלטתי ולמה, ושלוש התשובות.
2. שמירה → +3 נקודות, השורה נעלמת. אפשר גם "לא עכשיו" (היא נשארת עד שעונים).

## חוקים ומספרים
All in `js/lib/rules.js` → `DECISIONS`:
- Large: `decideByDays: 7`; on time = decided before the end of the `decideBy` day (Israel time). Points 40 on time / 10 late. Not-reopened +5 as before.
- `minOptionsLarge: 3`.
- Rules: using a rule +3 (`ruleUse`), a new rule +10 (`ruleNew`), at most `ruleNewPerDay: 1` paid per day (so delete-and-recreate can't farm). A rule-closed decision is a small one decided on time (5) and gets no not-reopened bonus.
- Rule match: a keyword matches a question word exactly, or after one Hebrew prefix letter (ה ו ב ל מ ש כ), ignoring case and niqqud. `maxKeywords: 6`. Suggested keywords from the question: up to 3 words of ≥ 3 letters, skipping a short stop-word list.
- Review: `reviewDays: { medium: 30, large: 90 }`, points `review: 3`. Shown on Today: `homeReviewCount: 1`.
- Badges "מחליט בזמן" (5/20/50) count large decisions too.
- Never points for "being right", nothing taken away.

## Data (Firestore)
**Changed — `users/{uid}/decisions/{auto}`** (app writes; old docs read with defaults via `normalizeDecision`):
- `track` adds `large`.
- New, all optional: `friendAdvice` string · `premortem` string · `experiment` { text, by (Timestamp, local noon) | null, learned } | null ·
  `ruleId` string | null · `method` adds `rule` · `reviewedAt` Timestamp | null · `outcome` good|ok|meh|null · `outcomeNote` string.
- The review date is **not stored**: `decidedAt` + `reviewDays[track]` (derived). Medium decisions from M6b get their review too.

**New — `users/{uid}/decisionRules/{auto}`** (app writes):
`name` string ("מסעדה") · `rule` string ("הראשונה שנראית טובה") · `keywords` string[] (1–6) · `fromDecisionId` string | null ·
`createdAt`, `updatedAt` Timestamps. How often a rule was used is derived from decisions with its `ruleId`.

**Ledger** (`pointsLedger`): new rules `decision-rule` (+3, ref = decision id), `decision-rule-new` (+10, ref = rule id),
`decision-review` (+3, ref = decision id, on the day reviewed); source `decision`. `decision` grades on-time/late cover large.

No `firestore.rules` change: `users/{uid}/{document=**}` already covers both collections.

## Server / outside the app
None.

## לא בגרסה הזאת
- תאריך ההחלטה ביומן גוגל (צריך את M7).
- התראה בטלפון על יום בדיקה (M9).
- קלוד שמציע כללים או קורא את היומן (אחר כך, דרך ה-MCP).
- גרפיקה של ירין למשחק הרגליים.

## הגדרת "גמור"
- החלטה גדולה רצה במצב טיסה דרך כל השלבים, ו"החלטתי" עובד מכל שלב.
- החלטה גדולה שהוחלטה ב-23:59 של יום התאריך מקבלת 40, ובחצות 10 (בדיקה אוטומטית).
- "איפה לאכול הערב?" מוצא את הכלל עם מילת המפתח "לאכול"/"אוכל", ו"להשתמש בכלל" סוגר אותה בלחיצה אחת (בדיקה אוטומטית להתאמה, כולל אות קידומת).
- החלטה בינונית שהוחלטה לפני 30 יום מופיעה ב"היום" כ"איך זה יצא?", ותשובה נותנת 3 נקודות פעם אחת.
- כלל חדש נותן 10 נקודות, לכל היותר פעם ביום.
- DATA.md מתעד את `decisionRules`, את השדות החדשים ואת חוקי הנקודות.
- כל המסכים החדשים נראים טוב ב-DARK, BRIGHT ובכל ה-RANDOM, ברוחב 390.

## שאלות פתוחות
- אין.
