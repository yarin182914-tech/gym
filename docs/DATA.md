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
| `users/{uid}/workouts` | auto | Workouts: strength, cardio and sessions (Pilates, CrossFit…) |
| `users/{uid}/exerciseLibrary` | auto | The strength-exercise quick-pick list |
| `users/{uid}/workoutTypes` | auto | Workout types the user built ("סוג משלך") |
| `users/{uid}/nutritionEntries` | auto | Meals |
| `users/{uid}/bodyWeight` | `yyyy-mm-dd` | One weigh-in per day |
| `users/{uid}/dailyActivity` | `yyyy-mm-dd` | Calories out, one per day — also the day's calorie target |
| `users/{uid}` (the doc itself) | — | Settings, e.g. the default calorie target |
| `users/{uid}/plannedWorkouts` | `yyyy-mm-dd` | The coach's proposed workout, one per day |
| `users/{uid}/sleep` | `yyyy-mm-dd` (the **morning**) | One night's sleep |
| `users/{uid}/habits` | auto | The user's habits (definitions) |
| `users/{uid}/habitLogs` | `yyyy-mm-dd` | Which habits were done that day |
| `users/{uid}/tasks` | auto | Tasks: one-off, daily and repeating ("משימות") |
| `users/{uid}/decisions` | auto | Decisions, open and decided ("להחליט") |
| `users/{uid}/apiKeys` | sha-256 of the key's secret | Personal keys for sending data from outside (the steps shortcut) — app only |
| `users/{uid}/appUsage` | `yyyy-mm-dd` | Minutes in apps (Instagram, TikTok, any app the user picked), from the iPhone shortcut — server only |
| `users/{uid}/appSessions` | the app id (`instagram`, `c-strava`) | The app's open session, if any — server only |
| `users/{uid}/pointsLedger` | `{date}_{rule}[_{ref}]` | Points, one entry per award — app only, never written from outside |
| `mcpKeys` (top level) | SHA-256 of the key | Claude connector keys → their user — app and server only, never written from outside |
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
| `workoutKcal` | number | The day's workouts, summed by the app — **never write it** (below); `0` if none |
| `totalOutKcal` | number | `baseKcal + stepsKcal + workoutKcal` — what the app shows |
| `note` | string | Usually `""` |
| `loggedAt` | Timestamp | When it was saved (server timestamp) |
| `source` | string | `coach` (written from outside) · `manual` (typed in the app) · `shortcut` (steps from the iPhone, see below) · `workouts` (a day the app created only for a workout's burn) |

All the kcal fields are integers. Keep `totalOutKcal` equal to the sum —
the app trusts it as-is. `baseKcal` and the `0.04` per step live in
`ACTIVITY` in `js/lib/rules.js`.

**`workoutKcal` has one source: the app.** Every time a workout is saved,
edited or deleted, the app adds up the `kcal` of all that day's workouts
(see Workouts below) and merges `workoutKcal` and `totalOutKcal` into the
day's doc, keeping `steps`, `stepsKcal`, `baseKcal`, `note`, `source` and
`loggedAt`. A day with no doc yet gets one (`source: "workouts"`, steps 0)
— unless its burn is 0. The nutrition screen shows the number but doesn't
let it be typed.

**The coach never writes `workoutKcal`.** To log a workout, write the
workout; its burn follows the next time the app opens it (or write its
`kcal` too, below). When writing the night's burn (steps):

1. Read the day's doc first.
2. Write with `set` + `merge` only `steps`, `stepsKcal`, `totalOutKcal`
   (and `loggedAt`, `source: "coach"`), where
   `totalOutKcal = baseKcal + stepsKcal + workoutKcal` using the doc's own
   `baseKcal` (default `1950`) and **existing** `workoutKcal` (default `0`).
3. Never replace the whole doc — a workout saved the same day would lose
   its burn.

So a workout save and the nightly write never overwrite each other.

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
| `proteinTarget` | number | Daily protein, grams. `120` when missing (`NUTRITION` in `js/lib/rules.js`). |
| `carbsTarget` | number | Daily carbs, grams. `250` when missing. |
| `fatTarget` | number | Daily fat, grams. `65` when missing. |
| `usageApps` | string[] | Apps the user measures with the iPhone shortcut (names, e.g. `["אינסטגרם", "Strava"]`), see App usage. Missing → the apps that already sent minutes today. Written by the app. |

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

Points (M4 — see Points ledger). Only `weeklyWorkoutGoal` and
`rewardGoal` are the user's to set; the `rewards…` fields are the app's
bookkeeping — never write them.

| Field | Type | Notes |
|---|---|---|
| `weeklyWorkoutGoal` | number | Workout days a week for the +50 bonus, `1`–`7`. `3` when missing. |
| `rewardGoal` | string | The real reward the user picked for level 6, e.g. `"נעלי ריצה"`. Optional. |
| `trackedRows` | map | The progress screen's rows ("מה אני עוקב אחריו"): `{ order: [rowId], hidden: [rowId] }`. Row ids: `sleep`, `habit:<habitId>`, `meals`, `protein`, `calories`, `workouts`, `weight`. A row not listed shows (a new habit appears until hidden). |
| `rewardsStartDate` | string | `yyyy-mm-dd` — the day scoring began. Set by the app on its first run. |
| `rewardsCheckedThrough` | string | `yyyy-mm-dd` — the last day the app scored. |
| `rewardsSeen` | map | What the screen has already celebrated: `{ level, badges: [ids], daySummary: 'yyyy-mm-dd' }`. Display only — the points are in the ledger. |

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
| `kcal` | number | The workout's burn, integer — set by the app on save (below). Optional: a workout without it is worked out when its day is next summed. |

An exercise is **strength**, **cardio** or a **session** (Pilates,
CrossFit…). History labels a workout by what it contains: only cardio →
"ריצה" / "הליכה" etc., only strength → "כוח", a session → its type's name,
a mix → "קרוספיט + כוח", "כוח + ריצה".

**Burn (`kcal`)** = MET × body kg × hours, summed over the exercises. Body
kg is the latest `bodyWeight` on or before the workout's day (`70` if none).
The numbers are `WORKOUTS` in `js/lib/rules.js`:

- **Outdoor walk / run (`inputMode: "free"`, or none) = 0** — the steps
  already count it. History and streaks only.
- Treadmill walk / run: from speed and incline (ACSM equations); without a
  speed, from the segment's `effort`. Bike `7` MET, stairs `9`.
- Strength: `3.5` MET over the workout's length minus its cardio and
  sessions (≈ 250 kcal/hour at 70 kg); with `noTime: true`, 2.5 min per set.
- Session: the type's MET at effort 5 × (`0.6 + 0.08 × rpe`), for
  `durationSec`. No `durationSec` → 0.

Then `dailyActivity.workoutKcal` for that day is the sum of its workouts'
`kcal` — written by the app only (see Daily activity above).

### Strength exercise

```json
{
  "name": "לחיצת חזה",
  "category": "חזה",
  "sets": [ /* sets, below */ ]
}
```

- `note` (optional string, strength only): a note for this exercise in
  this workout, usually which machine ("מכונה 2, מושב 4"). The next workout
  shows it as "פעם קודמת: …". Missing or `""` = no note.
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

### Session exercise (Pilates, CrossFit, yoga…)

A workout of a type, logged as one entry — **no `sets`**. It can sit in a
workout next to strength and cardio exercises (CrossFit's strength part is
logged as ordinary strength exercises).

```json
{
  "name": "פילאטיס",
  "category": "אימון",
  "kind": "session",
  "typeId": "pilates",
  "durationSec": 3000,
  "rpe": 6,
  "place": "סטודיו",
  "fields": { "equipment": "מכשירים", "level": "בינוני" },
  "notes": ""
}
```

| Field | Type | Notes |
|---|---|---|
| `name` | string | The type's name, exactly as in the table below (or the user's own type's `name`) |
| `category` | string | Always `"אימון"` |
| `kind` | string | Always `"session"` |
| `typeId` | string | From the table below, or `custom:<workoutTypes doc id>` |
| `durationSec` | number | Length in seconds |
| `rpe` | number | Effort `1`–`10` (integer) |
| `avgHr` | number | Average heart rate. Optional. |
| `place` | string | Place / studio. Optional. |
| `fields` | object | The type's own values, keyed by field id (below). Only what's known. |
| `notes` | string | Usually `""` |

Write only the values that are known — leave the key out, never `null`
(`fields` and `notes` are always there, `{}` / `""` when empty).
`picklist` / `level` values must be one of the listed options, character
for character.

Built-in types:

| `typeId` | `name` | `fields` |
|---|---|---|
| `functional` | `פונקציונלי` | `format`: `מעגל` · `EMOM` · `AMRAP` · `טבטה`; `rounds` (number); `stations`: `[{ name, amount, weight }]` — `amount` text ("12" reps or "0:40"), `weight` kg number; `restSec` (number, rest between rounds) |
| `crossfit` | `קרוספיט` | `wod` (text, the WOD's name); `format`: `For Time` · `AMRAP` · `EMOM`; `timeCapSec`; For Time: `resultSec`; AMRAP: `resultRounds`, `resultReps` (reps past the last full round); `scale`: `Rx` · `Scaled`; `weights` (text) |
| `pilates` | `פילאטיס` | `equipment`: `מכשירים` · `מזרן`; `level`: `מתחילים` · `בינוני` · `מתקדם`; `focus`: `בטן` · `גמישות` · `יציבה`; `instructor` (text) |
| `yoga` | `יוגה` | `style`: `ויניאסה` · `האטה` · `אשטנגה` · `יין` · `אחר`; `level` (as Pilates); `focus`: `גמישות` · `כוח` · `נשימה` · `הרפיה` |
| `swim` | `שחייה` | `distanceM` (metres); `stroke`: `חתירה` · `חזה` · `גב` · `פרפר` · `מעורב`. Pace per 100 m is worked out from `durationSec`. |
| `studio` | `סטודיו` | `classType`: `ספינינג` · `HIIT` · `אגרוף` · `אחר`; `intensity`: `קלה` · `בינונית` · `גבוהה`; `rounds` |
| `sport` | `ספורט` | `game`: `פאדל` · `טניס` · `כדורגל` · `כדורסל` · `אחר`; `intensity` (as studio); `result` (text) |
| `ski` | `סקי` | `runs` (number); `slope`: `ירוק` · `כחול` · `אדום` · `שחור`. `durationSec` = time on the slopes. |

**Records:** CrossFit — the same `wod` name (case and spaces ignored) in the
same `format`: For Time, a lower `resultSec`; AMRAP, more `resultRounds`
(then `resultReps`). Functional — more `rounds` in the same `format`.

### Example: CrossFit with a strength part

```json
{
  "date":      "Timestamp(2026-11-10 07:00 Asia/Jerusalem)",
  "startTime": "Timestamp(2026-11-10 07:00 Asia/Jerusalem)",
  "endTime":   "Timestamp(2026-11-10 08:00 Asia/Jerusalem)",
  "noTime": false,
  "notes": "",
  "source": "coach",
  "exercises": [
    {
      "name": "סקוואט", "category": "רגליים",
      "sets": [
        { "setNumber": 1, "type": "working", "weight": 80, "weightUnit": "kg", "weightMode": "total", "reps": 5, "notes": "" },
        { "setNumber": 2, "type": "working", "weight": 80, "weightUnit": "kg", "weightMode": "total", "reps": 5, "notes": "" }
      ]
    },
    {
      "name": "קרוספיט", "category": "אימון", "kind": "session", "typeId": "crossfit",
      "durationSec": 1200, "rpe": 9,
      "fields": { "wod": "Fran", "format": "For Time", "resultSec": 290, "scale": "Rx", "weights": "43 ק\"ג" },
      "notes": ""
    }
  ]
}
```

---

## Workout types — `users/{uid}/workoutTypes/{auto}`

Types the user built ("סוג משלך"), e.g. TRX with rounds and a level. A
session of one has `typeId: "custom:<this doc's id>"`. Deleting a type
leaves the workouts logged with it as they are.

| Field | Type | Notes |
|---|---|---|
| `name` | string | Shown in the picker and as the session's `name` |
| `fields` | array | `[{ id, kind, label, options? }]` — `id` `f1`, `f2`…; `kind` one of `duration` · `distance` (km) · `rounds` · `reps` · `weight` (kg) · `resultTime` (seconds) · `level` (`מתחילים` · `בינוני` · `מתקדם`) · `picklist` (`options`: the choices) · `text` |
| `order` | number | Position in the picker |
| `createdAt` | Timestamp | Server timestamp |

Every type also has `durationSec`, `rpe`, `avgHr`, `place` and `notes` on
the session itself. Burn: `5` MET at effort 5.

```json
// users/{uid}/workoutTypes/a1B2c3
{ "name": "TRX", "order": 0, "createdAt": "serverTimestamp()",
  "fields": [ { "id": "f1", "kind": "rounds", "label": "סבבים" },
              { "id": "f2", "kind": "level", "label": "רמה" } ] }
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
| `icon` | string | A Lucide icon name the app knows (`book-open`, `footprints`, `phone-off`, `smartphone`, `droplet`, `brain`, `heart`, `languages`, `apple`, `leaf`, `moon`, `sun`, `dumbbell`, `pencil`, `sparkles`, `check`). Unknown → a check mark. |
| `area` | string | `body` (גוף) · `personal` (אישי) · `relationship` (זוגיות) · `career` (קריירה) |
| `schedule` | map | `{ "type": "daily" }` · `{ "type": "weekly", "perWeek": 3 }` (any 3 days a week) · `{ "type": "days", "days": [1, 3] }` (fixed weekdays, `0` Sunday … `6` Saturday) |
| `kind` | string | `good` (something to do) · `bad` (something to quit — see "Bad habits" below). **Missing = `good`**: every habit before M5 is a good one, and the app never converts one. |
| `measure` | string | Good: `yesno` · `quantity` (at least N) · `limit` (at most N) · `steps` (a routine checklist). Bad: `clean` (a reported clean day) · `limit` (at most N, e.g. minutes) · `slips` (a slip counter). |
| `unit` | string | `"דקות"`, `"עמודים"`, `"פעמים"`, `"צעדים"`… |
| `full` | number \| null | The ideal. `quantity`: at least this; `limit`: at most this; `yesno`: just describes it (e.g. `30` minutes). |
| `short` | number \| null | The minimum that still counts ("מקוצר"). `quantity`: less than `full`; `limit`: more than `full`. `null` = no short level — on a `yesno` habit one tap marks it done. |
| `steps` | string[] | Only for `measure: 'steps'` — the routine's steps. |
| `shortSteps` | number[] | Routines: the step indexes that count as "מקוצר" (e.g. `[0, 1]` = water and bed). Empty = no short level. |
| `why` | string | One sentence: why it matters (good) / what it costs (bad). The coach uses it on hard days. Optional. |
| `partOfDay` | string \| null | `morning` · `noon` · `evening` · `night` |
| `anchor` | string | What it's tied to, e.g. `"אחרי הקפה"`. Optional. |
| `reminder` | string \| null | `'hh:mm'` — stored now, sent once push notifications exist (M9). |
| `markedBy` | string | `me` (a tap) · `coach` (asked in the evening check) · `auto` (counted from `autoSource`). `me` when missing. |
| `trigger` | string | Bad habits: when, where, what's felt before. Optional. |
| `replacement` | string | Bad habits: what to do instead. Optional. |
| `friction` | string | Bad habits: how it's made harder. Optional. |
| `cleanWeekTarget` | number | Bad habits: clean days a week for the +20 bonus, `1`–`7`. `5` when missing. |
| `autoSource` | string \| null | `"dailyActivity.steps"` — the day's level comes from `steps` in that day's `dailyActivity` doc (see below); `"workouts.strength"` — full on a day with a saved strength workout (see below); `null` — marked by hand. |
| `parts` | string[] | Only on `quantity` / `limit`, optional, at most 6 — the habit is entered as one number per part (`["אינסטגרם", "פייסבוק"]`) and the day's `value` is their sum. `[]` or missing = one number. |
| `active` | boolean | `false` = paused (kept, not counted). |
| `order` | number | Position on the screen, smallest first. |
| `source` | string | `manual` (added in the app) · `example` (the starter habits) · `coach` (written from outside) · `library` (from "להפוך להרגל" in ללמוד) |
| `createdAt` | Timestamp | First saved |
| `updatedAt` | Timestamp | Last saved |

**`autoSource: "dailyActivity.steps"`** — steps are logged once, in
`dailyActivity/{date}.steps`, and the habit reads them: steps ≥ `full` →
full, ≥ `short` → short, less → none (shown grey). `0` or no doc = not known
yet, nothing shown. **Don't also write the steps into `habitLogs`** — a
mark there is a manual override and wins over the steps (the user's
"מלא" tap, say); deleting the mark brings the automatic count back.

**`autoSource: "workouts.strength"`** — read from `workouts`: a day (Israel
time, by `startTime`) with at least one saved workout holding a strength
exercise (an exercise whose `kind` is neither `cardio` nor `session`) is
full, its value the number of such workouts. Cardio-only and session-only
workouts don't count. Nothing to write — log the workout itself; a
`habitLogs` mark is a manual override, as with steps.

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
| `value` | number \| null | The number, when one was given (`7` minutes read); `null` after a plain מלא / מקוצר tap. On a habit with `parts`, the sum of the parts. |
| `parts` | map | Only on a habit with `parts`: part name → number (`{ "אינסטגרם": 10, "פייסבוק": 4 }`). A part left empty is left out. |
| `source` | string | `manual` (marked in the app) · `coach` (written from outside) · `shortcut` (app minutes from `/api/usage`, see App usage) |

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

**A routine's mark** (`measure: 'steps'`) also carries `stepsDone: [0, 1]` —
the steps ticked. Its `level`: every step → `full`, all the `shortSteps` →
`short`, anything else → `none`.

### Bad habits — a clean day and a slip

A bad habit's day lives in the same `habitLogs/{date}` doc, under its own
key, with this mark:

| Field | Type | Notes |
|---|---|---|
| `clean` | boolean | `true` = the day was reported clean ("יום נקי ✓", or the coach's evening check). |
| `slips` | Timestamp[] | One per slip ("מעדתי"), the moment it was logged. Shown in Israel time. `[]` when none. |
| `value` | number \| null | `slips`/`clean`: the number of slips. `limit`: the minutes (or whatever `unit` is) of that day. |
| `level` | string | `full` · `short` · `none` — written for readability; the app works it out again from the rest. |
| `source` | string | `manual` · `coach` |

How the app reads the day — **a clean day must be reported**:

- Nothing reported (no mark, or no `clean: true` and no slips / value) →
  **unknown**: no points, shown as an outline. It can be filled in up to 7
  days back; after that it ends the clean streak.
- `clean: true` and no slips → **clean** (`full`). A slip the same day wins
  over the clean tap.
- Slip counter: 1 slip → `short`; more → `none`. Clean-day measure: any
  slip → `none`. Limit: `value` at most `full` → `full`, at most `short` →
  `short`, more → `none`.

**The coach marks one habit's day** exactly like a good habit's mark —
merge **only that habit's key** in `habitLogs/{date}`, never the whole
day, so every other habit's mark (and the app's slips) survive. Always
write the **whole** mark for that habit; to add a slip, read the day first
and write the existing `slips` plus the new one:

```js
// Node, firebase-admin. A clean day for one bad habit:
const day = db.doc(`users/${uid}/habitLogs/2026-11-12`);
await day.set({
  date: '2026-11-12',
  habits: { [habitId]: { clean: true, slips: [], value: 0, level: 'full', source: 'coach' } },
  updatedAt: FieldValue.serverTimestamp(),
}, { merge: true });

// A slip at 21:40 Israel time — keep the slips already there:
const snap = await day.get();
const old = snap.exists ? (snap.data().habits?.[habitId] || {}) : {};
const slips = [...(old.slips || []), Timestamp.fromDate(new Date('2026-11-12T21:40:00+02:00'))];
await day.set({
  date: '2026-11-12',
  habits: { [habitId]: { clean: false, slips, value: slips.length, level: slips.length === 1 ? 'short' : 'none', source: 'coach' } },
  updatedAt: FieldValue.serverTimestamp(),
}, { merge: true });

// A limit habit (Instagram, minutes): the day's minutes.
await day.set({
  date: '2026-11-12',
  habits: { [habitId]: { clean: false, slips: [], value: 25, level: 'full', source: 'coach' } },
  updatedAt: FieldValue.serverTimestamp(),
}, { merge: true });
```

The same rules as above apply: the nested `habits` map in `set()` with
`merge`, never a dotted key in `set()`, never `set()` without merge.
Israel time (`+02:00` in winter, `+03:00` in summer) for every slip.

```json
// users/{uid}/habitLogs/2026-11-12 — two slips of nail biting, Instagram 25 min, reading done
{ "date": "2026-11-12",
  "habits": {
    "Nb4…nailsId": { "clean": false, "slips": ["Timestamp(2026-11-12 21:40 Asia/Jerusalem)", "Timestamp(2026-11-12 22:15 Asia/Jerusalem)"], "value": 2, "level": "none", "source": "manual" },
    "Ig9…instaId": { "clean": false, "slips": [], "value": 25, "level": "full", "source": "coach" },
    "Xk2…readingId": { "level": "full", "value": null, "source": "manual" } },
  "updatedAt": "serverTimestamp()" }
```

**Clean streak:** reported clean days in a row. A slip ends it (no points
are taken); an unreported day doesn't, while it can still be filled in (7
days). The best streak is shown next to the current one. Never stored —
worked out from these marks.

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
| `exercises` | array | **Exactly the workout exercise shape above** — strength: `name`, `category`, `sets` (`setNumber`, `type`, `weight`, `weightUnit`, `weightMode`, `reps`, `notes`, optional `dropGroup`); cardio and sessions: as in Workouts (a session shows as one line on the plan card and is filled in once the workout starts). Plus optional `reason` per exercise. |
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

---

## Points ledger — `users/{uid}/pointsLedger/{id}`

One entry per award (M4). **Written by the app only — the coach never
writes here** (rule 9 below). Points come from the data, not from who
wrote it: a meal, a nightly burn or a plan the coach writes scores exactly
like one typed in the app, the next time the app opens. Level, totals,
streaks and badges are worked out from these entries (`js/lib/rewards.js`)
and never stored anywhere else.

**The doc id is fixed per award:** `{date}_{rule}` or `{date}_{rule}_{ref}`
— e.g. `2026-11-10_sleep-bedtime`, `2026-11-10_meal-log_<mealId>`,
`2026-11-10_habit_<habitId>`, `2026-11-10_pr_<workoutId>_<exercise>`.
Weekly bonuses use the week's Sunday: `2026-11-08_habit-week_<habitId>`,
`2026-11-08_workout-week`. Scoring the same day again, or a meal edited
twice, lands on the same id — it never scores twice.

**Upward only.** An entry's `points` are only ever raised (a close night
re-logged as on time goes 10 → 20), never lowered or deleted: a deleted
meal keeps its 5. Online, the app writes in a transaction that keeps the
higher value, so two phones can't lower each other's entries.

| Field | Type | Notes |
|---|---|---|
| `date` | string | `yyyy-mm-dd` — the day it counts for (a night: its morning) |
| `source` | string | `sleep` · `habit` · `meal` · `nutrition` · `weight` · `workout` · `bonus` · `task` · `decision` |
| `rule` | string | `sleep-bedtime` · `sleep-duration` · `habit` · `habit-week` · `meal-log` · `calories` · `protein` · `meal-count` · `weigh-in` · `workout` · `workout-week` · `pr` · `perfect-day` · `bad-clean` · `bad-slip` · `bad-week` · `bad-streak` · `task` · `task-start` · `decision` · `decision-first` |
| `ref` | string \| null | The habit / meal / `<workoutId>_<exercise>` it's for |
| `points` | number | Points awarded (after the daily cap) |
| `raw` | number | What the rule earned before the cap |
| `grade` | string \| null | `full` · `close` · `short` (habit) · `free` (a flexible night's bedtime) · `on-time` (task, decision) · `late` (decision) |
| `reason` | string | Short Hebrew, e.g. `"נרדמת בזמן"` |
| `createdAt`, `updatedAt` | Timestamp | Server timestamps |

**How a day scores** (numbers: `REWARDS` in `js/lib/rules.js`):

- Sleep, when the night is logged: bedtime 20 on time / 10 close; duration
  15 / 8 (under 6 hours: 0). On a flexible night (Thu/Fri by default) the
  bedtime is free — its 20 come automatically, only the duration is judged.
- Habits: 10 full / 5 short; an N-per-week habit +20 on the day it reaches N.
- Meals: 5 for each logged, up to 2 a day.
- Weigh-in 5. Workout 30 (once a day); +50 on the day the week's workout
  goal is reached (`weeklyWorkoutGoal`, 3); +20 for each exercise that set
  a record (heavier than ever before; cardio and session records as in
  their sections). A first time is no record.
- **When the day is over** (the app scores it the next time it opens, and
  again within a week if a burn or a meal arrives late — upward only):
  calories 30 at most the target / 15 up to 10% over / 0 beyond, or with a
  deficit over 1,000; protein 10 at `proteinTarget` / 5 above 80%; meal
  count 10 at most 2 / 5 for one more. Days with no meal logged aren't
  judged. The target is the burn less `calorieDeficit`, or `calorieTarget`
  with no `dailyActivity` doc.
- Perfect day +30: sleep both parts full (bedtime free counts), every
  daily / fixed-weekday habit due that day done, calories, protein and
  meal count full — and a workout only if the coach planned one that day
  (not marked "לא היום"). A rest day never blocks it.
- Bad habits (`BAD_HABITS`): logging a slip (or a day over the limit) +2
  at once, once a day per habit — honesty pays. When the day is over: a
  reported clean day 10, one slip / within the short limit 5, nothing
  reported 0. +20 on the day the week's clean days reach
  `cleanWeekTarget`. Clean-streak milestones, each once per streak (the id
  carries the streak's first day: `{start}_bad-streak_{habitId}_{days}`):
  3 days 15, 7 → 30, 14 → 60, 30 → 120, 66 → 250 and the "נגמל" badge,
  100 → 400. A slip never takes points away. Bad habits never block the
  perfect day.
- **Daily cap 200**, not counting the weekly bonuses, records, the
  perfect day and the clean-streak milestones.
- Scoring starts on the day the app first runs it (`rewardsStartDate`);
  the past isn't scored. Each run scores from the last day checked
  (`rewardsCheckedThrough`, less 7 days) to today, at most 31 days back —
  a week away loses nothing.

---

## Library marks ("ללמוד") — `users/{uid}/libraryMarks/{itemId}`

The "ללמוד" screen lists books, podcasts and channels. The shared list lives
in the code (`js/data/library.js`, ids like `atomic-habits`); this
collection only holds the user's own marks on it. The doc id is the item
id, or `pick:<libraryPicks id>` for a personal pick. No doc = not marked.

| Field | Type | Notes |
|---|---|---|
| `saved` | boolean | Bookmarked ("שמירה") — shown under the "שמורים" filter |
| `doneAt` | Timestamp \| null | When the user marked it finished ("סיימתי"); finished items sink to the bottom |
| `updatedAt` | Timestamp | Last saved |

"להפוך להרגל" on an item adds a normal habit doc (see Habits) with
`source: 'library'`.

---

## Library picks — `users/{uid}/libraryPicks/{auto}`

Personal recommendations shown at the top of "ללמוד", before the shared
list. Added by the user ("+ הוספת המלצה") or by the coach.

| Field | Type | Notes |
|---|---|---|
| `title` | string | Hebrew or the original title |
| `type` | string | `book` · `podcast` · `episode` · `video` · `article` |
| `area` | string | `sleep` · `nutrition` · `training` · `habits` · `mind` · `longevity` |
| `link` | string \| null | https URL |
| `reason` | string | One line: why it's for this user (≤ 140 chars) |
| `author` | string | Optional |
| `summary` | string | Optional, one or two sentences |
| `takeaways` | string[] | Optional, up to 3 short points |
| `source` | string | `user` (added in the app) · `coach` (written from outside) |
| `createdAt` | Timestamp | First saved |

```json
// users/{uid}/libraryPicks/<auto id>
{ "title": "Atomic Habits", "type": "book", "area": "habits",
  "link": "https://jamesclear.com/atomic-habits",
  "reason": "מתאים לבנייה של שגרת הבוקר", "source": "coach",
  "createdAt": "serverTimestamp()" }
```

---

## Claude connector keys — `mcpKeys/{hash}` (top level)

Each user's Claude reads and writes their own data through the MCP server
at `/api/mcp` (M11, `api/mcp.js`). The user makes a key on the "חיבורים"
page and pastes the connector address into Claude (Settings → Connectors
→ Add custom connector):

```
https://gym-yarin9.vercel.app/api/mcp?key=gymi_<43 characters>
```

The key is shown once and **never stored**. Its SHA-256 (lowercase hex) is
the doc id, so the server finds the user from the key alone — that's why
this collection is top level, not under `users/{uid}/`. The server then
only ever touches `users/{thatUid}/…`.

| Field | Type | Notes |
|---|---|---|
| `uid` | string | The key's owner |
| `preview` | string | The key's first 9 characters (`gymi_AbCd`), to tell keys apart on the card |
| `createdAt` | Timestamp | Server timestamp, when it was made |
| `lastUsedAt` | Timestamp | Set by the server, at most every 10 minutes. Missing = never used. |
| `lastCheckAt` | Timestamp | Set by the server's `get_changes` tool: where "what changed since the last check" starts next time |

- **The app** creates a key doc (only `uid` = the signed-in user, `preview`,
  `createdAt` — `firestore.rules` enforces it), lists its own keys and
  deletes one to revoke it. It never updates a key.
- **The server** (firebase-admin, `FIREBASE_SA_JSON` in Vercel's
  environment) reads the doc, and writes only `lastUsedAt` / `lastCheckAt`.
  It remembers a key for a minute, so a revoked key stops working within
  a minute.
- At most 3 keys per user. Numbers: `MCP` in `js/lib/rules.js`.

**What the connector can do** (`api/_lib/tools.js`) — read: `get_today`,
`get_habits`, `get_sleep`, `get_meals`, `get_workouts`, `get_weights`,
`get_points`, `get_profile`, `get_changes`; write: `log_meal`,
`log_weight`, `log_sleep`, `mark_habit`, `log_daily_activity`. The writes
produce exactly the documents described in this file, with
`source: 'coach'`, for a date at most 14 days back and never in the future.
A weigh-in or a night that's already logged, or steps lower than what's
stored, are refused unless the call says `replace: true`. There are no
delete tools, and nothing writes `pointsLedger`, `workoutKcal` or the
user doc.

---

## Tasks — `users/{uid}/tasks/{auto}`

One document per task on the "משימות" screen; the most pressing open ones
also show on "היום". Three kinds: a one-off (`once`) is done once; a daily
one (`daily`) and a repeating one (`recurring`, weekly or monthly) are
"do and tick" on the days they fall on, with no levels and no streak.

| Field | Type | Notes |
|---|---|---|
| `title` | string | Hebrew, one line — `"לתקן את הקרש"` |
| `type` | string | `once` · `daily` · `recurring` |
| `recurrence` | map \| null | `daily`: `{ "days": [0, 1, 2, 3, 4, 5, 6] }` (weekdays, `0` Sunday … `6` Saturday; missing = every day). `recurring`: `{ "every": "week", "day": 5 }` (weekday) or `{ "every": "month", "day": 1 }` (date, `1`–`28`). `null` on a one-off. |
| `area` | string \| null | `body` · `personal` · `relationship` · `career` (as on habits), or `null` |
| `owner` | string | `me` · `assistant` · `shared` (e.g. with Maya) |
| `complexity` | string | `S` (up to 15 min) · `M` (up to an hour) · `L` (more). Sets the points. |
| `important` | boolean | Marked important. At most 3 important tasks a day (the form warns). |
| `urgent` | boolean | Marked urgent by hand. A task is also urgent when its `dueDate` (or its day) is within 2 days — computed, never stored. |
| `timing` | string \| null | One-offs only: `exact` (a day and a time) · `day` (a day, no time) · `week` (this week) · `claude` ("שקלוד יקבע" — waits for the evening check to propose a slot) · `null` (not decided yet, e.g. the inbox) |
| `scheduledAt` | Timestamp \| null | `exact`: that day and time. `day`: that day at local noon. `week`: the Sunday of that week at local noon. Otherwise `null`. |
| `dueDate` | Timestamp \| null | Deadline, local noon. Done on or before it earns the on-time bonus. |
| `status` | string | `inbox` (a one-line quick capture, fields not filled in yet) · `open` · `done` (one-offs only) · `someday` ("מתישהו": off the lists, no ladder) |
| `doneAt` | Timestamp \| null | One-offs: when it was ticked. Unticking sets `status: 'open'`, `doneAt: null`. |
| `doneDates` | string[] | Daily / repeating: the `yyyy-mm-dd` days it was done, newest first, the last 120 days. `[]` on a one-off. |
| `postponeCount` | number | Times it was moved to another day ("מחר" or a new date). 3 → the "why stuck?" question. |
| `firstStep` | string | The first 5 minutes, e.g. `"למצוא את הברגים"`. `""` = none. |
| `stuckReason` | string \| null | The answer to "למה היא תקועה?": `unclear` · `big` · `unpleasant` · `stressful` · `notImportant` |
| `startedAt` | Timestamp \| null | "התחלתי 10 דקות" on a stuck task (a one-time start bonus) |
| `calendarEventId` | string \| null | The Google Calendar event linked to the task (M7). `null` until then. |
| `source` | string | `manual` (the form) · `quick` (the + button's one line) · `coach` (written from outside) |
| `createdAt` | Timestamp | First saved — the procrastination ladder counts from it |
| `updatedAt` | Timestamp | Last saved |

**The procrastination ladder** — computed from `createdAt`, never stored:
an open one-off with no time (`timing` `null` or `claude`, or a day not
yet picked) shows orange "מחכה שבוע" after 7 days, "למה היא תקועה?" after
14 (or after `postponeCount` reaches 3), and a forced choice after 21:
schedule this week / someday / delete.

**Points** (pointsLedger rules `task` and `task-start`): S 5 · M 15 · L 30,
×2 when important, +5 when done by the due date; a daily task 5; starting
a stuck task 5, once. A late task keeps its points — no penalty. All in
`TASKS`, `js/lib/rules.js`.

**From outside the app (the evening check):** to fill in an inbox task,
update its fields and set `status: 'open'`; to schedule one, set `timing`
and `scheduledAt` as above; to add one, write the whole document with
`source: 'coach'`. To mark one done, a one-off gets `status: 'done'` and
`doneAt`; a repeating one gets the day added to `doneDates`.

```json
// users/{uid}/tasks/<auto id>
{ "title": "לתקן את הקרש", "type": "once", "recurrence": null,
  "area": "personal", "owner": "me", "complexity": "M",
  "important": false, "urgent": false,
  "timing": "exact", "scheduledAt": "<Timestamp 2026-11-17 18:00 Israel>",
  "dueDate": "<Timestamp 2026-11-20 12:00 Israel>",
  "status": "open", "doneAt": null, "doneDates": [], "postponeCount": 0,
  "firstStep": "למצוא את הברגים", "stuckReason": null, "startedAt": null,
  "calendarEventId": null, "source": "coach",
  "createdAt": "serverTimestamp()", "updatedAt": "serverTimestamp()" }

// a weekly one: every Friday
{ "title": "לנקות את מכונת הקפה", "type": "recurring",
  "recurrence": { "every": "week", "day": 5 }, "complexity": "S", "...": "..." }
```

---

## Decisions — `users/{uid}/decisions/{auto}`

One document per decision on "משימות → להחליט" (M6b, M6c); the nearest open
one also shows on "היום". Two questions sort it into a track — `small` (a
2-minute budget and the feet draw), `medium` (10 minutes, or by the end of
the next day, with criteria and a score) or `large` (M6c: a decide-by date
a week out, and optional WRAP steps — a friend's advice, the score check,
10-10-10, a premortem and a small experiment). The reward is for deciding inside
the budget, never for being "right". The app saves it when its track starts
(`startedAt` starts the clock) and whenever a field is left, so a decision
closed half-way stays open in the list.

| Field | Type | Notes |
|---|---|---|
| `question` | string | Hebrew, one line — `"איזו מסעדה הערב?"` |
| `track` | string | `small` · `medium` · `large` (M6c; before it, a "large" answer ran as `medium`) |
| `triage` | map | `{ "reversible": true \| false \| null, "impact": "low" \| "some" \| "high" \| null }` — the two answers |
| `options` | array | 2–4 (large: 3–4) of `{ "id": "o3k9x1", "text": "סושי", "scores": { "<criterionId>": 1–5 } }`. `scores` is `{}` on a small decision. |
| `criteria` | array | Medium and large: up to 3 of `{ "id": "c7a2b0", "name": "מחיר", "weight": 1 \| 2 \| 3 }`. `[]` on a small one. |
| `goodEnough` | number | The bar for "מספיק טוב" — an option's weighted average (1–5). Default 3.5. |
| `tenTenTen` | string | Medium and large: the 10-10-10 answer. `""` = none. |
| `friendAdvice` | string | Large: "what would you tell a friend?". `""` = none; missing reads as `""`. |
| `premortem` | string | Large: "a year on it failed — why?". `""` = none; missing reads as `""`. |
| `experiment` | map \| null | Large: `{ "text": "לדבר עם דנה", "by": <Timestamp local noon> \| null, "learned": "" }`. Waiting on it while `text` is set and `learned` is `""` ("מחכה לניסוי"). Missing reads as `null`. |
| `budgetSec` | number | The visible timer: 120 (small) · 600 (medium). Large: 604800 (7 days), no timer shown. |
| `startedAt` | Timestamp \| null | When its track started. `null` = only the question so far. |
| `decideBy` | Timestamp \| null | Local noon of the day to decide by. Medium: tomorrow, set on start. Large: a week out, set on start, the user may move it. Small: `null` unless set from the ladder. |
| `decidedAt` | Timestamp \| null | When "החלטתי" was tapped |
| `choiceId` | string \| null | The chosen option's `id` |
| `method` | string \| null | `feet` (the draw picked it) · `score` (the suggestion) · `manual` (picked by hand, or another option after the draw) |
| `reopened` | boolean | Drawn again before deciding — no "first choice" bonus |
| `reason` | string | Why, one line. `""` = none. |
| `feeling` | string \| null | `happy` · `unsure` · `disappointed` |
| `stuckReason` | string \| null | The answer to "מה חסר כדי להחליט?": `info` · `talk` · `courage` |
| `status` | string | `open` · `decided` · `dropped` ("לוותר עליה" — kept, just off the list) |
| `source` | string | `manual` · `quick` (the + button) · `coach` (written from outside) |
| `createdAt` | Timestamp | First saved — the ladder counts from it |
| `updatedAt` | Timestamp | Last saved |

**On time** — computed, never stored: small, `decidedAt` within `budgetSec`
of `startedAt`; medium, before the midnight that ends the day after
`startedAt` (Israel time), or within its 600 seconds if that's later;
large, before the midnight that ends its `decideBy` day (a week after
`startedAt` if it has none). Moving `decideBy` moves the line.

**The ladder** — computed from `createdAt`: an open decision with no
`decideBy` shows "לקבוע תאריך החלטה" after 7 days and "מה חסר כדי
להחליט?" after 14. Never red, never a penalty.

**Points** (pointsLedger rules `decision` and `decision-first`, on the day
of `decidedAt`): small 5 on time / 2 late; medium 15 / 5; large 40 / 10; +5 when not
`reopened`. Badges for 5, 20 and 50 on-time decisions in a row. All in
`DECISIONS`, `js/lib/rules.js`.

**From outside the app (the evening check):** read the open ones
(`status: 'open'`) and ask about them; to add one, write `question`,
`track`, `status: 'open'`, `source: 'coach'` and `createdAt`, and leave
`startedAt` `null` so the clock starts when the user opens it. Don't mark
one decided from outside.

```json
// users/{uid}/decisions/<auto id> — a medium one, decided
{ "question": "איזה מחשב לקנות?", "track": "medium",
  "triage": { "reversible": false, "impact": "some" },
  "options": [
    { "id": "oa1", "text": "מקבוק", "scores": { "cp1": 2, "cb2": 5 } },
    { "id": "ob2", "text": "לנובו", "scores": { "cp1": 4, "cb2": 3 } } ],
  "criteria": [ { "id": "cp1", "name": "מחיר", "weight": 3 }, { "id": "cb2", "name": "סוללה", "weight": 2 } ],
  "goodEnough": 3.5, "tenTenTen": "", "budgetSec": 600,
  "startedAt": "<Timestamp 2026-11-12 10:00 Israel>",
  "decideBy": "<Timestamp 2026-11-13 12:00 Israel>",
  "decidedAt": "<Timestamp 2026-11-12 10:08 Israel>",
  "choiceId": "ob2", "method": "score", "reopened": false,
  "reason": "יותר זול, מספיק טוב", "feeling": "unsure", "stuckReason": null,
  "status": "decided", "source": "manual",
  "createdAt": "serverTimestamp()", "updatedAt": "serverTimestamp()" }
```

---

## Personal keys — `users/{uid}/apiKeys/{hash}`

A key lets something outside the app send data for this user without
signing in — first the iPhone steps shortcut ("שליחה שקטה" on חיבורים).
The key is `gymi.<uid>.<secret>`, shown to the user once; only the
SHA-256 hex of `<secret>` is stored, as the doc id. Created and revoked
(deleted) only in the app, never from outside.

| Field | Type | Notes |
|---|---|---|
| `label` | string | What it's for, e.g. `"קיצור הצעדים"` |
| `scopes` | string[] | What it may do: `["steps"]` (the steps shortcut) or `["usage"]` (the Instagram shortcuts) |
| `createdAt` | Timestamp | Made |
| `lastUsedAt` | Timestamp \| null | Last accepted request (written by the server) |

**`POST /api/steps`** (a Vercel function, `api/steps.js`) —
`Authorization: Bearer gymi.<uid>.<secret>`, JSON body
`{ "steps": 12450, "date": "2026-11-10" }` (`date` optional, today in
Israel by default, up to 7 days back). The same rules as the in-app import
below: steps only ever go up, and `stepsKcal` / `totalOutKcal` are
recomputed; it writes `dailyActivity/{date}` with `source: "shortcut"`.
Answers `{ ok, saved, steps, date, message }`, the message in Hebrew. Needs
the `FIREBASE_SA_JSON` environment variable on Vercel.

---

## App usage — `users/{uid}/appUsage/{yyyy-mm-dd}`

iOS lets no app read Screen Time, so one shared iPhone shortcut ("ג׳ימי זמן
באפליקציה"), run by an "app opened" and an "app closed" automation for each
app, tells the server the moments; the time in between is the app's time
("זמן באפליקציות" on חיבורים). **Written only by the server** — never from
outside or the app.

| Field | Type | Notes |
|---|---|---|
| `date` | string | Same as the doc id — the day a session **started** (Israel time) |
| `apps` | map | app id → `{ name, seconds, opens, minutes }`: the app's Hebrew/display name, the day's total seconds, how many opens, and `minutes` = seconds ÷ 60 rounded. Docs from before 2026-11-11 have no `name` — use the ready-made app's name. |
| `updatedAt` | Timestamp | Last event |

**App ids.** The ready-made apps in `USAGE.apps` (`js/lib/rules.js`) keep
their id (`instagram`, `facebook`, `tiktok`, `youtube`, `whatsapp`, `x`,
`snapchat`, `netflix`) and are matched by id, Hebrew name, iPhone name or
alias, any case. Any other name gets `c-` + the name, lower case, spaces → `-`
(`"Google Maps"` → `c-google-maps`).

`users/{uid}/appSessions/{appId}` holds the open session:
`{ openSince: Timestamp | null, openDay: "yyyy-mm-dd" | null, updatedAt }`.
A "closed" with no open session, or more than `USAGE.maxSessionMin`
(js/lib/rules.js) after it, is a missed event and isn't counted.

**Into the habit.** On every close the day's minutes are written into the
habit's mark in `habitLogs/{date}` (`source: "shortcut"`, the whole bad-habit
mark: `clean`, `slips`, `value`, `parts`, `level`). The habit is the first
active `limit` habit that has `usageApp: "<app id>"`, else whose `parts`
include the app's name (`"אינסטגרם"`, `"Strava"`, any case; only that part
is set, the others, typed by hand, are kept and summed), else one whose name
contains the app's name and has no parts. None → the minutes are only kept
here. Optional habit field: `usageApp` (string, an app id) to pick the habit
explicitly.

**Which apps the user measures:** `usageApps` on the user doc (see User
settings) — only for the card on חיבורים; the server takes any app.

**`POST /api/usage`** (`api/usage.js`) — a key with scope `usage`, JSON body
either `{ "input": "<app name> <event word>" }` — the automation's text,
e.g. `"אינסטגרם נפתח"`, `"Strava נסגר"`; the last word is the event
(`נפתח`/`open` or `נסגר`/`close`, list in `USAGE.events`), the rest the app —
or `{ "app": "instagram", "event": "open" | "close" }`. Answers
`{ ok, app, event, minutes, opens, habit, message }`, the message in Hebrew
(`"אינסטגרם היום: 22 דק׳"`).

```json
// users/{uid}/appUsage/2026-11-11 — Instagram twice (12 + 10 minutes), Strava once
{ "date": "2026-11-11",
  "apps": { "instagram": { "name": "אינסטגרם", "seconds": 1320, "opens": 2, "minutes": 22 },
            "c-strava":  { "name": "Strava", "seconds": 300, "opens": 1, "minutes": 5 } },
  "updatedAt": "serverTimestamp()" }
```

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
   character. Cardio and sessions use the built-in tables above.
5. **Israel time** for every timestamp; noon when only the date is known.
6. **Estimate, and say so.** Meal macros from a photo or a description are
   estimates — state the assumed portions so the user can correct them
   before saving.
7. Stay inside `users/{uid}/`. Never touch `siteFeedback` or other users.
8. **Never write `dailyActivity.workoutKcal`** — the app owns it. The
   nightly burn merges only `steps`, `stepsKcal` and `totalOutKcal` (see
   Daily activity).
9. **Never write `pointsLedger`, or the `rewards…` fields on the user doc.**
   Points follow from the data: write the meal, the burn or the plan, and
   the app scores it the next time it opens (see Points ledger).
