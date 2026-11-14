# One-time migration pages (kept for reference, not deployed)

These ran once each and are finished. They live here so they stay out of the
deploy folder — `migrate.html` in particular has workout data embedded and no
re-run guard, so publishing it would risk a duplicate import.

`.vercelignore` at the repo root keeps this whole folder off the site (M0b).
The pages load `css/` and `js/` by relative paths from the root, so to read
one in a browser, copy it back to the root first.

| File | What it did | Status |
|---|---|---|
| `import-data.html` | Copied the dev-store dataset into another browser's localStorage | done |
| `patch-categories.html` | Rewrote 6 exercises from the generic "ידיים" to יד קדמית / יד אחורית | done |
| `migrate.html` | Loaded the 6 historical workouts into the Firestore account | done |
| `import-30-7.html` | Added ירין's push workout of 30.7 to the Firestore account (it checks for a workout on that day first) | done, moved here from the root in M0b |

Do not re-run any of these against the live account without first checking what
is already stored — none of them are idempotent.
