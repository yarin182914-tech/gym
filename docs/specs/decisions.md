# להחליט — החלטות קטנות ובינוניות
Milestone: M6b · Branch: feature/m6b-decisions · Status: draft
Requested by ירין on 2026-11-12: "בוא נתחיל ב6-9 - כל שלב בצורה מסודרת" (M6b from the roadmap; plan: "קבלת החלטות: "להחליט"").

## למה (הבעיה)
התלבטות שורפת זמן, על דברים קטנים וגדולים. התגמול הוא על החלטה בזמן, לא על החלטה "נכונה".

## מה זה עושה (במשפט אחד)
לשונית "להחליט" שממיינת כל החלטה לקטנה או בינונית, נותנת לה תקציב זמן, עוזרת להחליט
(משחק כפות רגליים אקראי, או ניקוד לפי קריטריונים) ונותנת נקודות על החלטה בזמן.

## איך זה נראה
- **איפה:** לשונית רביעית "להחליט" בדף משימות (ליד היום / מטריצה / הכול). "החלטה" בכפתור ה־+.
  ההחלטה הפתוחה הקרובה מופיעה בשורה אחת ב"היום".
  (בדקנו: אפליקציות מובילות מחזיקות "דברים פתוחים" במקום אחד עם נקודת רישום אחת, ולא בעוד לשונית בתפריט.)
- **הלשונית:** "פתוחות" (עם סולם הדחיינות) ו"החלטתי" (היומן, לקריאה בלבד). כשהיא ריקה: הסבר קצר וכפתור "החלטה חדשה".
- **ההחלטה נפתחת בחלון תחתון:** שאלה → שתי שאלות מיון → המסלול → סיום.
- **קטנה:** טיימר גלוי של 2 דקות, ומשחק כפות רגליים. ברירת המחדל 2 רגליים, "+ הוספת אפשרות" עד 4.
  על כל רגל כתובה אפשרות. "להגריל": הרגליים מתופפות באצבעות, יותר ויותר מהר, יש רגע של שקט, ואז הבוהן של הרגל
  שנבחרה מזדקרת למעלה (כמו לייק) עם דינג וקונפטי. השאר מאפירות. אחר כך: "איך הרגשת כשזה יצא?".
  אפשר גם לבחור ביד בכל רגע.
- **בינונית:** 2–4 אפשרויות, עד 3 קריטריונים עם משקל (1–3), ציון 1–5 לכל אפשרות בכל קריטריון, סף "מספיק טוב",
  שאלת 10-10-10, והצעה מחושבת. "החלטתי" עם נימוק והרגשה.
- 390px, RTL, בהיר וכהה. בלי אדום: מה שלא נבחר הופך אפור.
- בלי אינטרנט: הכול עובד מהמטמון המקומי.

## זרימה
1. + → החלטה (או "החלטה חדשה" בלשונית) → כותבים את השאלה.
2. "אפשר לחזור מזה?" (כן / לא) · "כמה זה ישנה בעוד שנה?" (כמעט כלום / קצת / הרבה) → מוצע מסלול, ואפשר להחליף.
   "גדולה" רצה כבינונית עם ההערה "מסלול גדול מגיע בקרוב".
3. ההתחלה (`startedAt`) נשמרת כשנכנסים למסלול. הטיימר רץ מאז.
4. קטנה: כותבים אפשרויות → להגריל (או לבחור ביד) → הרגשה → נשמר כ"החלטתי".
   בינונית: אפשרויות → קריטריונים → ציונים → הצעה → בוחרים → נימוק והרגשה → נשמר.
5. אפשר לסגור באמצע: ההחלטה נשארת פתוחה ברשימה וממשיכים ממנה אחר כך.
6. החלטה שהוחלטה ונפתחה מחדש (להגריל שוב / לשנות) מאבדת את בונוס "בלי לחזור לשקול".

## חוקים ומספרים
All of these live in `js/lib/rules.js` → `DECISIONS`:
- Budgets: small 120 s; medium 600 s **or** by the end of the next day (Israel time), whichever is later.
- Points: small 5 on time / 2 late; medium 15 / 5; not reopened +5.
- Badges "מחליט בזמן": 5, 20 and 50 on-time decisions in a row (by `decidedAt`).
- Ladder: open without `decideBy` for 7 days → "לקבוע תאריך החלטה"; 14 days → "מה חסר כדי להחליט?"
  (מידע / שיחה עם מישהו / אומץ).
- Options 2–4; criteria up to 3; weight 1–3; score 1–5; good-enough default 3.5 (weighted average).
- Game timing: drum ~2.4 s, a 0.5 s pause, the toe rises in 0.6 s.
- No points for "being right", nothing ever taken away.

## Data (Firestore)
`users/{uid}/decisions/{auto}`, written by the app (the coach may write `source: 'coach'` later):
`question`, `track` small|medium, `triage` { reversible: bool|null, impact: low|some|high|null },
`options` [{ id, text, scores: { [criterionId]: 1–5 } }], `criteria` [{ id, name, weight }], `goodEnough`,
`tenTenTen`, `budgetSec`, `startedAt`, `decideBy` (local noon, optional), `decidedAt`, `choiceId`,
`method` manual|feet|score, `reopened` bool, `reason`, `feeling` happy|unsure|disappointed|null,
`stuckReason` info|talk|courage|null, `status` open|decided|dropped, `source` manual|quick|coach,
`createdAt`, `updatedAt`. Missing fields read as defaults (`normalizeDecision`).
Ledger rules: `decision` (grade `on-time` | `late`) and `decision-first`, source `decision`.
No `firestore.rules` change: the `users/{uid}/{document=**}` rule already covers it.

## Server / outside the app
None.

## לא בגרסה הזאת
מסלול גדול (WRAP, premortem, ניסוי קטן), כללים אישיים (`decisionRules`), בדיקה אחרי חודש / שלושה חודשים,
תאריך החלטה ביומן (צריך את M7), גרפיקה של ירין למשחק (אפשר להחליף ב־`js/ui/choosers/feet-art.js`). כל אלה ב־M6c.

## הגדרת "גמור"
- החלטה קטנה מההתחלה ועד הסוף במצב טיסה, בתוך 2 דקות, נותנת 5 נקודות + 5 בונוס.
- החלטה בינונית שהוחלטה ב־23:59 של מחר בזמן ישראל נחשבת בזמן, ובחצות כבר לא (בדיקה אוטומטית).
- ההגרלה אחידה: בבדיקה עם זרע קבוע כל רגל יוצאת בערך באותה תדירות.
- חמש החלטות ברצף בזמן נותנות את התג.
- DATA.md מתעד את האוסף ואת חוקי הנקודות.

## שאלות פתוחות
- הגרפיקה של כפות הרגליים: ירין ישלח עיצוב משלו בהמשך.
