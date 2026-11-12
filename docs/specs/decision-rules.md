# להחליט — כללים אישיים
Milestone: M6d · Branch: feature/m6d-decision-rules · Status: dropped (ירין 2026-11-12: "לא נראה לי שהוא יהיה שימושי עבורי")
Requested by ירין on 2026-11-12 (split out of M6c). Needs M6c merged. A first build waits on the local branch `wip/m6c-all`.

## למה (הבעיה)
אותה התלבטות חוזרת (איזו מסעדה, לקנות או לא) נפתחת כל פעם מאפס ושורפת זמן.

## מה זה עושה (במשפט אחד)
החלטה שחוזרת הופכת לכלל ("מסעדה: הראשונה שנראית טובה"), ובפעם הבאה שהשאלה מכילה מילת מפתח שלו — לחיצה אחת וזה סגור.

## איך זה נראה
- **התאמה:** אחרי "המשך" בשאלה חדשה, אם יש כלל שאחת ממילות המפתח שלו מופיעה בשאלה (גם אחרי אות קידומת:
  ה ו ב ל מ ש כ), מופיע כרטיס "יש לך כלל לזה: מסעדה: הראשונה שנראית טובה" עם "להשתמש בכלל" / "לא הפעם".
- **יצירה:** אחרי "החלטתי" (קטנה / בינונית / גדולה) החלון לא נסגר מיד: "החלטת: X" וכרטיס "זה חוזר על עצמו? להפוך לכלל"
  עם טופס מוכן (שם, מה עושים = הבחירה, מילות מפתח מהשאלה). "סיום" סוגר.
- **"הכללים שלי"** בלשונית "להחליט": רשימה (שם, הכלל, מילות מפתח, כמה פעמים שימש), הוספה, עריכה, מחיקה עם אישור.
- 390px, RTL, כל ערכות הצבעים, בלי אינטרנט.

## חוקים ומספרים
In `js/lib/rules.js` → `DECISIONS`:
- `ruleUse: 3` — on top of the decision's own points (a rule-closed decision counts as small, on time: 5, no not-reopened bonus).
- **Daily cap (ירין 2026-11-12):** `ruleUsePerDay: 3` — only the first 3 rule-closed decisions of a day earn anything
  (5 + 3 each); later ones that day are recorded but earn 0. `ruleNewPerDay: 1` — only the first new rule of a day earns +10.
  So rules can give at most 3 × 8 + 10 = 34 points a day.
- `maxKeywords: 6`, `suggestKeywords: 3`.

## Data (Firestore)
New — `users/{uid}/decisionRules/{auto}` (app writes): `name` · `rule` · `keywords` string[] (1–6, normalized) ·
`fromDecisionId` | null · `createdAt`, `updatedAt`. Uses are derived from decisions with its `ruleId`.
Changed — decisions: `method` adds `rule`; new `ruleId` | null.
Ledger: `decision-rule` (+3, ref decision), `decision-rule-new` (+10, ref rule), source `decision`.
No `firestore.rules` change: `users/{uid}/{document=**}` covers `decisionRules`.

## לא בגרסה הזאת
קלוד שמציע כללים; כלל עם תנאי (למשל "מתחת ל-200 ₪").

## הגדרת "גמור"
- בדיקות אוטומטיות: התאמה (מילה, קידומת אחת/שתיים, ניקוד, ביטוי), התקרה היומית (4 שימושים ביום → רק 3 מקבלים), כלל שני באותו יום → 0.
- DATA.md מתעד את `decisionRules`.

## בדיקת קבלה בגרסת הבדיקה (iPhone)
1. החלטה קטנה "איזו מסעדה הערב?" → החלטתי → "להפוך לכלל" → שומרים (מילות מפתח מוצעות: מסעדה). +10.
2. "החלטה" → "ובמסעדה של מחר?" → מופיע "יש לך כלל לזה" → "להשתמש בכלל" → נסגר ב"החלטתי" עם תג "לפי כלל", +8.
3. עוד 3 החלטות לפי כלל באותו יום → הרביעית לא מוסיפה נקודות.
4. כלל שני באותו יום → נשמר, בלי +10.
5. "הכללים שלי" → עריכה ומחיקה עובדות; ההחלטות שנסגרו בכלל נשארות.

## החלטות מוצר שקיבלתי בלי לשאול (אפשר לשנות)
- קידומות שנספרות: ה ו ב ל מ ש כ, עד שתיים; הכלל הוותיק מנצח כשיש כמה.
- מילים כמו "איזה / איפה / הערב" לא מוצעות כמילות מפתח.
- החלטה לפי כלל נחשבת קטנה ובזמן (5), בלי בונוס "בלי לחזור לשקול".
- התקרות: 3 שימושים ביום, כלל חדש אחד ביום.

## שאלות פתוחות
- אין.

## הערה לבנייה
- `confirmDialog` (מחיקת כלל) נפתח מתוך חלון תחתון, ושכבת ה-modal שלו (z-index 100) נמצאת מתחת לחלון (200).
  להשתמש ב-`modal-overlay--top` (נוסף ב-M6c) או לפתוח אותו אחרי סגירת החלון.
