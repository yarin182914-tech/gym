# המראה ״זהב״ — בסיס עיצובי חדש + מסך היום
Milestone: M4c · Branch: feature/m4c-gold-look · Status: draft
Split by ירין on 2026-11-13: M4c builds the "בסיס לכל האפליקציה" part now, before the first screen (M0b) and with the new logo (M0a); the "מסך היום" part and the +points moment move to M4c2 (`feature/m4c2-gold-today`), after M10. The app's new name is ג׳יני (Jini).
Requested by ירין on 2026-11-12: "שיפור המראה הכללי של האפליקציה … אני רוצה שהאפליקציה תיראה מקצועית ברמה של תאגיד ענק כמו גוגל או מייקרוסופט."
Chosen look: **זהב** out of four proposals (צלול, דופק, זהב, קליל). Comparison page with live mockups and the research summary: https://claude.ai/artifact/3T8ahyJNqvUAsGSTZpcVdx

## למה (הבעיה)
האפליקציה עובדת, אבל המראה לא אחיד ולא ״מוצר גדול״: טקסט קטן (14), כרטיסים שנראים אותו דבר בלי היררכיה, ומסך היום לא מראה במבט אחד ״איפה אני עומד היום״. ירין רוצה מראה מקצועי שמושך לחזור, בלי לאבד את הזהות החמה של היום.

## מה זה עושה (במשפט אחד)
מלטש את השפה החמה של היום (זהב, Rubik, Oswald) לבסיס עיצובי אחיד לכל האפליקציה, ומעצב מחדש את מסך היום סביב כרטיס רמה בולט ושלוש טבעות של היום.

## איך זה נראה
**בסיס לכל האפליקציה** (משפיע על כל המסכים דרך הרכיבים המשותפים):
- טקסט גוף 16 (היום 14.4), סולם טקסט: 12 · 14 · 16 · 18 · 22 · 28 · 36.
- פינות: כרטיס 26, כפתור/שדה 16, גלולה מלאה. גובה כפתור מינימלי 44.
- עומק: בבהיר צל רך בגוון חום־זהב; בכהה זוהר זהב עדין ומשטח בהיר יותר במקום צל שחור.
- כפתור ראשי ו־+ צף: מילוי מדורג (זהב → אלמוג). ניווט תחתון: הלשונית הפעילה בצבע הפעולה עם קו קטן מתחת לאייקון.
- תנועה: רכה, 300–450 אלפיות, ״ease-out״. מכבדת ״הפחתת תנועה״ של האייפון.

**מסך היום** (מלמעלה למטה), כמו בהדגמה:
1. ברכה לפי שעה (״בוקר טוב, ירין״) ותאריך עברי־לועזי קצר, אייקון פרופיל משמאל.
2. כרטיס רמה בולט במילוי מדורג: שם הרמה, נקודות ״X / Y נק׳״ בספרות Oswald גדולות, פס התקדמות, ״עוד N נקודות לרמה הבאה״, תג רצף עם להבה. לחיצה פותחת את מסך ההתקדמות (כמו היום).
3. שלוש טבעות: אימון (בוצע היום / יעד שבועי), תזונה (קלוריות מול יעד), שינה (שעות מול יעד). צבע קבוע לכל תחום בכל מסך. לחיצה פותחת את הלשונית שלו.
4. כרטיס ״הדבר הבא״ (כמו היום), ואז משימות, הרגלים, להיגמל וכרטיס השינה, בעיצוב החדש.
- מצבים: טעינה (שלד אפור באותו גודל), ריק (טבעת ריקה אפורה + ״עוד לא נרשם היום״), אופליין (כמו היום, מהמטמון), יום שהוחמץ = אפור מקווקו, אף פעם לא אדום.
- 390px, RTL, בכל הערכות: DARK, BRIGHT וחמש האקראיות (כלל 12).

**רגע נקודות** (רק המראה; מתי ושווה כמה נשאר ב־M4b): ברק זהב עובר על כרטיס הרמה, תג ״+10״ זוהר עולה ונעלם, הפס מתמלא, המספר רץ. פחות משנייה וחצי.

## זרימה
פותחים את האפליקציה → מסך היום מצויר מהמטמון → הטבעות והרמה מתעדכנות מהנתונים → מסמנים הרגל/משימה → רגע הנקודות על כרטיס הרמה (אם הסימון נותן נקודות) → הטבעה המתאימה מתמלאת.

## חוקים ומספרים
- אין מספרים חדשים של משחק. יעדי הטבעות נלקחים ממה שכבר קיים: יעד קלוריות, יעד שינה, ויעד אימונים שבועי (`user.weeklyWorkoutGoal ?? REWARDS.weeklyWorkoutGoal`, כבר בשימוש ב־`js/pages/library.js`).
- משכי האנימציה הם עיצוב, לא חוקי משחק: טוקנים ב־`css/01-tokens.css` (`--motion-fast/-base/-slow`, `--ease-out`).

## Data (Firestore)
None. The rings and the level card read data that already exists (workouts, meals/daily nutrition, sleep, pointsLedger-derived level). No new paths or fields; DATA.md unchanged.

## Technical notes
- `css/01-tokens.css`: retune `:root` (DARK) and `bright` to the gold look; new tokens defined in **every** theme block (DARK, BRIGHT, synthwave, acid-sunset, pop-art, acid-jungle, groove70):
  `--surface-2`, `--accent-2-fill` (gradient end), `--ring-train`, `--ring-food`, `--ring-sleep`, `--reward`, `--reward-text`, `--reward-glow`, `--missed`, `--shine`, `--elev-1`, `--elev-2`, plus motion tokens (theme-independent, in `:root`). Values per theme are in the comparison page's source (`LOOKS.gold` and `RANDOM`).
- Type scale tokens move to the new ramp; `--radius-*` and `--control-h` updated; body font-size 1rem.
- `css/03-components.css`: cards, buttons (primary gradient), FAB, bottom nav active state, chips, rings, level card, missed state. No hard-coded colours.
- `js/pages/today.js`: new header (greeting), level hero, rings row; existing sections keep their logic. Ring maths as a pure helper in `js/lib/` (e.g. `today-rings.js`: inputs → `{ train, food, sleep }` fractions + labels) with `tools/test-today-rings.mjs`.
- `js/ui/reward-moments.js`: add the gold shine + glow toast as the visual for the existing +points moment; trigger logic untouched (M4b).
- `index.html`: static nav markup follows the new active style; fonts stay Rubik + Oswald.
- `prefers-reduced-motion`: all new animations off.

## Server / outside the app
None. `firestore.rules` unchanged.

## לא בגרסה הזאת
- ליטוש מסך־מסך של אימון, תזונה, שינה, משימות, החלטות, התקדמות (מקבלים את הבסיס אוטומטית; ליטוש בשלב הבא, M4d).
- שינוי חוקי נקודות, רמות או מתי רגע נקודות מופעל (M4b).
- ערכות צבע חדשות או גופן חדש.

## הגדרת "גמור"
- מסך היום בנוי כמו בהדגמה: ברכה, כרטיס רמה מדורג עם רצף, שלוש טבעות, ואז שאר הכרטיסים.
- הטבעות מראות נתונים אמיתיים של היום, גם אופליין; בלי נתונים — טבעת אפורה ריקה.
- סימון שנותן נקודות מראה את הברק והתג על כרטיס הרמה; עם ״הפחתת תנועה״ — בלי אנימציה.
- טקסט גוף 16 בכל האפליקציה, ואף מסך לא נשבר ב־390px (בדיקה מהירה של כל הלשוניות).
- כל זה קריא ונכון בצבעים ב־DARK, BRIGHT ובכל חמש האקראיות; אין אדום להחמצה.
- `tools/check.sh` ו־`tools/test-*.mjs` עוברים, כולל בדיקה לחישוב הטבעות.

## שאלות פתוחות
אין. סדר הטבעות (אימון · תזונה · שינה) אושר ע״י ירין 2026-11-12.
