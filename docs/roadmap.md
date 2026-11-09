# Build roadmap — ג׳ימי upgrade

Each milestone = one branch + one PR. Build them in order; each one must leave the live app working.
Section names in quotes refer to headings in `docs/upgrade-plan.md` (Hebrew).
Defaults for every number come from the plan and live in one config module (`js/lib/rules.js`).

Status legend: ☐ not started · ◐ in progress · ☑ merged

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

## M3 ☐ Navigation restructure — `feature/m3-nav`
Plan: "ניווט".
- Bottom nav: היום · משימות (placeholder until M6) · אימון · תזונה · שינה. History moves inside אימון. Progress/dashboard opens from the level bar. Settings ("התכנית שלי") opens from the profile icon.
- Floating + button with a bottom sheet (reuse `js/ui/bottom-sheet.js`): meal, weigh-in, sleep, walk.
- Keep every existing route URL working (redirect old hashes).

## M3c ☐ Steps from the iPhone (Shortcuts) — `feature/m3c-steps-import`
No plan chapter; asked by ירין 2026-11-09. A web app can't read Apple Health, so an iOS Shortcuts automation reads today's steps and opens the app with them.
- New route `#/import?steps=N[&date=yyyy-mm-dd]`. `steps` an integer 0–100,000; `date` defaults to today (Israel), may be up to 7 days back, never in the future. Anything else → a short Hebrew error toast, nothing written.
- Writes `users/{uid}/dailyActivity/{date}` with merge: `steps`, `stepsKcal` and `totalOutKcal` recomputed from the doc's existing `baseKcal` (default 1950) and `workoutKcal` (default 0), `source: 'shortcut'`, `loggedAt`. Never lowers steps already stored for that day (keep the larger), so a midday run can't undo the evening number. Same URL twice = same result.
- Not signed in yet → keep the request in localStorage and apply it right after sign-in.
- After saving: toast "נשמרו 12,450 צעדים" and go to `#/today`, where the steps habit (autoSource) updates by itself.
- Document `source: 'shortcut'` and the route in DATA.md. Numbers (max steps, days back) in `js/lib/rules.js`.
- Done when: opening the URL on the preview sets today's steps, the steps habit and the burn update, repeating it changes nothing, and a lower number doesn't overwrite a higher one. Later (M11): the shortcut posts to the server instead, silently.

## M3b ☐ Workout types (functional, CrossFit, Pilates…) — `feature/m3b-workout-types`
Plan: "סוגי אימון: פונקציונלי, קרוספיט, פילאטיס ועוד". Independent of M1–M3; can be pulled earlier.
- New exercise kind `session` next to `strength` and `cardio` inside the existing `workouts` doc (old workouts untouched): `{ kind: 'session', typeId, name, durationSec, rpe (1–10), avgHr?, place?, fields: {…type-specific}, notes }`. A workout can mix kinds (e.g. CrossFit with a strength part).
- Built-in type definitions in code (functional, crossfit, pilates, yoga, swim, studio, sport, ski) with their fields per the plan; user-defined types in `users/{uid}/workoutTypes/{auto}` built from a field palette (duration, distance, rounds, reps, weight, result time, level, picklist, text).
- Quick log: pick type → fields prefilled from the last workout of the same type.
- Burn: kcal = MET(type, rpe) × bodyweight kg × hours, MET table in `js/lib/rules.js`; feeds the existing calories-out calculation.
- **No double counting:** outdoor walks/runs (`inputMode: 'free'`) are already in the phone's steps, so they add 0 workout kcal (history and streaks only). Treadmill, bike and session types do count.
- PRs: same-name CrossFit WOD (faster time / more rounds+reps); functional: more rounds in the same format. History labels by type; progress chart per type.
- Document the new kind in `docs/DATA.md` so the coach can log Pilates/CrossFit from chat.

## M4 ☐ Points, levels and reward moments — `feature/m4-rewards`
Plan: "שלב 2: תכנית התגמול" (all subsections except "לאורך זמן").
- Data: `users/{uid}/pointsLedger/{auto}` — one entry per award: `{ date, source: sleep|habit|meal|workout|..., ref, points, reason }`. Level, totals, streaks and badges are **derived** from the ledger (never stored as the only copy).
- Daily cap, partial ("close") scoring, no negative points.
- Moments: +10 float and ring fill on log, day-close summary card, perfect-day confetti (small library from cdnjs or hand-rolled), badge toast, level-up full screen. Vibration on Android; iOS fallback = sound + animation.
- Progress screen: 7-day grid per area, streaks, badge shelf, level road with the real reward at the end.

## M5 ☐ Habit wizard + bad habits — `feature/m5-wizard`
Plan: "הגדרת הרגל: אשף של 6 שאלות", "הרגלים רעים: אשף גמילה".
- 6-step wizard, one question per screen, templates (reading, morning routine, English, screen time, water, meditation).
- Bad-habit mode: trigger, replacement, friction, measure (clean day | limit | slip counter). "מעדתי" one-tap button logging the time. Separate "להיגמל" section on Today with a clean-days chain.
- Scoring per the plan (clean day 10, honest slip log 2, weekly bonus 20).

## M6 ☐ Tasks page — `feature/m6-tasks`
Plan: "דף המשימות", "מניעת דחיינות".
- Data: `users/{uid}/tasks/{auto}`: title, type (daily | recurring | one-off), recurrence, area, owner (me | assistant | shared), complexity (S/M/L), important (bool), dueDate, timing (exact | day | this week | let Claude decide), scheduledAt, status, postponeCount, firstStep, createdAt, `calendarEventId` (null until M7), `source`.
- Views: today, Eisenhower matrix, week/all with filters. Quick capture via + (free text → inbox).
- Procrastination ladder computed from `createdAt`/`postponeCount`: 1 week → orange "מחכה שבוע", 2 weeks → "why stuck?" quick answers, 3 weeks → forced decision (schedule / someday / delete). Max 3 important tasks per day. Top 3 tasks shown on Today.

## M6b ☐ Decisions — "להחליט" — `feature/m6b-decisions`
Plan: "קבלת החלטות: "להחליט"". Built for Maya: the problem is the time indecision burns, so everything is built around a time budget.
- **Fully offline and self-contained:** all steps, timers, scoring and math run in client code on the Firestore local cache. No network, no Claude, no server needed. Claude may read open decisions later, but nothing depends on it.
- Data: `users/{uid}/decisions/{auto}` (question, track small|medium|large, options, criteria + weights, goodEnough threshold, budgetSec, decideBy, startedAt, decidedAt, choice, reason, feeling, reviewAt, outcome) and `users/{uid}/decisionRules/{auto}` (personal rules, e.g. "restaurant: first good-looking option").
- Triage: two questions (reversible? matters in a year?) → track; user can override.
- Small: visible 2-minute timer → coin flip + "how did it feel?". Medium: 2–4 options, ≤3 weighted criteria, good-enough bar, 10-10-10, computed suggestion; budget 10 min / decide by tomorrow. Large: WRAP steps, premortem, small experiment, decideBy date (default 1 week), "החלטתי" button on every step.
- Scoring (all in `js/lib/rules.js`): on time small 5 / medium 15 / large 40; late 2 / 5 / 10; no re-open +5; used a rule +3; new rule +10; review logged 3; "decides on time" streak with badges at 5/20/50. Never points for being "right", never a penalty. Points go to the ledger once M4 exists; until then store them on the decision.
- Open decisions list with the procrastination ladder from M6 (1 week no date → orange "תקבעי תאריך החלטה"; 2 weeks → "what's missing?"). Nearest decision on Today. Review reminder after 1 month (medium) / 3 months (large).
- Done when: a small decision can be made start-to-finish in airplane mode within 2 minutes, a medium one is scored on/late correctly at the boundary (unit test), and DATA.md documents both collections.

## M7 ☐ Google Calendar sync from the app — `feature/m7-calendar`
Plan: "חיבור ליומן גוגל" in "מענה טכני", "סנכרון עם היומן".
- Request the extra `calendar.events` scope at Google sign-in (incremental consent). Create/update/delete an event when a task with a time is saved/moved/done/cancelled; store the event id on the task; mark events with a private extended property `{ gymi: true, taskId }`.
- Only touch events linked to a task. Works while the app is open; failures queue and retry on next open.

## M8 ☐ Settings — "התכנית שלי" — `feature/m8-my-plan`
Plan: "מסך ההגדרות: "התכנית שלי"".
- Sections: goals, sleep, habits, training, nutrition, body, routine, rewards, notifications, assistant. Change history (`users/{uid}/planHistory`). Assistant suggestion cards (approve/decline).
- Life plan (plan: "שאלון חיים ותכנית אב"): `users/{uid}/lifePlan` (planDepth basic|goals|full, areas, goals with horizon 3m|1y|3-5y and A/B/C, reviewRhythm, lastOfferedAt, declinedCount). Level 2 (goals) and level 3 (full plan) forms, every question skippable, "later" keeps partial answers, deepen one area at a time. Per-area recommendation templates in code (`js/lib/plan-templates.js`) that create a habit/task in one tap — work offline, no Claude needed.

## M9 ☐ Push notifications — `feature/m9-push`
Plan: "שלב 3: התראות פוש", "שרת קטן" in "מענה טכני".
- Web Push (VAPID) subscription stored per device; Vercel serverless function to send; scheduled check every 15 min from GitHub Actions. Rules: only when something is missing, max 4/day, quiet hours, quiet Saturday, merge multiple reminders.

## M10 ☐ Signup and profile — `feature/m10-onboarding`
Plan: "שלב 4", "שאלון חיים ותכנית אב" (level 1). Questionnaire on first login (level 1 only is required; ends with "set goals now / later / never" → `lifePlan.planDepth`); personal BMR (Mifflin-St Jeor) replaces the hard-coded 1950; targets from the goal; remove `weddingDate`.

## M11 ☐ Claude connector (MCP) — `feature/m11-mcp`
Plan: "שלב 5". Vercel function, hashed personal keys, per-user tools incl. "what changed since last check".

## M12 ☐ "קלוד" instructions page — `feature/m12-claude-page`
Plan: "שלב 6", and the "ליזום, לא לחייב" rules in "שאלון חיים ותכנית אב": Claude reads `planDepth` and never assumes more; offers to go deeper at natural moments, max once a month; stops after two declines until asked; full-plan users get full initiative.

## Later
"לאורך זמן" (graduating habits, seasons, monthly recalibration, vacation mode), Garmin (שלב 7), pilot (שלב 8).
