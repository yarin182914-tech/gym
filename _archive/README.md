# One-time migration pages (kept for reference, not deployed)

These ran once each and are finished. They live here so they stay out of the
deploy folder — `migrate.html` in particular has workout data embedded and no
re-run guard, so publishing it would risk a duplicate import.

| File | What it did | Status |
|---|---|---|
| `import-data.html` | Copied the dev-store dataset into another browser's localStorage | done |
| `patch-categories.html` | Rewrote 6 exercises from the generic "ידיים" to יד קדמית / יד אחורית | done |
| `migrate.html` | Loaded the 6 historical workouts into the Firestore account | done |

Do not re-run any of these against the live account without first checking what
is already stored — none of them are idempotent.
