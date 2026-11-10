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
| `users/{uid}/pointsLedger` | `{date}_{rule}[_{ref}]` | Points, one entry per award — app only, never written from outside |
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
| `source` | string | `manual` (added in the app) · `example` (the starter habits) · `coach` (written from outside) · `library` (from "להפוך להרגל" in ללמוד) |
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
| `source` | string | `sleep` · `habit` · `meal` · `nutrition` · `weight` · `workout` · `bonus` |
| `rule` | string | `sleep-bedtime` · `sleep-duration` · `habit` · `habit-week` · `meal-log` · `calories` · `protein` · `meal-count` · `weigh-in` · `workout` · `workout-week` · `pr` · `perfect-day` |
| `ref` | string \| null | The habit / meal / `<workoutId>_<exercise>` it's for |
| `points` | number | Points awarded (after the daily cap) |
| `raw` | number | What the rule earned before the cap |
| `grade` | string \| null | `full` · `close` · `short` (habit) · `free` (a flexible night's bedtime) |
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
- **Daily cap 200**, not counting the weekly bonuses, records and the
  perfect day.
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
