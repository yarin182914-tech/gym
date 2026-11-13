# Build roadmap — ג׳ימי upgrade

Each milestone = one branch + one PR. Build them in order; each one must leave the live app working.
Section names in quotes refer to headings in `docs/upgrade-plan.md` (Hebrew).
Defaults for every number come from the plan and live in one config module (`js/lib/rules.js`).

**Build order now (ירין 2026-11-13, combining the 2026-11-12 order with the growth review):** 1. M0a logo → 2. M14 UX/UI cleanup with the M4c "זהב" base inside it → 3. M0b name and first screen → 4. M15 polish the existing screens (the feedback page first) → 5. M16 open the app to Maya → 6. the rest of "עכשיו" (M9s, M10, M10b, M10c, M10d) → the pilot. Only then new features. Details under "עכשיו" below.

Status legend: ☐ not started · ◐ in progress (branch or PR open) · ☑ merged · ✕ dropped

**Adding work:** run `/feature <request>` in Claude Code (`.claude/commands/feature.md`). It asks questions, writes a spec in `docs/specs/`, adds or updates the milestone here and waits for ירין's "כן" before building. A new milestone goes where it fits in the build order, with the next free number or a letter suffix (M6c, M8d), in this format:

```
## M<n> ☐ <Title> — `feature/<m>-<slug>`
Plan: "<section in upgrade-plan.md>" or "Asked by ירין <date>: '<their words>'". Spec: `docs/specs/<slug>.md`.
- Data: …
- UI: …
- Done when: …
```

---

## M1 ☑ Sleep log — `feature/m1-sleep`
Plan: "שלב 1", "שינה מול כללי המשתמש", rewards table rows for sleep.
- Data: `users/{uid}/sleep/{yyyy-mm-dd}` keyed by the **morning** date: `bedtime`, `wakeTime` (Timestamps), `durationMin` (number), `source`, `createdAt`.
- Sleep settings on the user doc: bedtime target per weekday, wake time, minimum hours, flexible nights (e.g. Thu/Fri: only duration counts).
- Sleep card component: two clock pickers prefilled with the usual times (reuse `js/ui/clock-input.js`), duration ring vs target, streak flame. Logging must take ~2 seconds.
- Evaluation function (pure, unit-testable): given a night + settings → `{ onTime: full|close|miss, duration: full|close|miss }` using the plan's thresholds (close = within 30 min; under 6h always miss).
- Done when: you can log last night from the card, edit it, see this week's 7 nights, and DATA.md documents the collection.

## M2 ☑ Habits (basic) + "היום" screen — `feature/m2-today-habits`
Plan: "מסך הבית ("היום")", "הגדרת הרגל" (ניקוד ורצף, רישום מהיר).
- Data: `users/{uid}/habits/{auto}` (name, icon, area, schedule: daily | N per week | fixed weekdays, measure: yes/no | quantity | steps | limit, `full` and `short` targets, active/paused, order) and `users/{uid}/habitLogs/{yyyy-mm-dd}` (map habitId → `{ level: full|short|none, value? }`).
- Simple add/edit habit form (the full 6-step wizard comes in M5).
- New route `#/today` becoming the default screen: level bar placeholder, "next step" card (morning: log sleep; evening: mark habits), sleep card from M1, habit cards (tap → מלא / מקוצר / אחר; long-press undo).
- Streaks: daily habits in days; N-per-week habits count in weeks.
- Done when: Today shows sleep + habits, marking works offline and syncs, streaks are correct across a week boundary.

## M3 ☑ Navigation restructure — `feature/m3-nav`
Plan: "ניווט".
- Bottom nav: היום · משימות (placeholder until M6) · אימון · תזונה · שינה. History moves inside אימון. Progress/dashboard opens from the level bar. Settings ("התכנית שלי") opens from the profile icon.
- Floating + button with a bottom sheet (reuse `js/ui/bottom-sheet.js`): meal, weigh-in, sleep, walk.
- Keep every existing route URL working (redirect old hashes).

## M3c ☑ Steps from the iPhone + "חיבורים" page — `feature/m3c-steps-import`
No plan chapter; asked by ירין 2026-11-09. A web app can't read Apple Health, so an iOS Shortcuts automation reads today's steps and opens the app with them.
- New route `#/import?steps=N[&date=yyyy-mm-dd]`. `steps` an integer 0–100,000; `date` defaults to today (Israel), may be up to 7 days back, never in the future. Anything else → a short Hebrew error toast, nothing written.
- Writes `users/{uid}/dailyActivity/{date}` with merge: `steps`, `stepsKcal` and `totalOutKcal` recomputed from the doc's existing `baseKcal` (default 1950) and `workoutKcal` (default 0), `source: 'shortcut'`, `loggedAt`. Never lowers steps already stored for that day (keep the larger), so a midday run can't undo the evening number. Same URL twice = same result.
- Not signed in yet → keep the request in localStorage and apply it right after sign-in.
- After saving: toast "נשמרו 12,450 צעדים" and go to `#/today`, where the steps habit (autoSource) updates by itself.
- Document `source: 'shortcut'` and the route in DATA.md. Numbers (max steps, days back) in `js/lib/rules.js`.
- **"חיבורים" page** (new route `#/connections`, opened from the profile menu; later part of "התכנית שלי"): one card per connection, each with status (מחובר / לא מחובר / last sync time), a one-tap action and short illustrated Hebrew steps. M3c builds the page and the first card; each later milestone adds its own card:
  - **צעדים מהאייפון (M3c):** an "הוספת הקיצור" button opening a ready-made iCloud shortcut link (ירין publishes it once; the URL lives in `js/lib/rules.js`), then 4 numbered steps to create the daily automation (Shortcuts → Automation → Time of Day 21:00 → Run Immediately → the shortcut), a status line showing the last import time from `dailyActivity.source == 'shortcut'`, and a hint if nothing arrived in 2 days.
  - **Steps in the phone's own language:** every how-to on this page has two versions, matching the iPhone's language: Hebrew iOS labels and English iOS labels (the button and menu names exactly as the phone shows them, e.g. Shortcuts/קיצורים, Automation/אוטומציה). A swipeable/segmented switch "האייפון שלי בעברית | My iPhone is in English" at the top of each how-to; the default follows `navigator.language`, the choice is remembered (localStorage). The surrounding app copy stays Hebrew. All Hebrew iOS label strings must be checked on a real Hebrew iPhone before merge; the strings live in one file (`js/lib/ios-labels.js`).
  - Placeholders (grey, "בקרוב") for: Google Calendar (M7), push notifications (M9), Claude connector (M11), cloud storage / Drive via the Claude connector (M12), Garmin (later).
- Done when: opening the URL on the preview sets today's steps, the steps habit and the burn update, repeating it changes nothing, a lower number doesn't overwrite a higher one, and the חיבורים page shows the shortcut card with its last-sync time. Later (M11): the shortcut posts to the server instead, silently.

## M3e ☑ Silent steps from the iPhone — `feature/m3e-silent-steps`
Asked by ירין 2026-11-11 ("שהקיצור של הצעדים ייעשה אוטומטית"). The shortcut posts the steps to `POST /api/steps` (Vercel function) with a personal key made on "חיבורים" — no Safari, runs with the phone locked. Keys: `users/{uid}/apiKeys/{sha256}`, the first piece of M11's per-user keys. The Safari way stays as a fallback.
- One-tap install (2026-11-11): "התקנת הקיצור" makes a key, copies it and opens the shared iCloud shortcut, which asks for the key on import (`STEPS_IMPORT.silentShortcutUrl`).
- Instagram time (2026-11-11, ירין: "משהו דומה לשימוש באינסטגרם"): Screen Time can't be read, so "opened"/"closed" automations post to `POST /api/usage`; the minutes fill the Instagram part of the limit habit. `appUsage`, `appSessions` in DATA.md.
- Any app, per user (2026-11-11, ירין: "יש אנשים שירצו למדוד עוד דברים ועוד אפליקציות"): one shared shortcut "ג׳ימי זמן באפליקציה" takes the automation's text (`<app> נפתח/נסגר`); on חיבורים the user picks ready-made apps or types any name (`usageApps` on the user doc), and gets two automations per app. Once ירין shares the shortcut's iCloud link → `USAGE.shortcut.url` for one-tap install.

## M3b ☑ Workout types (functional, CrossFit, Pilates…) — `feature/m3b-workout-types`
Plan: "סוגי אימון: פונקציונלי, קרוספיט, פילאטיס ועוד". Independent of M1–M3; can be pulled earlier.
- New exercise kind `session` next to `strength` and `cardio` inside the existing `workouts` doc (old workouts untouched): `{ kind: 'session', typeId, name, durationSec, rpe (1–10), avgHr?, place?, fields: {…type-specific}, notes }`. A workout can mix kinds (e.g. CrossFit with a strength part).
- Built-in type definitions in code (functional, crossfit, pilates, yoga, swim, studio, sport, ski) with their fields per the plan; user-defined types in `users/{uid}/workoutTypes/{auto}` built from a field palette (duration, distance, rounds, reps, weight, result time, level, picklist, text).
- Quick log: pick type → fields prefilled from the last workout of the same type.
- Burn: kcal = MET(type, rpe) × bodyweight kg × hours, MET table in `js/lib/rules.js`; feeds the existing calories-out calculation.
- **No double counting:** outdoor walks/runs (`inputMode: 'free'`) are already in the phone's steps, so they add 0 workout kcal (history and streaks only). Treadmill, bike and session types do count.
- PRs: same-name CrossFit WOD (faster time / more rounds+reps); functional: more rounds in the same format. History labels by type; progress chart per type.
- Document the new kind in `docs/DATA.md` so the coach can log Pilates/CrossFit from chat.

## M3d ☑ Fixes from the feedback board — `feature/m3d-feedback-fixes`
No plan chapter; ירין asked 2026-11-10 to solve every open item on the in-app feedback board (`siteFeedback`). Each fix also flips that item's status to `done` on the board (the app's own feedback screen, by ירין).
- **Wrong PR on deadlift (bug, 7.11).** Cause: a new set copies the previous set's `type`, so after one warm-up set every following set is saved as `warmup` too, and PRs/"last time" skip warm-ups. Found in 14 exercises across 13 workouts (e.g. deadlift 4.11: 31.25 kg ×3 all `warmup`, so the PR still shows 30). Fix: `prefillForNewSet` turns `warmup` into `working` for the next set (a second warm-up is one tap); the same when prefilling from last time. Old data: do NOT rewrite in the app; the coach lists the affected sets and fixes them only after ירין says yes.
- **Typing a new exercise name jumps the screen up (bug, 5.11).** Cause: every keystroke in the picker search calls the full `render()`. Fix: on input re-render only `#picker-results`; keep focus and scroll.
- **Slow, and page changes stutter on weak internet (30.10, 1.11).** Causes: (1) the service worker is network-first for every one of ~70 modules, so each screen waits on the network; (2) saves `await` the server ack (`setDoc`/`addDoc`), which on weak signal blocks the UI although the write is already in the local cache. Fix: service worker → cache-first (stale-while-revalidate) for same-origin files, cache name bumped on each release; writes resolve once queued locally (same pattern as the steps import: race with a short timeout), with a small "ממתין לסנכרון" dot until the server confirms; first paint of each screen from the Firestore cache, refresh after.
- **A note per exercise (7.11).** Some machines differ (seat height, handle, which machine). New optional `note` on the `exerciseLibrary` entry, edited in the exercise edit sheet and shown under the exercise name during a workout and in "last time". Document in DATA.md.
- **See that a workout is running in the background (9.11).** A web app can't show an iPhone Live Activity. Fix: (1) a sticky "אימון פעיל · 32:10" pill above the bottom nav on every screen, tap → back to the workout; (2) app-icon badge via `navigator.setAppBadge(1)` while a live workout is open (works for the home-screen app on iOS 16.4+ once notification permission exists, so it lights up fully after M9); cleared on finish/delete.
- Done when: each item is reproduced before and checked after on the preview at 390px; a unit test covers the warm-up → working prefill; DATA.md documents `exerciseLibrary.note`.

## M4 ☑ Points, levels and reward moments — `feature/m4-rewards`
Plan: "שלב 2: תכנית התגמול" (all subsections except "לאורך זמן").
- Data: `users/{uid}/pointsLedger/{auto}` — one entry per award: `{ date, source: sleep|habit|meal|workout|..., ref, points, reason }`. Level, totals, streaks and badges are **derived** from the ledger (never stored as the only copy).
- Daily cap, partial ("close") scoring, no negative points.
- Moments: +10 float and ring fill on log, day-close summary card, perfect-day confetti (small library from cdnjs or hand-rolled), badge toast, level-up full screen. Vibration on Android; iOS fallback = sound + animation.
- Progress screen: 7-day grid per area, streaks, badge shelf, level road with the real reward at the end.
- Progress screen covers **everything tracked**, not just workouts (asked by ירין 2026-11-09): one row per area (sleep, each habit, bad habits once M5 exists, meals: count vs 2 and on-target days, protein, calorie deficit, workouts vs weekly goal, weigh-ins / 7-day average) with a week view (7 dots) and a month view (calendar heat-grid), tap a row for its detail chart. The user picks which rows show and their order ("מה אני עוקב אחריו", saved on the user doc); missed = grey, never red. Workout history stays as its own list inside אימון.

## M5 ☑ Habit wizard + bad habits — `feature/m5-wizard`
Plan: "הגדרת הרגל: אשף של 6 שאלות", "הרגלים רעים: אשף גמילה".
- 6-step wizard, one question per screen, templates (reading, morning routine, English, screen time, water, meditation).
- Bad-habit mode: trigger, replacement, friction, measure (clean day | limit | slip counter). "מעדתי" one-tap button logging the time. Separate "להיגמל" section on Today with a clean-days chain.
- Scoring per the plan (clean day 10, honest slip log 2, weekly bonus 20).

## M6 ☑ Tasks page — `feature/m6-tasks`
Plan: "דף המשימות", "מניעת דחיינות".
- Data: `users/{uid}/tasks/{auto}`: title, type (daily | recurring | one-off), recurrence, area, owner (me | assistant | shared), complexity (S/M/L), important (bool), dueDate, timing (exact | day | this week | let Claude decide), scheduledAt, status, postponeCount, firstStep, createdAt, `calendarEventId` (null until M7), `source`.
- Views: today, Eisenhower matrix, week/all with filters. Quick capture via + (free text → inbox).
- Procrastination ladder computed from `createdAt`/`postponeCount`: 1 week → orange "מחכה שבוע", 2 weeks → "why stuck?" quick answers, 3 weeks → forced decision (schedule / someday / delete). Max 3 important tasks per day. Top 3 tasks shown on Today.

## M6b ☑ Decisions — "להחליט" — `feature/m6b-decisions`
Plan: "קבלת החלטות: "להחליט"". Built for Maya: the problem is the time indecision burns, so everything is built around a time budget. Spec: `docs/specs/decisions.md`.
- **Split (ירין 2026-11-12):** M6b = triage, small and medium tracks, the open list with its ladder, points and badges. Lives as a 4th tab "להחליט" on משימות, plus "החלטה" on the + button and the nearest decision on Today. The large track, personal rules and the review move to **M6c**.
- Small decision game (ירין 2026-11-12): a pair of cartoon feet, one option each (2 by default, up to 4). The randomly chosen foot raises its big toe like a thumbs-up. The game is swappable (`js/ui/choosers/`), and ירין will send their own art.
- **Fully offline and self-contained:** all steps, timers, scoring and math run in client code on the Firestore local cache. No network, no Claude, no server needed. Claude may read open decisions later, but nothing depends on it.
- Data: `users/{uid}/decisions/{auto}` (question, track small|medium|large, options, criteria + weights, goodEnough threshold, budgetSec, decideBy, startedAt, decidedAt, choice, reason, feeling, reviewAt, outcome) and `users/{uid}/decisionRules/{auto}` (personal rules, e.g. "restaurant: first good-looking option").
- Triage: two questions (reversible? matters in a year?) → track; user can override.
- Small: visible 2-minute timer → coin flip + "how did it feel?". Medium: 2–4 options, ≤3 weighted criteria, good-enough bar, 10-10-10, computed suggestion; budget 10 min / decide by tomorrow. Large: WRAP steps, premortem, small experiment, decideBy date (default 1 week), "החלטתי" button on every step.
- Scoring (all in `js/lib/rules.js`): on time small 5 / medium 15 / large 40; late 2 / 5 / 10; no re-open +5; used a rule +3; new rule +10; review logged 3; "decides on time" streak with badges at 5/20/50. Never points for being "right", never a penalty. Points go to the ledger once M4 exists; until then store them on the decision.
- Open decisions list with the procrastination ladder from M6 (1 week no date → orange "תקבעי תאריך החלטה"; 2 weeks → "what's missing?"). Nearest decision on Today. Review reminder after 1 month (medium) / 3 months (large).
- Done when: a small decision can be made start-to-finish in airplane mode within 2 minutes, a medium one is scored on/late correctly at the boundary (unit test), and DATA.md documents both collections.

## M6c ☑ Decisions — the large track — `feature/m6c-decisions-large`
Plan: "קבלת החלטות: "להחליט"" (the parts M6b left out). Spec: `docs/specs/decisions-large.md`.
- **Split (ירין 2026-11-12):** the rest of the decisions plan is three PRs, in order: M6c the large track, M6d personal rules, M6e the review.
- Large track: full WRAP (at least 3 options, "what would you tell a friend", the score check, 10-10-10, premortem, a small experiment), `decideBy` default 1 week, every step optional with "החלטתי" on each. 40 points on time / 10 late (until the end of the decide-by day).
- Once M7 exists: the decide-by date goes into the calendar.
- Done when: a large decision runs through every step offline, is scored on/late at the end of its decide-by day (unit test), and DATA.md documents the new fields.

## M6c2 ☑ Decisions — screen and editing fixes — `feature/m6c2-decisions-polish`
Asked by ירין 2026-11-12 after testing on the iPhone (small fix, no spec file; the PR description holds it).
- A switch at the top of משימות: "משימות | החלטות" (open count), each part with its own tabs — היום / מטריצה / הכול, or פתוחות / החלטתי — and its own add button.
- A decided decision opens to be edited (question, choice, why, feeling) or deleted, with a confirm. `decidedAt` and earned points stay.
- New decision: a real field label 8px above a 48px field, and focus only after the sheet has slid up (the keyboard no longer shoves it mid-animation).
- Done when: all three work at 390px in every colour theme.

## M6d ✕ Decisions — personal rules — dropped
Dropped by ירין 2026-11-12: "לא נראה לי שהוא יהיה שימושי עבורי". The spec stays in `docs/specs/decision-rules.md` and a first build on the local branch `wip/m6c-all`, in case it comes back.

## M6e ☑ Decisions — "איך זה יצא?" — `feature/m6e-decision-review`
Spec: `docs/specs/decision-review.md`. Needs M6c merged.
- A month after a medium decision, three after a large one: one line on Today and a section on להחליט. Three answers (טוב / בסדר / פחות) and a note; 3 points whatever the answer.
- Also (ירין 2026-11-12, testing it): "החלטתי" opens as soon as there is a question ("מה החלטת?" in one line when no options were written), and `?dev` sample data runs on branch previews (never the live site) so the review can be tried on the iPhone.
- Done when: the review shows on its day (unit test), pays 3 once, and DATA.md documents the review fields.

## M7 ☑ Google Calendar sync from the app — `feature/m7-calendar`
Plan: "חיבור ליומן גוגל" in "מענה טכני", "סנכרון עם היומן". Spec: `docs/specs/calendar-sync.md`.
- Through the server (ירין 2026-11-12), not from the browser: a one-time Google consent (`calendar.events`), the refresh token kept server-only in `calendarTokens/{uid}`, and `api/calendar.js` creates / moves / marks ✓ / deletes the event of a one-off task with a time (timed event, length by size) or a day (all-day event). The event id stays on the task; events carry a private extended property `{ gymi: true, taskId }`.
- Only touches events linked to a task, in the primary calendar. Offline saves queue on the device and retry on the next open. The sync is one server function, so the Claude connector can call it once it gets task tools.
- Replaces the grey "יומן גוגל" card on the "חיבורים" page (status, one-tap connect, disconnect).
- Needs from ירין: Calendar API + an OAuth client in Google Cloud, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in Vercel. No `firestore.rules` change.
- Done when: a task with a time shows in Google Calendar within seconds, moving it moves the same event, done adds ✓, delete removes it, and the connection survives a day without asking again.

---

**From the growth review (2026-11-12, https://claude.ai/artifact/WkCqJqGnTUW3rM1kjHskuZ).** ירין decided: the audience is trainees (training, food and sleep around it), the AI is hybrid (code for everyone, a small built-in model for photo meals and the weekly summary, the user's own Claude/ChatGPT as optional depth), Android is supported from today (every milestone is tested in Chrome on Android too), and the pilot starts only after the "עכשיו" phase below. No new features until "עכשיו" is merged. The pilot: 5–10 trainees, at least 3 on Android and 3 without Claude; success = 40% still log 2 workouts a week after 30 days.

**"עכשיו" — ready for the first friend**

**New name (ירין 2026-11-13): ג׳ימי → ג׳יני, in English Jini.** She is a personal assistant, so the copy speaks of her in the feminine ("ג׳יני זוכרת"). The rename of user-visible text lands in M0b; code identifiers (`gymi`) and stored data keep their names.

**Combined order (ירין 2026-11-13):** M0a logo → M14 UX cleanup together with the M4c "זהב" base, one visual pass → M0b name and first screen → M15 polish (the feedback page first) → M16 Maya → M9s, M10, M10b, M10c, M10d → the pilot. It merges the 2026-11-12 order (UX cleanup, polish and Maya before new features) with the 2026-11-13 one (logo, "זהב", first screen). M14–M16 keep their 2026-11-12 numbers; the growth review's own M14 / M14a / M15 / M15a / M16 are M17 / M17a / M18 / M18a / M19 here.

## M0a ☐ Logo — `feature/m0a-logo`
Asked by ירין 2026-11-13: "אני רגע רוצה לעצב את הלוגו של האפליקצייה ולהכניס אותו גם לפה".
- 3–4 logo directions for ג׳יני on one visual page, in the "זהב" palette (`docs/specs/gold-look.md`); ירין picks one.
- Files: the logo as SVG plus every icon size the app uses (`images/icon-192.png`, `icon-512.png`, a maskable icon for Android, `apple-touch-icon.png`, `favicon-32.png`), wired into `manifest.json` and `index.html`. The name strings themselves change in M0b.
- Done when: the new icon shows on the iPhone and Android home screen and in the browser tab, readable on dark and light backgrounds.

## M14 ☐ UX/UI cleanup — calmer, less crowded — `feature/m14-ux-cleanup`
Asked by ירין 2026-11-12: a Claude review of the app found the UX/UI "לא מספיק טוב ויותר מדי עמוס"; this goes first. Spec: `docs/specs/ux-cleanup.md` (to write in `/feature`, starting from that review).
- Scope: structure and density, not new features: fewer cards per screen, one main action per screen, clear hierarchy, consistent spacing and copy, things moved behind "עוד" where rarely used.
- Includes the M4c "זהב" base (ירין 2026-11-13: one visual pass instead of two). `/feature` may still split it into two PRs if it gets too big.
- Done when: every tab at 390px shows its main action without scrolling past clutter, both themes, and ירין approves before/after screenshots.

## M4c ☐ The "זהב" look — the design base — `feature/m4c-gold-look`
Built inside M14 (ירין 2026-11-13), so the first screen and the logo are built once, in the new look. Spec: `docs/specs/gold-look.md`, the "בסיס לכל האפליקציה" part: tokens, type ramp, radius, elevation, motion, buttons, cards, the + button and the nav, in every theme block. The Today redesign from the same spec waits for M4c2.

## M0b ☐ Name and first screen — `feature/m0b-first-screen`
Growth review, phase "עכשיו". Spec: `docs/specs/first-screen.md`. After M0a and M14 (with the M4c base).
- Data: new user docs no longer get `weddingDate` (old ones keep it). No rules change.
- UI: the name ג׳יני in the tab title, home-screen name, manifest, app bar and every user-visible text. A welcome screen for signed-out users: the logo, "כי מישהו צריך לנהל לך את החיים", and five areas (sleep, nutrition, movement, tasks, habits) that each open to 3–4 lines with a hook. An install button there (Chrome's prompt with screenshots on Android, the steps on iPhone), a professional "ההתחברות כפופה למדיניות הפרטיות" line, and a draft `privacy.html`. `import-30-7.html` moves to `_archive/`, and `_archive/` stops being served.
- Done when: a new user sees no wedding and no "ג׳ימי" anywhere, every area opens, install works from the first screen on Android and iPhone, and the privacy link works, at 390px in every theme.

## M15 ☐ Polish the existing screens (feedback page first) — `feature/m15-polish`
Asked by ירין 2026-11-12: before new features, fix what exists. Start with the feedback page ("דף המשוב") as the example of a screen that needs work, then screen by screen (this replaces M4c's follow-up M4d). One PR per screen or two is fine (M15a, M15b…).

## M16 ☐ Open ג׳ימי to Maya — `feature/m16-maya`
Asked by ירין 2026-11-12: Maya is the first user after ירין. Her own ג׳ימי user (Google sign-in already works for any account; rules isolate `users/{uid}`), with ירין's personal leftovers out of her way (the 1950 base burn, `weddingDate`, ירין-only links) and a short first-run setup (the minimum of M10). Her Claude: the connector key from "חיבורים" (M11) on her own phone, plus a "ניהול חיים" project per the plan's "קלוד כעוזר אישי" (the part of M12 she needs). Check first: how Maya's Claude account works (ירין asked if she can use his paid plan; answered in the build thread).

## M9s ☐ Security before friends — `feature/m9s-hardening`
Growth review, phase "עכשיו".
- Rules: the feedback board readable and editable only by its author plus an admin (today any Google account can read, edit and delete every entry, with names). **`firestore.rules` changes** → deploy before merge.
- Server: App Check, rate limits and a batch cap on `api/`, a Claude key that expires and travels in a header instead of the URL, a server-side check of points before anything compares users.
- Also: stop serving `docs/`, `tools/` and `CLAUDE.md` from the site, and check `docs/specs/img/` for real personal data.
- Done when: a second Google account can't read or change someone else's feedback, and a 1,000-call batch is refused.

## M10 ☐ Signup, profile and minimal mode — `feature/m10-onboarding`
Plan: "שלב 4", "שאלון חיים ותכנית אב" (level 1). **Moved into "עכשיו"** by the growth review (2026-11-12). Includes "במה תרצה להשתמש?" (the M8 feature switches, built here). Questionnaire on first login, about 3 minutes (level 1 only is required; ends with "set goals now / later / never" → `lifePlan.planDepth`); personal BMR (Mifflin-St Jeor) replaces the hard-coded 1950; targets from the goal.
- **Trainee minimal mode:** a new user starts with training, protein, sleep and weight. Tasks, decisions, bad habits and the library are off until switched on. No silent example habits; a clean Today with one first step. (M0b's welcome screen lists all five areas by ירין's wish; recheck its lines once the defaults are set here.)
- Meals per day by choice: today `maxMeals: 2` means anyone eating 3 meals never gets a perfect day.
- `weddingDate`: no longer written since M0b; old docs keep it.
- Email + password sign-in for friends without a Google account, any email provider (ירין 2026-11-11, again 2026-11-13: "עם כל סוגי המיילים"): already written in August as `signInWithEmail` / `signUpWithEmail` / `resetPassword` in `js/auth.js` on branch `phase-0-backup` (with its sign-in screen). Reuse it here instead of rewriting. The same branch has a CSV export (`js/lib/csv.js`, BOM for Hebrew in Excel) — a candidate for M10b.
- Sign in with Apple: not in the pilot (ירין 2026-11-13). It needs an Apple Developer membership ($99 a year), which an App Store app would need anyway; add it when that is decided.
- Done when: a new account answers the questionnaire in about 3 minutes, gets its own burn and targets, and Today shows only the areas it chose.

## M4c2 ☐ The "זהב" look — Today — `feature/m4c2-gold-today`
The Today part of `docs/specs/gold-look.md` (greeting, gradient level card with streak, three rings, the +points moment), split from M4c by ירין (2026-11-13). After M10, because minimal mode decides what Today shows.

## M10b ☐ Account and privacy — `feature/m10b-account`
Growth review, phase "עכשיו". Health data is "especially sensitive" under Israel's privacy law (Amendment 13, in force since 2025-08-14).
- Sign-out (exists as `signOutUser`, no button), export of all the user's data to a file, account deletion, a full Hebrew privacy policy (replacing M0b's draft at the same `privacy.html`), and an explicit consent before data goes to Claude.
- The "ניהול חיים" project moves from the service account (which sees every user) to a personal key.
- **Face ID lock** (ירין 2026-11-13, chose a lock over Face ID sign-in): opt-in; when on, the app opens only after Face ID / fingerprint (WebAuthn with the phone's own sensor). Check first that it works in the iPhone home-screen app and on Android.
- A short consultation with a privacy lawyer before the pilot.
- Done when: a user can sign out, download their data and delete the account from the app, and turn on the Face ID lock.

## M10c ☐ Measurement — `feature/m10c-metrics`
Growth review, phase "עכשיו". Without it the pilot runs on feelings.
- Basic, privacy-respecting events (signed up, opened, logged, came back), a retention view after 1, 7 and 30 days, error reports, and a visible message when a save fails (today only the console knows). Document every path in DATA.md.
- Done when: ירין can see how many pilot users came back on day 7.

## M10d ☐ Lean reads and speed — `feature/m10d-lean`
Growth review, phase "עכשיו". Today every save and every return to the app re-reads about 1,000 documents, and all 109 modules load at start.
- A stored points total, reads by date range, screens loaded only when opened, the disabled AI library dropped from start-up, and a versioned cache in the service worker.
- Done when: a save reads tens of documents, not about 1,000, and the first screen loads noticeably faster on a phone.

**"אחר כך" — during the pilot**

## M3f ☐ Fast workout — `feature/m3f-fast-workout`
Growth review, phase "אחר כך", first in the pilot. Asked on the feedback board: start from the workout type, then pick exercises.
- "Like last time" in one tap, templates from past workouts, a set logged in two taps. On the way, split `js/pages/active-session.js` (3,323 lines today).
- Done when: a repeat workout starts in one tap and a set takes two taps.

## M19 ☐ Progression and readiness — `feature/m19-progression`
Growth review (its M16), phase "אחר כך". Code only, no AI; every number in `js/lib/rules.js`.
- Next-session weight and reps from last time (in the rep range → +2.5 kg), a readiness note from last night's sleep, weekly volume per muscle group, and a calorie target that follows the weight trend.
- Done when: after a workout the next one suggests its weights, and a short night shows a readiness note.

## M17a ☐ Photo meal — `feature/m17a-photo-meal`
Growth review (its M14a), phase "אחר כך". The code exists but is off.
- Photograph a meal, get calories and protein, confirm. Recognition runs through the server with a small model and a usage cap (numbers in `js/lib/rules.js`), free in the pilot.
- Done when: a photo becomes a confirmed meal in under 10 seconds, and the cap stops calls past the limit.

## M18a ☐ Steps from Android + "חיבורים" per phone — `feature/m18a-android-steps`
Split out of M0b by ירין (2026-11-13). A web app can't read Health Connect, so the phone needs a helper app.
- On Android, "חיבורים" hides the iPhone-only cards (steps shortcut, app time) and shows a steps card with today's number and a quick manual log (+ → צעדים). Reuses `detectPlatform` from M0b's `js/lib/platform.js`.
- Automatic steps through the "Health Connect Webhook" app (Google Play, open source): it posts Health Connect steps with the personal key in a header; `POST /api/steps` learns its payload (`steps: [{ count, start_time, end_time }]`). Check first: price, privacy and how reliable its background sync is.
- App time on Android (Instagram): look at Tasker / MacroDroid before promising it.
- Done when: an Android phone sees only cards that work on it, and its steps arrive by themselves at least once a day.

## M11b ☐ The coach acts — `feature/m11b-coach-actions`
Growth review, phase "אחר כך".
- Claude tools for tasks (including scheduling), workouts, decisions, habits and the plan. An in-app "המאמן מציע" card to approve, a change log with undo, and "allowed without asking" per kind of action.
- Done when: Claude can suggest a task with a time, it appears for approval in the app, and one tap undoes it.

## M11c ☐ Coach memory — `feature/m11c-coach-memory`
Growth review, phase "אחר כך".
- `users/{uid}/coachMemory`: what the coach knows about the user, visible and editable in the app, read by Claude at the start of each chat. Document in DATA.md.
- Done when: a user can see, edit and delete what the coach remembers.

## M9b ☐ Proactive moments — `feature/m9b-moments`
Growth review, phase "אחר כך". Needs M9.
- Rules in code that spot a moment (late nights, a stuck task, a weak week) and send one notification with a question ready for the coach. Counts inside M9's 4-a-day cap.
- Done when: three late nights in a row send one notification, never more than the cap.

**"מאוחר יותר" — only once the pilot works**

## M17 ☐ Built-in assistant — `feature/m17-assistant`
Growth review (its M14), phase "מאוחר יותר".
- A free line that becomes a task or a workout, and a weekly summary paragraph. Through the server, a small model, a usage cap; numbers in `js/lib/rules.js`.

## M11d ☐ The app in ChatGPT — `feature/m11d-chatgpt`
Growth review, phase "מאוחר יותר". The same connector server as an app in ChatGPT, for people without Claude.

## M18 ☐ Android and watches — `feature/m18-watches`
Growth review (its M15). Strava first (phase "אחר כך": works on both phones, but brings workouts, not steps; a new Strava app starts limited to 1 athlete until Strava approves more, so ask early). Then Garmin through the server. Then a decision on a store app wrapper with Apple Health and Health Connect, which breaks the "no build step" rule and needs ירין's call.

---

## M8 ☐ Settings — "התכנית שלי" — `feature/m8-my-plan`
Plan: "מסך ההגדרות: "התכנית שלי"".
- Sections: goals, sleep, habits, training, nutrition, body, routine, rewards, notifications, assistant. Change history (`users/{uid}/planHistory`). Assistant suggestion cards (approve/decline).
- **Feature switches** (asked by ירין 2026-11-10): one on/off per area — sleep, habits, workouts, nutrition, tasks — on the user doc (`features: { sleep: true, … }`, missing = on). Off: its screen/tab and Today card are hidden, and it is left out of points, the perfect day and the progress rows, so nobody loses points for something they didn't choose. Turning one on opens a short setup for it (e.g. bedtime and hours for sleep). The same question appears in signup (M10).
- Life plan (plan: "שאלון חיים ותכנית אב"): `users/{uid}/lifePlan` (planDepth basic|goals|full, areas, goals with horizon 3m|1y|3-5y and A/B/C, reviewRhythm, lastOfferedAt, declinedCount). Level 2 (goals) and level 3 (full plan) forms, every question skippable, "later" keeps partial answers, deepen one area at a time. Per-area recommendation templates in code (`js/lib/plan-templates.js`) that create a habit/task in one tap — work offline, no Claude needed.

## M8b ☑ "ללמוד" — recommended content for a healthy life — `feature/m8b-library`
Asked by ירין 2026-11-10. A page of hand-picked books, podcasts, videos and articles on sleep, nutrition, training, habits, longevity and mind, each with a cover image, a short Hebrew summary and a link.
- Content lives in the repo as data (`data/library.json`), no CMS: `{ id, type: book|podcast|episode|video|article, area: sleep|nutrition|training|habits|longevity|mind, title, author, lang, minutes|pages, image, link, summary (2–3 Hebrew lines), takeaways: [3 short Hebrew bullets], habitIdea? }`. Cover images are small local files in `images/library/` (works offline, no hot-linking). Claude curates and writes the summaries; ירין approves the first batch (~20 items) before merge.
- Page: opened from the profile menu and from "התכנית שלי". Filter chips by area and type; the order puts first the areas where the user's own data is weakest (e.g. sleep under target → sleep first). Card: image, title, author, length, summary; tap → takeaways + "פתיחה" (link) + "שמירה" + "סיימתי".
- One tap from a takeaway to a new habit or task (reuses M2/M6), so learning turns into action.
- Per-user marks in `users/{uid}/libraryMarks/{itemId}` = `{ saved, doneAt }`; the coach can add personal picks in `users/{uid}/libraryPicks/{auto}` (same shape as an item, plus `reason`). Document both in DATA.md.
- Rewards (if M4 is in): points for finishing a book/episode, a "קורא" badge. No reading streaks, no punishment.
- "+ הוספת המלצה" (asked by ירין 2026-11-10): a user adds their own book/podcast/link with a line on why, saved in `users/{uid}/libraryPicks` (`source: 'user'`). Sharing picks between users needs a shared board and moderation — after the pilot.

## M8c ☑ Tracking where it's logged + quick log — `feature/m8c-tracking-plus`
Asked by ירין 2026-11-10 ("ממשק המעקב לא נוח").
- Each chart sits on the screen where the data is logged: body weight trend on תזונה; the workout charts (cardio, workout types, strength, PRs) as a third part of אימון ("התקדמות", `#/workout-progress`); new sleep charts on שינה (hours vs the minimum, bedtime vs the target, 14 / 30 nights).
- The level screen ("התקדמות") keeps only the game: summary and tracking rows.
- The + button logs anything in one tap: אימון, הליכה, ארוחה, שקילה, צעדים, שינה, הרגל — each opens its own screen with the form ready. Tasks join it when the tasks page lands.

## M9 ☐ Push notifications — `feature/m9-push`
Plan: "שלב 3: התראות פוש", "שרת קטן" in "מענה טכני".
- Web Push (VAPID) subscription stored per device; Vercel serverless function to send; scheduled check every 15 min from GitHub Actions. Rules: only when something is missing, max 4/day, quiet hours, quiet Saturday, merge multiple reminders.
- Adds its card to the "חיבורים" page (status, one-tap connect, short steps).

- **What sends a notification** (ירין 2026-11-12: "תרשום את זה במפת הדרכים שלא נשכח"). Keep adding to this list as features ask for one:
  - "איך זה יצא?" (M6e): on the day a decision's review is due, one notification with its question ("איך זה יצא? <השאלה>"), opening the review.

## M11 ☑ Claude connector (MCP) — `feature/m11-mcp`
Plan: "שלב 5". Vercel function, hashed personal keys, per-user tools incl. "what changed since last check". PR #22 merged 2026-11-11 (rules deployed first; deploy needs `--project gym-site-ea1b7`, there is no `.firebaserc`).
- Adds its card to the "חיבורים" page (status, one-tap connect, short steps).

## M12 ☐ "קלוד" instructions page — `feature/m12-claude-page`
Plan: "שלב 6", and the "ליזום, לא לחייב" rules in "שאלון חיים ותכנית אב": Claude reads `planDepth` and never assumes more; offers to go deeper at natural moments, max once a month; stops after two declines until asked; full-plan users get full initiative.
- Personal coach onboarding (ירין 2026-11-12, plan: "קלוד כעוזר אישי"): the page walks a new user through creating a Claude project "ניהול חיים" with ready project instructions (one-tap copy, template in `js/lib/coach-templates.js`), connecting ג׳ימי + Google Calendar + Drive, then an intake interview in chat → approved summary in `lifePlan.interview`, vision per goal in `lifePlan.goals[].vision`. Daily: meals from photos (log after "yes"), habits/tasks, calendar, master plan, morning/evening/weekly routine.
- Check first: what friends' Claude plans allow (projects, custom connectors, scheduled check-ins).

## M13 ☐ Share achievements — `feature/m13-share`
Asked by ירין 2026-11-10, for after the app is ready for other users (after the pilot). Share a level-up, badge, PR, streak or weekly summary as an image card (canvas → PNG) through the phone's share sheet (`navigator.share` with files), no raw data. Opt-in per share, nothing posted automatically.

## M4c — moved
Asked by ירין 2026-11-12: "שיפור המראה הכללי של האפליקציה … ברמה של תאגיד ענק כמו גוגל או מייקרוסופט". Picked "זהב" of four proposals. Spec: `docs/specs/gold-look.md`. First planned last; on 2026-11-13 ירין split it: the design base is **M4c**, built inside M14 in "עכשיו" (before M0b), the Today redesign is **M4c2** after M10.
- UI (the whole spec): retuned tokens (16px body, new type ramp, radius 26/16, warm elevation, motion tokens, ring/reward/missed tokens) in every theme block; shared cards, buttons, FAB and nav restyled; Today rebuilt as greeting → gradient level card with streak → three rings (אימון · תזונה · שינה) → existing sections. Gold shine + glow toast for the +points moment (when it fires stays with M4b).
- Done when (both parts): Today matches the comparison mockup at 390px with real data (also offline), every tab still lays out at 16px body, and DARK, BRIGHT and all five RANDOM palettes stay readable with missed = grey.
- Follow-up: M4d, screen-by-screen polish of אימון, תזונה, שינה, משימות, החלטות and התקדמות.

## Later
"לאורך זמן" (graduating habits, seasons, monthly recalibration, vacation mode). Garmin (שלב 7) is now part of M18, and the pilot (שלב 8) starts after the "עכשיו" phase.
