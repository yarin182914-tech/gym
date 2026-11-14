# המראה ״זהב״ — בסיס עיצובי חדש + מסך היום
Milestone: M4c (the base) · Branch: feature/m4c-gold-base · Status: built (2026-11-14)
Milestone: M4c2 (Today) · Branch: feature/m4c2-gold-today · Status: approved (ירין 2026-11-14)
Moved up by ירין on 2026-11-14, after seeing the base on the preview without the mockup's Today: "יכול להמשיך בעבודה על מסך היום החדש". M4c2 is now built right after the base and before the cleanup (M14), not after M10. What this PR holds is the section "M4c2 — מה נכנס ל-PR של מסך היום" below.
Split by ירין on 2026-11-13: M4c builds the "בסיס לכל האפליקציה" part now, inside M14 (the UX/UI cleanup), after the new logo (M0a) and before the first screen (M0b); the "מסך היום" part and the +points moment move to M4c2 (`feature/m4c2-gold-today`), after M10. The app's new name is ג׳יני (Jini).
Decided by ירין on 2026-11-14: the base is its own PR, before the cleanup (so the screens are tidied once, at the final sizes), and the colour theme switch moves from the top bar to the profile sheet in this PR. What this PR holds is the section "M4c — מה נכנס ל-PR של הבסיס" below.
Requested by ירין on 2026-11-12: "שיפור המראה הכללי של האפליקציה … אני רוצה שהאפליקציה תיראה מקצועית ברמה של תאגיד ענק כמו גוגל או מייקרוסופט."
Chosen look: **זהב** out of four proposals (צלול, דופק, זהב, קליל). Comparison page with live mockups and the research summary: https://claude.ai/artifact/3T8ahyJNqvUAsGSTZpcVdx

## למה (הבעיה)
האפליקציה עובדת, אבל המראה לא אחיד ולא ״מוצר גדול״: טקסט קטן (14), כרטיסים שנראים אותו דבר בלי היררכיה, ומסך היום לא מראה במבט אחד ״איפה אני עומד היום״. ירין רוצה מראה מקצועי שמושך לחזור, בלי לאבד את הזהות החמה של היום.

## מה זה עושה (במשפט אחד)
מלטש את השפה החמה של היום (זהב, Rubik, Oswald) לבסיס עיצובי אחיד לכל האפליקציה, ומעצב מחדש את מסך היום סביב כרטיס רמה בולט ושלוש טבעות של היום.

## M4c — מה נכנס ל-PR של הבסיס
כל המסכים מקבלים את המראה החדש דרך הרכיבים המשותפים. המבנה של המסכים לא משתנה (זה M14), ומסך היום לא נבנה מחדש (זה M4c2).
- **טקסט:** גוף 16 בכל מקום, וסולם אחד: 12 · 14 · 16 · 18 · 22 · 28 · 36.
- **לחיצה:** כפתורים ושדות בגובה 44. תגיות קטנות נשארות קטנות לעין, עם אזור לחיצה של 44.
- **צורה ועומק:** כרטיס בפינות 26, כפתור ושדה 16. בבהיר צל חם ורך, בכהה זוהר זהב עדין.
- **צבע:** DARK ו-BRIGHT מקבלים את צבעי "זהב" מההדגמה (זהב בהיר יותר בכהה, לבן נקי יותר בבהיר). חמש הערכות האקראיות שומרות על הצבעים שלהן ומקבלות את אותה צורה.
- **כפתור ראשי ו-+ צף:** מילוי מדורג, זהב → אלמוג.
- **ניווט תחתון:** הלשונית הפעילה בצבע הפעולה עם קו קטן מתחת לאייקון, בלי הגלולה שמאחוריו.
- **סרגל עליון:** שם המסך ואייקון הפרופיל בלבד. בורר הערכות (DARK / RANDOM / BRIGHT) עובר לתפריט הפרופיל, כשורה ראשונה "ערכת צבעים".
- **תנועה:** רכה, 150–450 אלפיות, ונכבית כשבאייפון מופעל "הפחתת תנועה".
- **מסך האימון:** טבלת הסטים נשארת צפופה יחסית, כדי שתרגיל של 4 סטים ייכנס במסך אחד.

## M4c2 — מה נכנס ל-PR של מסך היום
מסך "היום" נבנה מחדש מלמעלה, כמו בהדגמה. מה שמתחת (משימות, הרגלים, להיגמל, שינה) נשאר כמו שהוא ורק משנה מקום; הקיצור והקיפול שלו הם M14.
- **סדר המסך:** ברכה ותאריך בסרגל העליון → כרטיס רמה → שלוש טבעות → "סיכום אתמול" (רק כשיש) → "הדבר הבא" → משימות → הרגלים → להיגמל → כרטיס השינה.
- **ברכה:** לפי שעה: "בוקר טוב" (5–12), "צהריים טובים" (12–17), "ערב טוב" (17–22), "לילה טוב" (22–5), עם השם הפרטי מחשבון גוגל ("בוקר טוב, ירין"). בלי שם: רק הברכה. מתחתיה תאריך קצר: "יום שישי · 14 בנובמבר".
- **כרטיס רמה** במילוי זהב → אלמוג: "רמה 2 · בתנועה", הנקודות בספרות גדולות ("740 / 1,500 נק׳"), פס התקדמות, "עוד 760 נקודות לרמה 3", "היום +35", ותג רצף עם להבה. לחיצה פותחת את מסך ההתקדמות, כמו היום.
- **רצף:** ימים ברצף שבהם נצברו נקודות. מוצג מיומיים ומעלה. יום בלי נקודות לא מוצג כהפסד: התג פשוט לא מופיע.
- **שלוש טבעות**, כל אחת בצבע קבוע ופותחת את הלשונית שלה:
  - אימון: ימי אימון השבוע מתוך היעד השבועי ("2 / 3").
  - תזונה: קלוריות היום מתוך היעד של היום ("1,450 / 2,000").
  - שינה: שעות הלילה האחרון מתוך המינימום ("7:10 / 8:00").
  - מעל היעד: טבעת מלאה, באותו צבע. בלי נתון: טבעת אפורה ו"עוד לא נרשם".
- **רגע נקודות:** ברק עובר על כרטיס הרמה, תג "+10" זוהר עולה ונעלם, הפס מתמלא והמספר רץ. פחות משנייה וחצי; עם "הפחתת תנועה" רק המספר מתעדכן.
- **כשמצב המינימום (M10) ייבנה:** טבעת של תחום כבוי תוסתר. עד אז מוצגות שלוש.

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
- חדש ב־`js/lib/rules.js` (M4c2): שעות הברכה (5 · 12 · 17 · 22), וממתי מוצג תג הרצף (2 ימים).
- משכי האנימציה הם עיצוב, לא חוקי משחק: טוקנים ב־`css/01-tokens.css` (`--motion-fast/-base/-slow`, `--ease-out`).

## Data (Firestore)
None. The rings and the level card read data that already exists (workouts, meals/daily nutrition, sleep, pointsLedger-derived level). No new paths or fields; DATA.md unchanged.

## Technical notes — M4c (the base, as built)
- `css/01-tokens.css`, sizes (theme-independent, in `:root`):
  - Type ramp: `--text-xs` 0.75rem · `--text-sm` 0.875rem · `--text-base` 1rem · `--text-md` 1rem · `--text-lg` 1.125rem · `--text-xl` 1.375rem · `--text-2xl` 1.75rem · new `--text-3xl` 2.25rem (the number in a dial, e.g. the calorie ring).
  - `--radius-xs` 5px (new, inline code) · `--radius-sm` 10px · `--radius-md` 16px · `--radius-lg` 26px. `--control-h` 44px · `--switch-h` 40px · `--chip-h` 30px.
  - New motion tokens: `--motion-fast` 150ms · `--motion-base` 300ms · `--motion-slow` 450ms · `--ease-out`. Used by the nav line, press feedback, progress fills and the celebrations; the other transitions keep their own durations (nearly all between 100 and 500ms; the loading pulse, the skeleton shimmer and the +points float are longer).
- `css/01-tokens.css`, colours: `:root` (DARK) and `bright` take `LOOKS.gold.dark` / `.light` from the comparison page's source (bg, surface, raised surface, text, muted, line, accent, on-accent, soft, success). The five RANDOM blocks keep their colours. Values moved for contrast:
  - BRIGHT `--accent` is `#a2600f` (mockup `#b86f14`) and the gradient's end `#c24e36` (mockup `#c9533a`), so both reach 4.5:1 as text on the page and under a white label. BRIGHT `--success` stays `#2f7a4c` for the same reason.
  - DARK: text on a fill is dark now (`--gold-text`, `--accent-contrast` `#241503`), because the gold is a bright tone. `--rust`, `--accent-2` and `--purple` are lighter than before, so they read on the darker surfaces.
  - synthwave: the gradient's end is `#9a6bff`, so the white + still reads on it.
- New colour tokens, defined in **every** theme block (DARK, BRIGHT, synthwave, acid-sunset, pop-art, acid-jungle, groove70): `--accent-2-fill` (the gradient's end), `--elev-1` (under a card), `--elev-2` (under the primary button and the +). `--overlay` and `--shadow-*` are now set in every block too. The mockup's second surface is the existing `--surface-raised`, so no `--surface-2`; `--missed` waits for M4c2, where the empty rings use it.
- `css/03-components.css` and `css/02-base.css`: cards (radius 26, `--elev-1`), buttons (radius 16, 16px label, gradient primary), fields, the + button, the bottom nav's active state (a line under the icon, beside the row in the desktop sidebar), toggle groups (each segment rounds itself), the profile sheet's theme row. Every raw `font-size` and pill radius moved onto the tokens; the one exception is the level-up screen's 4.5rem number. The sets table keeps its fixed row heights.
- Touch targets ("Touch targets" in `03-components.css`): switches, chips and small round icon buttons keep their size and get an invisible `::after` up to 44px. Not covered: the controls inside a workout set row (weight, reps, ⋯), which stay compact on purpose, and the bare number input of the weigh-in card.
- `js/ui/app-bar.js`, `js/ui/theme-switch.js`: the switch leaves the bar and mounts as the first row of the profile sheet each time it opens; same `window.gymTheme` API, same toast for a RANDOM roll.
- `js/ui/toggle-group.js`: the sliding indicator is measured again whenever the group's size changes (a `ResizeObserver`). Before, a group patched before it was laid out kept a 0px indicator, which left the active option of the workout card's switches unreadable when a workout was reopened.
- `js/theme-boot.js` (`STATUS_BAR`), `index.html` (`theme-color`) and `manifest.json` (`background_color`, `theme_color`) follow the new DARK and BRIGHT backgrounds. `sw.js`: `CACHE_NAME` is `gym-site-v7`.
- New `tools/test-theme-tokens.mjs`: fails when a theme block is missing a colour token (hard rule 12), sets one `:root` doesn't know, or drops one of 19 text/background pairs under its minimum contrast (4.5:1 for text, 3:1 for icons and index numbers).
- `prefers-reduced-motion`: the global rule in `02-base.css` already turns every animation and transition off, the new ones included.
- Screenshots: `docs/screenshots/m4c/`.

## Technical notes — M4c2 (Today, this PR)
- Branch `feature/m4c2-gold-today`, cut from `feature/m4c-gold-base` while PR #41 is open; it merges after #41.
- New colour tokens in every theme block (values: `LOOKS.gold` and `RANDOM` in the comparison page): `--ring-train`, `--ring-food`, `--ring-sleep`, `--missed` (the empty ring's grey), `--reward`, `--reward-text`, `--reward-glow`, `--shine`. `tools/test-theme-tokens.mjs` gets the new pairs (each ring colour on a card at 3:1, `--reward-text` on `--reward` at 4.5:1).
- New `js/lib/today-rings.js` (pure, no DOM) with `tools/test-today-rings.mjs`:
  - `todayRings({ today, workouts, workoutGoal, meals, calorieTarget, night, sleepMinHours })` → `{ train, food, sleep }`, each `{ fraction 0–1, value, target, empty }`. The week is `weekStart()` from `js/lib/habits.js` (`HABITS.weekStartsOn`), the same week the weekly workout bonus counts. The calorie target is the day's own (the fixed target, or burn minus deficit once the burn is logged), the same rule the nutrition screen and the scoring use.
  - `pointsStreak(byDay, today)` → days in a row with points, ending today, or yesterday while today has none yet.
  - `greeting(hour)` → the greeting for the hour, from `TODAY.greetingHours` in `js/lib/rules.js`.
- `js/pages/today.js`: the top becomes the level hero and the rings row; the day summary and the next-step card follow; the sleep card moves under "להיגמל". Today also loads the recent nutrition entries (`listNutritionEntries`), for the food ring. Every existing section keeps its logic.
- `js/ui/app-bar.js`: on Today the title is the greeting, with the short date under it; the first name is the first word of `users/{uid}.displayName` when it is set, else of the signed-in Google account's name. No new field.
- `js/ui/reward-moments.js`: the +points moment's look only: the shine on the hero, the glowing "+N" tag, the number counting up. When and how much is untouched (M4b). `prefers-reduced-motion`: none of the three.
- `css/03-components.css`: the hero, the rings, the app bar's second line, the shine and the tag; the old `.today-level` / `.today-ring` rules go. Loading: a skeleton of the same height, so nothing jumps.
- `js/dev/seed.js`: sample meals, nights and workouts for this week, so the rings show something in the `?dev` sandbox.
- `sw.js`: `CACHE_NAME` bumped.
- Defaults chosen by Claude that ירין can change: what the streak counts (days with points), and the workout ring counting the week rather than the day.

## Server / outside the app
None. `firestore.rules` unchanged.

## לא בגרסה הזאת
- ליטוש מסך־מסך של אימון, תזונה, שינה, משימות, החלטות, התקדמות (מקבלים את הבסיס אוטומטית; הניקוי ב־M14 והליטוש ב־M15).
- שינוי במבנה של מסך כלשהו: מה מופיע, באיזה סדר ומה מתקפל (M14, `docs/specs/ux-cleanup.md`).
- שינוי חוקי נקודות, רמות או מתי רגע נקודות מופעל (M4b).
- ערכות צבע חדשות או גופן חדש.

## הגדרת "גמור" — M4c (הבסיס)
- טקסט גוף 16 בכל מסך, ואף מסך לא נשבר ב־390px (עוברים על כל הלשוניות והמסכים מתפריט הפרופיל).
- כפתורים ושדות בגובה 44; לתגיות קטנות יש אזור לחיצה של 44.
- כרטיסים בפינות 26, כפתור ראשי ו-+ במילוי מדורג, והלשונית הפעילה עם קו מתחת לאייקון.
- בסרגל העליון רק שם המסך ואייקון הפרופיל; מחליפים ערכה מתפריט הפרופיל, ו-RANDOM עדיין מגריל ערכה חדשה בכל לחיצה.
- הכול קריא ב־DARK, BRIGHT ובכל חמש האקראיות: טקסט גוף בניגודיות 4.5:1 לפחות, מה שהוחמץ אפור.
- עם "הפחתת תנועה" אין אנימציות.
- תרגיל של 4 סטים נכנס במסך אחד במסך האימון.
- נבדק גם בכרום של אנדרואיד.
- `tools/check.sh` ו־`tools/test-*.mjs` עוברים, כולל הבדיקה החדשה של הטוקנים.

## הגדרת "גמור" — M4c2 (מסך היום)
- מסך היום בנוי כמו בהדגמה: ברכה, כרטיס רמה מדורג עם רצף, שלוש טבעות, ואז שאר הכרטיסים.
- הטבעות מראות נתונים אמיתיים של היום, גם אופליין; בלי נתונים — טבעת אפורה ריקה.
- סימון שנותן נקודות מראה את הברק והתג על כרטיס הרמה; עם ״הפחתת תנועה״ — בלי אנימציה.
- כל זה קריא ונכון בצבעים ב־DARK, BRIGHT ובכל חמש האקראיות; אין אדום להחמצה.
- `tools/check.sh` ו־`tools/test-*.mjs` עוברים, כולל בדיקה לחישוב הטבעות.

## שאלות פתוחות
אין. סדר הטבעות (אימון · תזונה · שינה) אושר ע״י ירין 2026-11-12.
