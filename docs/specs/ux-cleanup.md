# ניקוי UX/UI — רגוע יותר, פחות עמוס
Milestone: M14a + M14b · Branches: feature/m14a-today-tasks, feature/m14b-screens · Status: M14a built and merged (PR #43, 2026-11-14) · M14b built (PR open, 2026-11-14)
Requested by ירין on 2026-11-12: סקירה של Claude מצאה שה־UX/UI "לא מספיק טוב ויותר מדי עמוס".
Draft written on 2026-11-14 from a walk through every screen at 390px with the `?dev` sample data, and measured again the same day after M4c and M4c2 (the "זהב" look, `docs/specs/gold-look.md`) were merged.
Split by ירין on 2026-11-14 into two PRs: **M14a** is היום, משימות and the + button; **M14b** is תזונה, שינה, התקדמות, היסטוריה and חיבורים. The section "M14a — מה נכנס ל-PR הראשון" is what the first PR built. The section "M14b — ה-PR השני" is what the second PR builds, after its own `/feature` run settled the open questions.

## למה (הבעיה)
בכל מסך יש יותר מדי דברים באותו משקל: כרטיסים שנראים אותו דבר, פעולה ראשית שמסתתרת מתחת לקפל, ורשימות ארוכות של דברים ריקים. משתמש חדש נוחת על מסך עמוס בלי לדעת מה לעשות קודם.

אורך המסכים היום (טלפון, נתוני הדוגמה, אחרי "זהב"): היום 2 מסכים, משימות 1.5, תזונה 2.1, התקדמות 2.3, שינה 3, חיבורים 3.

## מה זה עושה (במשפט אחד)
בכל מסך רואים קודם את הפעולה הראשית שלו, וכל השאר מתקצר, מתקפל או עובר ל"עוד".

## מה ירין החליט (2026-11-14)
1. שני PRs: קודם היום ומשימות, אחר כך שאר המסכים.
2. היום: בלי כרטיס שינה. טבעת השינה מראה את הלילה, ו"לרשום את הלילה" פותח חלונית עם שני השעונים.
3. משימות: "הכי נקי". על משימה רואים רק שם, מועד ונקודה לחשובה. גם "מחר" עובר לתוך המשימה.
4. משימות: כפתור ההוספה שבראש המסך יורד, ומוסיפים מכפתור ה־+.
5. כפתור ה־+ (בקשה חדשה): "בכל מסך יהיה למעלה את הפיצ'ר הרלוונטי אליו בשורה רחבה ראשית".

## M14a — מה נכנס ל-PR הראשון

מה נמדד אחרי הבנייה (390×844, נתוני הדוגמה, DARK): היום ירד מ־1.92 מסכים ל־1.49, ומשימות מ־1.42 ל־1.24. צילומי לפני ואחרי: `docs/screenshots/m14a/`.

### היום
הסדר: כרטיס הרמה → שלוש הטבעות → אתמול (שורה אחת) → הדבר הבא → משימות להיום → הרגלים → להיגמל. כרטיס השינה יורד מהמסך.

- **שינה.** "לרשום את הלילה" (כרטיס "הדבר הבא") פותח חלונית עם שני השעונים, כמו החלונית של לילה במסך שינה. אחרי שמירה טבעת השינה מתמלאת וכרטיס "הדבר הבא" עובר לדבר הבא. עריכה של לילה, רצועת השבוע והגדרות השינה: בלשונית שינה (לחיצה על הטבעת).
- **אתמול.** שורה אחת: "אתמול · ‎+140 נק׳" (ביום מושלם: "יום מושלם אתמול"). לחיצה פותחת את פירוט הנקודות באותו כרטיס, וה־× סוגר אותו עד מחר, כמו היום.
- **הרגלים.** בכותרת: "הרגלים", המונה (3/5) וכפתור שקט "יום אחר". רצועת הימים נפתחת רק ממנו, ונסגרת כשחוזרים ל"היום".
- **לא היום ומושהים.** שורה סגורה אחת, "עוד 3 הרגלים · לא היום ומושהים", שנפתחת בלחיצה.
- **הרגל חדש.** מכפתור ה־+ (ראו למטה); הכפתור "+ הרגל" שבכותרת ירד. בלי הרגלים בכלל: כפתור ראשי "הרגל ראשון" בתוך המצב הריק.
- **שורת ההסבר** "לחיצה לסימון · לחיצה ארוכה מבטלת" מופיעה רק למי שסימן הרגלים בפחות מ־7 ימים.
- **מספרים בעברית.** "יום אחד" ולא "1 ימים", "הרגל אחד" ולא "1 הרגלים".

מצבים: טעינה כמו היום. בלי חיבור: הכול עובד, כולל רישום הלילה. שמירה שנכשלה: ההודעה הקיימת "השמירה נכשלה — נסה שוב".

### משימות
- **ראש המסך.** המתג "משימות | החלטות" נשאר. מתחתיו שורת תצוגות קטנה ושקטה (היום · מטריצה · הכול, או פתוחות · החלטתי). כפתור "+ משימה" / "+ החלטה" יורד: מוסיפים מכפתור ה־+, שפותח שורה אחת לתיבה, ו"עוד פרטים" פותח את הטופס המלא. במצב ריק נשאר כפתור ראשי אחד בתוך הכרטיס הריק.
- **שורת משימה.** תיבת הסימון, השם, שורת המועד ונקודה צבעונית לחשובה. בלי תגיות, בלי "צעד ראשון" ובלי כפתור "מחר". "בתיבה" ו"מחכה שבוע" נכתבים בשורת המועד.
- **בתוך המשימה.** כפתור "מחר" (למשימה של היום או שעבר זמנה; נספר כדחייה, כמו היום, ושומר גם שינויים אחרים שנעשו בטופס), ושורה שקטה "ביומן גוגל" כשיש לה אירוע. גודל, דחופה, מי וצעד ראשון כבר נמצאים שם.
- **סולם הדחיינות** ("למה היא תקועה?", ההחלטה אחרי שלושה שבועות) נשאר כמו שהוא.
- **"הכול".** שתי שורות הסינון (תחום, מי) נפתחות מכפתור "סינון", שמראה מה נבחר.
- **החלטות.** אותה שפה: השאלה, ומתחתיה שורה שקטה אחת במקום תגיות ("בינונית · להחליט עד מחר"). ביומן: השאלה, מה נבחר, ושורה אחת (תאריך · בזמן · איך יצא). הנימוק נשאר בפתיחת ההחלטה; "למדתי" נשאר על השורה, כי אין לו מקום אחר.
- **משימות להיום במסך היום.** אותה נקודה לחשובה.

### כפתור ה־+
החלונית נפתחת עם הפעולה של המסך הנוכחי בשורה רחבה וראשית למעלה, ושאר הפעולות ברשת מתחתיה.

| המסך | השורה הראשית |
|---|---|
| היום | הרגל חדש |
| משימות | משימה |
| משימות, בחלק של החלטות | החלטה |
| אימון, היסטוריה, התקדמות האימונים | אימון |
| תזונה | ארוחה |
| שינה | שינה |
| שאר המסכים (התקדמות, חיבורים, ללמוד, משוב) | אין; הרשת כמו היום |

"הרגל" מהמסכים האחרים ממשיך להביא לרשימת ההרגלים של היום, לסימון.

## M14b — ה-PR השני
שאר המסכים. 390px, RTL, בכל הערכות. מה שנמצא בטיוטה, ומה נבנה אחרי התשובות של ירין (2026-11-14, למטה).

### תזונה (2.1 מסכים לפני)
נמצא: כרטיס השקילה ראשון, ואחריו ניווט תאריך, טבעת הקלוריות, שלושה פסי מאקרו ו"נכנס מול יוצא". "הוספת ארוחה", הפעולה הראשית, רק אחרי גלילה.

הסדר החדש:
1. שקילת הבוקר, רק עד ששוקלים היום (הכרטיס עם המספר ו"שמירה", כמו היום).
2. ניווט התאריך.
3. טבעת הקלוריות, ומתחתיה שורת חלבון אחת וכפתור "יעדים".
4. "הוספת ארוחה".
5. הארוחות של היום.
6. "עוד על היום": פחמימות ושומן, ו"נכנס מול יוצא".
7. אחרי ששוקלים: שורת השקילה ("משקל בוקר 82.4 · ‎−0.3 מאתמול · עריכה"), ליד גרף המשקל.
8. המגמות (תזונה, משקל).

"שקילה" מכפתור ה־+ מביא לכרטיס השקילה איפה שהוא, כמו היום.

### שינה (3 מסכים לפני)
נמצא: רשימה של 30 לילות, רובם שורות ריקות עם "לרשום".

- כרטיס השינה (הלילה והשבוע) נשאר ראשון.
- מתחתיו 7 הלילות האחרונים, עם "5 מתוך 7 נרשמו · ממוצע 7:10".
- "עוד לילות" פותח את כל 30 הלילות, והשורה שמעל מתעדכנת ל־30.
- גרפי המגמה יורדים מתחת לרשימה.

### התקדמות, "סיכום" (2.3 מסכים לפני)
נמצא: כל 7 הרמות פרוסות, 6 שורות רצף ו־21 תגים ברשימה אחת.

- **רמות.** הרמה הנוכחית והבאה בלבד. שורה סגורה "כל הרמות" פותחת את כל הדרך. "הפרס שלי" נשאר.
- **רצפים.** רק רצפים פעילים. רצף של 0 יורד לשורה סגורה "עוד 3 רצפים". בלי רצף פעיל בכלל: "עוד אין רצף פעיל. הוא מתחיל מהסימון הבא."
- **תגים.** בכל תחום: מה שהושג והתג הבא (באפור), כולם במדף אחד לפי סדר התחומים. שורה סגורה "כל התגים" פותחת את כל ה־21, מחולקים לתחומים. המונה (3/21) נשאר בכותרת.

לשונית "מעקב" לא משתנה.

### היסטוריה (אימון)
נמצא: שתי שורות מתגים ולוח שנה שלם לפני האימון האחרון.

- הרשימה ראשונה. ליד המתג "אימונים | משקל" כפתור שקט "לוח שנה", שפותח וסוגר את הלוח מעל הרשימה.
- לחיצה על יום בלוח עדיין קופצת לאימון שלו.

### חיבורים (3 מסכים לפני)
נמצא: ההוראות המלאות של כל חיבור פתוחות תמיד, גם כשהוא כבר מחובר.

כל חיבור (צעדים מהאייפון, קלוד, יומן גוגל, זמן באפליקציות) הוא שורה סגורה:
- **מחובר:** השם ושורת מצב אחת ("מחובר · עודכן היום ב־08:10"). לחיצה פותחת את ההסבר, הפעולות וההוראות.
- **לא מחובר:** השם, משפט אחד, וכפתור "לחבר" שפותח את אותו דבר.
- מה שדורש תשומת לב נשאר גלוי גם כשהשורה סגורה: "לא הגיעו צעדים כבר יומיים", "החיבור ליומן פג".
- מפתח או כתובת שנוצרו עכשיו נשארים פתוחים עד שיוצאים מהמסך.
- המתג של שפת האייפון מופיע בתוך כל חיבור שיש בו הוראות לאייפון.
- "בקרוב" נשאר בתחתית.

### בכל המסכים
- מספרים בעברית גם כאן ("לילה אחד", "שבוע אחד", "תרגיל אחד"), עם אותו כלי מ־M14a.
- כבר טופל ב־M4c: טקסט 16, כפתורים בגובה 44, ובורר הערכות יצא מהסרגל העליון.

### נתוני הדוגמה (`?dev`)
הרגל שלא להיום, הרגל מושהה ונקודות של אתמול, כדי ששורת "עוד" ושורת "אתמול" של M14a ייראו בארגז החול.

### מה ירין החליט ל-M14b (2026-11-14)
1. תגים: מה שהושג והבא בכל תחום, ו"כל התגים" פותח את השאר.
2. רצפים: רק פעילים; רצפים של 0 בשורה סגורה.
3. שקילה: למעלה עד ששוקלים, ואחר כך שורה אחת מתחת לארוחות.
4. חיבור שעוד לא חובר: סגור, עם כפתור "לחבר".

## זרימה
אין זרימה חדשה. כל פעולה שקיימת היום נשארת, לכל היותר לחיצה אחת רחוק יותר.
- לרשום את הלילה: היום → "לרשום את הלילה" → שני שעונים → שמירה.
- לדחות משימה למחר: לחיצה על המשימה → "מחר".
- משימה חדשה: + → "משימה" (השורה הרחבה במסך המשימות).

## חוקים ומספרים
ב־`js/lib/rules.js`:
- M14a: `TODAY.hintMarkedDays` = 7 (שורת ההסבר של ההרגלים נעלמת אחרי 7 ימים עם סימון).
- M14b: `SLEEP.logNights` = 7 (כמה לילות לפני "עוד לילות"), `REWARDS.roadLevelsShown` = 2 (הרמה הנוכחית והבאה, לפני "כל הרמות").

אין שינוי בנקודות, ברמות או ברצפים.

## Data (Firestore)
None. The cleanup changes what is shown, not what is saved. The habits hint is derived from the loaded `habitLogs` (days with at least one mark), so no flag is stored. `docs/DATA.md` is unchanged.

## Server / outside the app
None. `firestore.rules` unchanged, no env vars.

## Technical notes (M14a)
- `js/ui/night-sheet.js` (new): the night sheet moves out of `js/ui/sleep-card.js`, so Today can open it without the card. The sleep card keeps using it.
- `js/lib/plural.js` (new, pure): Hebrew counts, 1 → "יום אחד". Test: `tools/test-plural.mjs`.
- `js/lib/quick-actions.js` (new, pure): the + sheet's items and `sheetItems(route, override)` → the wide first row and the grid. A screen may name its own first action (`handleQuickActions(route, fn, { primary })`), which is how משימות switches to "החלטה". The handler also learns whether the action was asked for on its own screen (`{ here }`), which is how "הרגל" opens the wizard on Today and the list from elsewhere. Test: `tools/test-quick-actions.mjs`.
- `js/lib/tasks.js`: `rowLine(t, today)`, the one line under a task's name (time, "בתיבה", "מחכה שבוע"), and `canPostpone(t, today)`, when the form offers "מחר". "מחר" sets the form's day to tomorrow and saves, so the existing save counts the move. Tests added to `tools/test-tasks.mjs`.
- `js/ui/day-summary-card.js` takes `{ open }`; the screen keeps that state for the visit.
- Colours only from tokens (hard rule 12). No new token was needed. Checked in all seven themes: every new text is at a contrast of 4.9 or more against its background.
- Today's sections sit 12px apart instead of 16px, to reach a screen and a half with the sample data.
- The service worker's cache name is bumped to v9.
- Not in the `?dev` sample data: a habit that isn't for today, a paused one, and yesterday's points. The "עוד" row and the "אתמול" line were checked by adding them in the test run. (M14b added them to the sample data.)

## Technical notes (M14b)
- `js/lib/summary-view.js` (new, pure): what the progress summary shows before anything is opened. `roadLevels(levels, current, count)`, `splitStreaks(streaks)`, `badgeShelves(badges)`. Test: `tools/test-summary-view.mjs`.
- `js/ui/progress-summary.js`: three closed rows ("כל הרמות", "עוד N רצפים", "כל התגים"); what is open lives in the mounted card and is forgotten when the screen is left. Closed, the badges are one shelf (per area: earned, then the next one); open, they are grouped by area as before.
- `js/pages/nutrition.js`: the weigh-in card (`js/ui/body-weight-card.js`, unchanged) is attached at the top until today's weight is in, and by the weight chart after. Saving today's weight re-renders the screen and shows a "המשקל נשמר" toast, because the card leaves the top. The ring card carries the protein bar; carbs, fat and "נכנס מול יוצא" render only while "עוד על היום" is open. The + button's "צעדים" still opens the activity sheet directly.
- `js/pages/sleep.js`: the list shows `SLEEP.logNights` nights and "עוד לילות" / "פחות לילות" switches to `SLEEP.historyNights`. The trend section now comes after the list.
- `js/pages/history.js`: the month calendar is built only while the "לוח שנה" chip is open (`mountCalendar()`); `renderCalendar()` returns when it is closed, so expanding a workout still records the selected day for the next time the calendar opens.
- `js/ui/connection-fold.js` (new): `foldHead(...)`, the top row every connection card shares (status line and a chevron, or one sentence and "לחבר"), and the iPhone language switch (`iosLangSwitch`, `syncIosLangSwitches`). `js/pages/connections.js` keeps which of its cards are open (`openCards`) and handles the language switch for the whole page; `js/ui/usage-card.js` keeps its own open state. A card's body is rendered only while it is open. Coming back from Google's consent screen opens the calendar card. "Connected" for the closed row: steps = an import arrived, Claude = at least one key, calendar = connected, app time = a key exists or minutes arrived today.
- Hebrew counts through `countHe`: streak units on the progress screen, the sleep card's streak label, meals in "נכנס מול יוצא", exercises, sets and activities in History.
- Colours only from tokens (hard rule 12); no new token. The "לחבר" pill uses the primary button's gradient and `--gold-text`. Checked at 390px in all seven themes, closed and open, with no console errors.
- The service worker's cache name is bumped to v10.
- `js/dev/seed.js`: the three example habits, one that isn't for today, one paused, yesterday's marks, and `rewardsStartDate` = yesterday, so a fresh `?dev` sandbox shows Today's "עוד 2 הרגלים" row and "אתמול" line.

## לא בגרסה הזאת
- פיצ׳רים חדשים.
- מתגים לכיבוי תחומים ומצב מינימום (M10).
- ליטוש עיצובי מסך־מסך ודף המשוב (M15).
- פיצול הקובץ של מסך האימון (M3f).
- M14a: המסכים של M14b.

## הגדרת "גמור"
**M14a**
- מסך "היום" עם נתוני הדוגמה נכנס במסך וחצי לכל היותר ב־390px.
- "לרשום את הלילה" פותח את החלונית, ואחרי שמירה טבעת השינה מתמלאת. גם בלי חיבור.
- "אתמול" הוא שורה אחת שנפתחת ונסגרת.
- יום אחר, הרגלים של "לא היום" ומושהים: עדיין אפשר להגיע לכולם, ולחיצה ארוכה עדיין מבטלת סימון.
- במשימות: בלי כפתור הוספה למעלה, המשימה הראשונה נראית בלי לגלול, ועל שורה יש רק שם, מועד ונקודה.
- "מחר" מתוך המשימה מעביר אותה למחר ונספר כדחייה.
- כפתור ה־+ מראה בכל מסך את הפעולה שלו בשורה רחבה, לפי הטבלה.
- כל פעולה שהייתה אפשרית לפני הניקוי עדיין אפשרית.
- בכל הערכות (DARK, BRIGHT וחמש האקראיות), בלי שגיאות בקונסול, ו־ירין מאשר צילומי לפני ואחרי.

**M14b**
- תזונה: "הוספת ארוחה" נראית בלי לגלול, גם בבוקר לפני השקילה. אחרי שמירת שקילה היא הופכת לשורה אחת מתחת לארוחות.
- שינה: 7 לילות, ו"עוד לילות" מראה 30. לחיצה על לילה עדיין פותחת אותו לרישום או לתיקון.
- התקדמות: שתי רמות, רצפים פעילים, ובכל תחום התגים שהושגו והבא. "כל הרמות", "עוד רצפים" ו"כל התגים" פותחים את השאר.
- היסטוריה: האימון האחרון נראה בלי לגלול, ו"לוח שנה" פותח את הלוח.
- חיבורים: כל הדף נכנס במסך אחד כשהכול סגור, וכל הוראה ופעולה עדיין במרחק לחיצה.
- נתוני הדוגמה מראים את שורת "עוד" ואת שורת "אתמול" במסך היום.
- כל פעולה שהייתה אפשרית לפני הניקוי עדיין אפשרית, בכל הערכות (DARK, BRIGHT וחמש האקראיות), בלי שגיאות בקונסול, ו־ירין מאשר צילומי לפני ואחרי.

## שאלות פתוחות
- M14a: אין.
- M14b: אין (ירין ענה ב־2026-11-14).
