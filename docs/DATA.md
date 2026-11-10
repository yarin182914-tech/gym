# GYM.SITE data format

The exact shape of everything the app stores in Firestore (project
`gym-site-ea1b7`), for anything that reads or writes it from outside the app
— e.g. the life-management project, via its service account.

A document written in any other shape may not show up in the app, or may
break a screen. When in doubt, copy one of the examples below.

All personal data lives under `users/{uid}/`. `{uid}` is the user's Firebase
Auth UID (Firebase Console → Authentication → Users). It is not kept in this
public repo.

| Collection | Doc id | What |
|---|---|---|
| `users/{uid}/workouts` | auto | Strength and cardio workouts |
| `users/{uid}/exerciseLibrary` | auto | The strength-exercise quick-pick list |
| `users/{uid}/nutritionEntries` | auto | Meals |
| `users/{uid}/bodyWeight` | `yyyy-mm-dd` | One weigh-in per day |
| `users/{uid}/dailyActivity` | `yyyy-mm-dd` | Calories out, one per day — also the day's calorie target |
| `users/{uid}` (the doc itself) | — | Settings, e.g. the default calorie target |
| `users/{uid}/plannedWorkouts` | `yyyy-mm-dd` | The coach's proposed workout, one per day |
| `users/{uid}/sleep` | `yyyy-mm-dd` (the **morning**) | One night's sleep |
| `users/{uid}/habits` | auto | The user's habits (definitions) |
| `users/{uid}/habitLogs` | `yyyy-mm-dd` | Which habits were done that day |
| `siteFeedback` (top level) | auto | App feedback board — don't write here |

---

## Conventions that apply everywhere

- **Time zone is Israel (`Asia/Jerusalem`).** The app buckets everything by
  the *local* calendar day. A server running in UTC must build timestamps in
  Israel time — a meal eaten at 01:00 on the 5th is `04T22:00Z`, and written
  naively as `05T01:00Z` it lands on the wrong day around midnight.
- **Timestamps are Firestore `Timestamp`s**, never strings or millis — except
  `bodyWeight.date`, which is a `yyyy-mm-dd` string.
- **"No time of day" = local noon.** A day picked without a time is stored as
  12:00:00.000 local time. Use noon whenever only the date is known.
- **Numbers are numbers** (`78.5`, not `"78.5"`). Hebrew text is stored as-is.
- **Mark what you wrote:** set `source: 'coach'` on documents you create
  (nutrition entries have a real `source` field; on workouts and weigh-ins
  it's an extra field the app ignores but keeps).

---

## Nutrition — `users/{uid}/nutritionEntries/{auto}`

One document per meal (or per item, if logged separately — the day's totals
are just the sum).

| Field | Type | Notes |
|---|---|---|
| `date` | Timestamp | When it was eaten. Date only → local noon. |
| `mealType` | string | `breakfast` · `lunch` · `dinner` · `snack`, or any free Hebrew text ("אחר") |
| `description` | string | What was eaten, Hebrew, e.g. `"חזה עוף 200 ג׳, אורז, סלט"` |
| `calories` | number | kcal, rounded to an integer |
| `proteinG` | number | grams, 1 decimal at most |
| `carbsG` | number | grams |
| `fatG` | number | grams |
| `source` | string | `manual` (typed in the app) · `photo` (the app's photo flow) · `coach` (written from outside) |

```json
{
  "date": "Timestamp(2026-11-03 13:40 Asia/Jerusalem)",
  "mealType": "lunch",
  "description": "חזה עוף 200 ג׳, אורז לבן 150 ג׳, סלט ירקות",
  "calories": 640,
  "proteinG": 52,
  "carbsG": 68,
  "fatG": 14,
  "source": "coach"
}
```

---

## Body weight — `users/{uid}/bodyWeight/{yyyy-mm-dd}`

**The doc id is the local date.** Writing the same day again replaces it
(use `set`, not `add`) — there is never more than one weigh-in per day.

| Field | Type | Notes |
|---|---|---|
| `date` | string | Same `yyyy-mm-dd` as the doc id |
| `kg` | number | Up to 2 decimals, e.g. `78.45` |
| `note` | string | Usually `""` |
| `loggedAt` | Timestamp | When it was saved (server timestamp) |

```json
// users/{uid}/bodyWeight/2026-11-03
{ "date": "2026-11-03", "kg": 78.4, "note": "", "loggedAt": "serverTimestamp()", "source": "coach" }
```

---

## Daily activity (calories out) — `users/{uid}/dailyActivity/{yyyy-mm-dd}`

**The doc id is the local date**, like body weight: one document per day,
and writing the day again replaces it (use `set`). Nutrition's
"נכנס מול יוצא" card shows the day's eaten calories against
`totalOutKcal`, plus the average of the last 7 days that have both.

**`totalOutKcal` also sets that day's calorie target**: `totalOutKcal −
calorieDeficit` (from the user doc, below; `250` by default) — the ring on
the nutrition screen and the target line on its trend chart. Days with no
`dailyActivity` doc use `calorieTarget` from the user doc instead.

| Field | Type | Notes |
|---|---|---|
| `date` | string | Same `yyyy-mm-dd` as the doc id |
| `steps` | number | Steps that day (iPhone), `0` if unknown |
| `baseKcal` | number | Resting + daily life, currently `1950` (Mifflin BMR × 1.2) |
| `stepsKcal` | number | `round(steps × 0.04)` |
| `workoutKcal` | number | Strength ≈ 250 kcal/hour of the workout; `0` if none |
| `totalOutKcal` | number | `baseKcal + stepsKcal + workoutKcal` — what the app shows |
| `note` | string | Usually `""` |
| `loggedAt` | Timestamp | When it was saved (server timestamp) |
| `source` | string | `coach` (written from outside) · `manual` (typed in the app) · `shortcut` (steps from the iPhone, see below) |

All the kcal fields are integers. Keep `totalOutKcal` equal to the sum —
the app trusts it as-is. `baseKcal` and the `0.04` per step live in
`ACTIVITY` in `js/lib/rules.js`.

**Steps from the iPhone (`source: "shortcut"`).** An iOS Shortcut reads
the day's steps from Apple Health and opens the app at

```
https://gym-yarin9.vercel.app/#/import?steps=12450&date=2026-11-09
```

- `steps`: a whole number `0`–`100000` (thousands separators allowed).
- `date`: `yyyy-mm-dd`, the phone's date when the shortcut runs. Optional
  (defaults to today in `Asia/Jerusalem`), but the shortcut always sends
  it, so a run that lands after midnight still counts for the right day.
  Up to 7 days back, never in the future.
- Anything else → a toast, nothing written.

The app **merges** into the day's doc (`set` with merge), keeping `note`
and the doc's own `baseKcal` / `workoutKcal` (defaults `1950` / `0`), and
recomputes `stepsKcal` and `totalOutKcal`. **Steps never go down**: a
number at or below what's stored writes nothing, so a midday run can't
undo the evening's count and the same URL twice changes nothing. Signed
out, the request waits in the browser (`localStorage`) and runs after
sign-in. The "חיבורים" screen shows the newest `loggedAt` among
`shortcut` days as the last sync. Limits: `STEPS_IMPORT` in
`js/lib/rules.js`.

```json
// users/{uid}/dailyActivity/2026-11-04
{ "date": "2026-11-04", "steps": 14000, "baseKcal": 1950, "stepsKcal": 560,
  "workoutKcal": 310, "totalOutKcal": 2820, "note": "", "loggedAt": "serverTimestamp()", "source": "coach" }
```

---

## User settings — `users/{uid}` (the user doc itself)

| Field | Type | Notes |
|---|---|---|
| `calorieDeficit` | number | kcal to stay under the day's burn: the target is `totalOutKcal − calorieDeficit`. `250` when missing; `0` allowed. |
| `calorieTarget` | number | Calorie target for days with no `dailyActivity` doc. `2000` when missing. |
| `proteinTarget` | number | Daily protein, grams. `140` when missing. |
| `carbsTarget` | number | Daily carbs, grams. `250` when missing. |
| `fatTarget` | number | Daily fat, grams. `65` when missing. |

All integers, all set in the app's "יעדים" sheet (tap the line under the
calorie ring on the nutrition screen), which writes them with `merge`.

Sleep settings (set in the sleep card's ⚙ sheet; see "Sleep" below for how
they're applied):

| Field | Type | Notes |
|---|---|---|
| `sleepBedtimeTarget` | string | `'hh:mm'`, asleep by this → on time. `'22:30'` when missing. |
| `sleepBedtimeLatest` | string | `'hh:mm'`, asleep by this → close (partial). `'23:00'` when missing. |
| `sleepWakeTime` | string | `'hh:mm'`, the usual wake time — only prefills the clock, never judged. `'06:30'` when missing. |
| `sleepMinHours` | number | Minimum hours asleep. `8` when missing. |
| `sleepFlexibleNights` | number[] | **Weekdays of the EVENING** a night starts (`0` Sunday … `6` Saturday) on which only the duration counts. `[4, 5]` = Thursday and Friday nights when missing. |
| `sleepBedtimeByWeekday` | map | Optional, **evening weekday** → `'hh:mm'` target for that night, e.g. `{ "6": "23:00" }`; the latest bedtime keeps the usual gap after it. |

Habits:

| Field | Type | Notes |
|---|---|---|
| `habitsSeeded` | boolean | `true` once the app has created the three example habits (or found the user already had habits). Stops the examples coming back after they're deleted. Don't change it. |

The doc has other fields (`displayName`, `createdAt`…) — update only the
field you mean to change (`set` with `merge: true`, or `update`), never
overwrite the whole doc.

---

## Workouts — `users/{uid}/workouts/{auto}`

| Field | Type | Notes |
|---|---|---|
| `date` | Timestamp | Same value as `startTime` |
| `startTime` | Timestamp | Start. Date only → local noon. |
| `endTime` | Timestamp | End. `startTime` + duration. Duration shown in History = end − start. |
| `noTime` | boolean | `true` when the time of day isn't known (start is then noon) |
| `notes` | string | Usually `""` |
| `exercises` | array | See below. Never empty. |
| `planId` | string | Only on a workout started from the coach's plan: that `plannedWorkouts` doc id (`yyyy-mm-dd`). Set by the app; History tags the workout "לפי תוכנית". |

An exercise is either **strength** or **cardio**. History labels a workout
by what it contains: only cardio → "ריצה" / "הליכה" etc., only strength →
"כוח", both → "כוח + ריצה".

### Strength exercise

```json
{
  "name": "לחיצת חזה",
  "category": "חזה",
  "sets": [ /* sets, below */ ]
}
```

- `name` must match an `exerciseLibrary` entry **exactly** (same spelling,
  spaces, parentheses). Progress charts and records are keyed by name —
  "לחיצת חזה " with a trailing space is a different exercise with no
  history. Read `exerciseLibrary` first; if it's genuinely a new exercise,
  add it there too (below).
- `category` is copied from that library entry.

A **set**:

| Field | Type | Notes |
|---|---|---|
| `setNumber` | number | 1, 2, 3… in order, across the whole exercise |
| `type` | string | `working` (regular) · `warmup` · `dropset` (a drop-set stage) |
| `weight` | number | In `weightUnit`. Bodyweight exercises: `0`. |
| `weightUnit` | string | `kg` · `lb` |
| `weightMode` | string | `total` (the whole bar/stack) · `perSide` (one dumbbell / one side of the bar) — take the library entry's `defaultWeightMode` |
| `reps` | number | |
| `notes` | string | Usually `""` |
| `dropGroup` | number | Drop sets only — see below |

**Drop sets:** the first set of the drop set is a normal `working` set; each
stage after it is a `dropset` set. All of them carry the same `dropGroup`
number (1 for the exercise's first drop set, 2 for the next…). Sets that
aren't part of a drop set have no `dropGroup` at all.

```json
{
  "name": "כפיפת מרפק (בייספס)",
  "category": "יד קדמית",
  "sets": [
    { "setNumber": 1, "type": "warmup",  "weight": 8,  "weightUnit": "kg", "weightMode": "perSide", "reps": 12, "notes": "" },
    { "setNumber": 2, "type": "working", "weight": 14, "weightUnit": "kg", "weightMode": "perSide", "reps": 10, "notes": "" },
    { "setNumber": 3, "type": "working", "weight": 14, "weightUnit": "kg", "weightMode": "perSide", "reps": 8,  "notes": "", "dropGroup": 1 },
    { "setNumber": 4, "type": "dropset", "weight": 10, "weightUnit": "kg", "weightMode": "perSide", "reps": 8,  "notes": "", "dropGroup": 1 },
    { "setNumber": 5, "type": "dropset", "weight": 6,  "weightUnit": "kg", "weightMode": "perSide", "reps": 10, "notes": "", "dropGroup": 1 }
  ]
}
```

### Cardio exercise

Cardio activities are built into the app — they are **not** in
`exerciseLibrary`. Use exactly these:

| `activity` | `name` | `effort` values | Segment fields |
|---|---|---|---|
| `walk` | `הליכה` | `easy` · `moderate` · `fast` | free: `durationSec`, `distanceKm`, `paceSec` · treadmill: `durationSec`, `speedKmh`, `inclinePct` |
| `run` | `ריצה` | `easy` · `moderate` · `hard` | same as walk |
| `stairs` | `מדרגות` | — | `durationSec`, `level` |
| `bike` | `אופניים` | — | `durationSec`, `level`, `speedKmh` |

```json
{
  "name": "ריצה",
  "category": "אירובי",
  "kind": "cardio",
  "activity": "run",
  "inputMode": "free",
  "sets": [ /* segments, below */ ]
}
```

- `category` is always `"אירובי"`, `kind` always `"cardio"`.
- `inputMode` (walk/run only): `free` (outdoors — time/distance/pace) or
  `treadmill` (time/speed/incline). Leave it out for stairs/bike.

A **segment** (one continuous stretch — a whole run is usually one segment;
intervals are several). Write only the values that are known — never
`null`, just leave the key out:

| Field | Type | Notes |
|---|---|---|
| `setNumber` | number | 1, 2, 3… |
| `durationSec` | number | Seconds |
| `distanceKm` | number | |
| `paceSec` | number | Seconds per km (5:30 /km → `330`) |
| `speedKmh` | number | |
| `inclinePct` | number | Treadmill |
| `level` | number | Stairs / bike machine level |
| `effort` | string | From the table above |
| `notes` | string | Usually `""` |
| `calc` | object | Derived totals — see below |

`calc` fills in what follows from the entered values (any two of time,
distance and speed/pace give the third; pace = 3600 / speed):
`{ durationSec (0 dp), distanceKm (3 dp), speedKmh (2 dp), paceSec (0 dp) }`,
`null` for anything that can't be worked out.

### Example: an outdoor run, time and distance known

```json
{
  "date":      "Timestamp(2026-11-03 07:10 Asia/Jerusalem)",
  "startTime": "Timestamp(2026-11-03 07:10 Asia/Jerusalem)",
  "endTime":   "Timestamp(2026-11-03 07:38 Asia/Jerusalem)",
  "noTime": false,
  "notes": "",
  "source": "coach",
  "exercises": [
    {
      "name": "ריצה",
      "category": "אירובי",
      "kind": "cardio",
      "activity": "run",
      "inputMode": "free",
      "sets": [
        {
          "setNumber": 1,
          "durationSec": 1680,
          "distanceKm": 5,
          "effort": "moderate",
          "notes": "",
          "calc": { "durationSec": 1680, "distanceKm": 5, "speedKmh": 10.71, "paceSec": 336 }
        }
      ]
    }
  ]
}
```

### Example: a walk, date only

```json
{
  "date":      "Timestamp(2026-11-02 12:00 Asia/Jerusalem)",
  "startTime": "Timestamp(2026-11-02 12:00 Asia/Jerusalem)",
  "endTime":   "Timestamp(2026-11-02 12:45 Asia/Jerusalem)",
  "noTime": true,
  "notes": "",
  "source": "coach",
  "exercises": [
    {
      "name": "הליכה", "category": "אירובי", "kind": "cardio", "activity": "walk", "inputMode": "free",
      "sets": [
        { "setNumber": 1, "durationSec": 2700, "distanceKm": 4.2, "notes": "",
          "calc": { "durationSec": 2700, "distanceKm": 4.2, "speedKmh": 5.6, "paceSec": 643 } }
      ]
    }
  ]
}
```

---

## Sleep — `users/{uid}/sleep/{yyyy-mm-dd}`

One document per night. **The doc id is the MORNING's local date** — the
night of Thursday into Friday is `…/sleep/<Friday>`. Writing the night again
replaces it (`set` with `merge`, keeping `createdAt`).

**Two different days, on purpose:** the record is keyed by the morning,
but the rules follow the **evening** the night starts on.
`sleepFlexibleNights` and `sleepBedtimeByWeekday` (user settings, above)
are evening weekdays: with `[4, 5]`, the flexible nights are the ones
*starting* Thursday and Friday evening — stored under Friday's and
Saturday's dates.

| Field | Type | Notes |
|---|---|---|
| `date` | string | Same `yyyy-mm-dd` as the doc id (the morning) |
| `bedtime` | Timestamp | Fell asleep. Usually the evening before; past midnight it's on the morning's date (00:30 → the morning itself). |
| `wakeTime` | Timestamp | Woke up — always on the morning's date, a lie-in past 12:00 included. |
| `durationMin` | number | `wakeTime − bedtime`, whole minutes. |
| `source` | string | `manual` (logged in the app) · `coach` (written from outside) |
| `createdAt` | Timestamp | First saved |
| `updatedAt` | Timestamp | Last saved |

How a night is judged (js/lib/sleep.js, numbers in js/lib/rules.js):
- **Bedtime** (skipped on a flexible night): by `sleepBedtimeTarget` →
  full; by `sleepBedtimeLatest` → close; later → miss.
- **Duration**: `sleepMinHours` or more → full; up to 30 min short →
  close; under 6 hours → always miss.
- The wake time itself is never judged — after a late night, sleeping in
  to reach the minimum is the point.

```json
// users/{uid}/sleep/2026-11-13  — Thursday night, into Friday the 13th (a flexible night)
{ "date": "2026-11-13", "bedtime": "Timestamp(2026-11-13 00:40 Asia/Jerusalem)",
  "wakeTime": "Timestamp(2026-11-13 08:50 Asia/Jerusalem)", "durationMin": 490,
  "source": "coach", "createdAt": "serverTimestamp()", "updatedAt": "serverTimestamp()" }
```

---

## Habits — `users/{uid}/habits/{auto}`

One document per habit — what it is and what counts as done. Shown on the
"היום" screen, where it's marked. A new user gets three example habits
(`source: 'example'`) they can edit or delete.

| Field | Type | Notes |
|---|---|---|
| `name` | string | Hebrew, short — `"קריאה"` |
| `icon` | string | A Lucide icon name the app knows (`book-open`, `footprints`, `phone-off`, `droplet`, `brain`, `heart`, `languages`, `apple`, `leaf`, `moon`, `sun`, `dumbbell`, `pencil`, `sparkles`, `check`). Unknown → a check mark. |
| `area` | string | `body` (גוף) · `personal` (אישי) · `relationship` (זוגיות) · `career` (קריירה) |
| `schedule` | map | `{ "type": "daily" }` · `{ "type": "weekly", "perWeek": 3 }` (any 3 days a week) · `{ "type": "days", "days": [1, 3] }` (fixed weekdays, `0` Sunday … `6` Saturday) |
| `measure` | string | `yesno` · `quantity` (at least N) · `limit` (at most N) · `steps` (a routine checklist — stored, not editable in the app until the habit wizard) |
| `unit` | string | `"דקות"`, `"עמודים"`, `"פעמים"`, `"צעדים"`… |
| `full` | number \| null | The ideal. `quantity`: at least this; `limit`: at most this; `yesno`: just describes it (e.g. `30` minutes). |
| `short` | number \| null | The minimum that still counts ("מקוצר"). `quantity`: less than `full`; `limit`: more than `full`. `null` = no short level — on a `yesno` habit one tap marks it done. |
| `steps` | string[] | Only for `measure: 'steps'` — the routine's steps. |
| `autoSource` | string \| null | `"dailyActivity.steps"` — the day's level comes from `steps` in that day's `dailyActivity` doc (see below); `null` — marked by hand. |
| `active` | boolean | `false` = paused (kept, not counted). |
| `order` | number | Position on the screen, smallest first. |
| `source` | string | `manual` (added in the app) · `example` (the starter habits) · `coach` (written from outside) |
| `createdAt` | Timestamp | First saved |
| `updatedAt` | Timestamp | Last saved |

**`autoSource: "dailyActivity.steps"`** — steps are logged once, in
`dailyActivity/{date}.steps`, and the habit reads them: steps ≥ `full` →
full, ≥ `short` → short, less → none (shown grey). `0` or no doc = not known
yet, nothing shown. **Don't also write the steps into `habitLogs`** — a
mark there is a manual override and wins over the steps (the user's
"מלא" tap, say); deleting the mark brings the automatic count back.

```json
// users/{uid}/habits/<auto id>
{ "name": "צעדים", "icon": "footprints", "area": "body",
  "schedule": { "type": "daily" }, "measure": "quantity", "unit": "צעדים",
  "full": 8000, "short": 5000, "autoSource": "dailyActivity.steps",
  "active": true, "order": 1, "source": "example",
  "createdAt": "serverTimestamp()", "updatedAt": "serverTimestamp()" }
```

---

## Habit logs — `users/{uid}/habitLogs/{yyyy-mm-dd}`

One document per local day, holding **every habit's mark for that day** in
one map. A habit with no key that day isn't marked (on an N-per-week habit
that's not a miss — only the week's total counts).

| Field | Type | Notes |
|---|---|---|
| `date` | string | Same `yyyy-mm-dd` as the doc id |
| `habits` | map | habit doc id → mark (below) |
| `updatedAt` | Timestamp | Last saved |

A mark:

| Field | Type | Notes |
|---|---|---|
| `level` | string | `full` · `short` · `none` (logged, but below the short level — shown grey, never red) |
| `value` | number \| null | The number, when one was given (`7` minutes read); `null` after a plain מלא / מקוצר tap |
| `source` | string | `manual` (marked in the app) · `coach` (written from outside) |

Streaks are computed from these docs, never stored: daily habits in days,
fixed-weekday habits over their own days (other days are skipped), and
N-per-week habits in weeks (Sunday–Saturday) that reached N.

**Writing one mark — touch only that habit's key.** Other habits'
marks for the same day must survive. Always write the whole mark (`level`,
`value`, `source`) so nothing from an earlier mark lingers:

```js
// Node, firebase-admin. Works whether or not the day's doc exists yet.
const day = db.doc(`users/${uid}/habitLogs/2026-11-09`);
await day.set({
  date: '2026-11-09',
  habits: { [habitId]: { level: 'full', value: 20, source: 'coach' } },
  updatedAt: FieldValue.serverTimestamp(),
}, { merge: true });

// Or, only if the day's doc already exists (update() fails otherwise):
await day.update({ [`habits.${habitId}`]: { level: 'full', value: 20, source: 'coach' } });
```

- In `set(..., { merge: true })` the habit id goes **inside a nested
  `habits` map**. A key spelled `"habits.<id>"` in `set()` is stored as a
  literal field with a dot in its name — the app never sees it. The dotted
  path only means "this key inside the map" in `update()`.
- **Never** `set()` the day without `merge` — that wipes every other
  habit's mark for the day.
- To clear a mark: `update({ ['habits.' + habitId]: FieldValue.delete() })`.
- Python (`google-cloud-firestore`): the same, with
  `day.set({...}, merge=True)` and `day.update({f"habits.{habit_id}": {...}})`.

```json
// users/{uid}/habitLogs/2026-11-09 — reading done in full by tapping, 6,200 steps came from dailyActivity (no key)
{ "date": "2026-11-09",
  "habits": {
    "Xk2…readingId": { "level": "full", "value": null, "source": "manual" },
    "Pq7…phoneId":   { "level": "short", "value": null, "source": "coach" } },
  "updatedAt": "serverTimestamp()" }
```

---

## Planned workouts ("אימון מומלץ") — `users/{uid}/plannedWorkouts/{yyyy-mm-dd}`

The coach's proposal for a day. **The doc id is the local date**, one per
day; writing the day again replaces it (use `set`). On that day, while no
workout is open, the workout screen shows it as a card. The user can change
any set's weight/reps, add or remove sets, and swap, add, remove or reorder
exercises, then starts it, skips it, or ignores it for a free workout. A plan
for any other date is never shown.

| Field | Type | Notes |
|---|---|---|
| `date` | string | Same `yyyy-mm-dd` as the doc id |
| `title` | string | Short, e.g. `"גב + רגליים"` — also the workout's tab name |
| `coachNotes` | string | The coach's explanation, free Hebrew text (line breaks kept) |
| `exercises` | array | **Exactly the workout exercise shape above** — strength: `name`, `category`, `sets` (`setNumber`, `type`, `weight`, `weightUnit`, `weightMode`, `reps`, `notes`, optional `dropGroup`); cardio: as in Workouts. Plus optional `reason` per exercise. |
| `exercises[].reason` | string | Optional, one short line, e.g. `"שבוע שעבר 10×60 בכל הסטים → עולים ל-62.5"` |
| `status` | string | `proposed` (write this) → `started` · `done` · `skipped` (the app sets these) |
| `source` | string | `coach` |
| `createdAt` | Timestamp | When written |
| `updatedAt` | Timestamp | Last change (the app updates it on every status change) |
| — set by the app — | | |
| `startedExercises` | array | What was actually started, after the user's changes (same shape as `exercises`). `exercises` itself is never changed. |
| `edited` | boolean | `true` when the user changed anything before starting |
| `workoutId` | string | Once the workout is saved (`status: 'done'`): its `workouts` doc id |

Rules for the coach:
- Write `status: 'proposed'`. Don't overwrite a day whose `status` is
  already `started` or `done`.
- Exercise names must match `exerciseLibrary` character for character,
  like any workout (see Workouts above); `category` from the same entry.
- `weightMode` / `weightUnit` from the library entry's defaults.
- Deleting a workout that was started from the plan puts the plan back to
  `proposed`. "אימון חופשי" leaves it `proposed`.

```json
// users/{uid}/plannedWorkouts/2026-11-06
{
  "date": "2026-11-06",
  "title": "גב + רגליים",
  "coachNotes": "שבוע שני של עלייה. אם הסט האחרון בחתירה מרגיש קשה — להישאר על 60.",
  "source": "coach",
  "status": "proposed",
  "createdAt": "serverTimestamp()",
  "updatedAt": "serverTimestamp()",
  "exercises": [
    {
      "name": "חתירה בישיבה",
      "category": "גב",
      "reason": "שבוע שעבר 10×60 בכל הסטים → עולים ל-62.5",
      "sets": [
        { "setNumber": 1, "type": "warmup",  "weight": 40,   "weightUnit": "kg", "weightMode": "total", "reps": 12, "notes": "" },
        { "setNumber": 2, "type": "working", "weight": 62.5, "weightUnit": "kg", "weightMode": "total", "reps": 10, "notes": "" },
        { "setNumber": 3, "type": "working", "weight": 62.5, "weightUnit": "kg", "weightMode": "total", "reps": 10, "notes": "" }
      ]
    },
    {
      "name": "סקוואט",
      "category": "רגליים",
      "sets": [
        { "setNumber": 1, "type": "working", "weight": 80, "weightUnit": "kg", "weightMode": "total", "reps": 8, "notes": "" },
        { "setNumber": 2, "type": "working", "weight": 80, "weightUnit": "kg", "weightMode": "total", "reps": 8, "notes": "" }
      ]
    }
  ]
}
```

---

## Exercise library — `users/{uid}/exerciseLibrary/{auto}`

The strength-exercise list the app's picker shows. Read it to get exact
names; add to it only for a genuinely new exercise.

| Field | Type | Notes |
|---|---|---|
| `name` | string | Hebrew, unique — compared with spaces and case ignored; the app refuses a second entry with the same name, so check before adding |
| `category` | string | One of `חזה` · `כתפיים` · `יד אחורית` · `בטן` · `גב` · `רגליים` · `יד קדמית` |
| `defaultUnit` | string | `kg` |
| `defaultWeightMode` | string | `total` · `perSide` |
| `isCustom` | boolean | `true` for anything added later |
| `note` | string, optional | A standing note on the exercise (which machine, seat height…). Shown under the name in every workout and in "פעם קודמת". Missing or `''` = no note |

---

## Rules for writing from outside the app

1. **Show, then write.** Before every write, show the user exactly what will
   be saved (in plain Hebrew: day, meal/activity, numbers) and wait for an
   explicit yes. There is no undo.
2. **Create, don't edit.** Add new documents. Changing or deleting an
   existing one only when the user asks for that specific document.
   Never bulk-update or bulk-delete.
3. **Check for duplicates first.** Before adding a meal or a workout, read
   that day's entries; if something similar is already there, ask.
4. **Strength exercise names come from `exerciseLibrary`**, character for
   character. Cardio uses the built-in table above.
5. **Israel time** for every timestamp; noon when only the date is known.
6. **Estimate, and say so.** Meal macros from a photo or a description are
   estimates — state the assumed portions so the user can correct them
   before saving.
7. Stay inside `users/{uid}/`. Never touch `siteFeedback` or other users.
