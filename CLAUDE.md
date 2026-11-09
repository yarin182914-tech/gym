# ג׳ימי (Gym app) — instructions for Claude Code

## What this app is
A personal training, nutrition and habits PWA in Hebrew (RTL). Live at https://gym-yarin9.vercel.app.
It is being upgraded into a gamified daily hub (sleep, habits, tasks, rewards) that friends can also use, each with their own Claude as a coach.

- Full product plan (Hebrew, source of truth for *what* to build): `docs/upgrade-plan.md`
- Build order and acceptance criteria (*how* and *when*): `docs/roadmap.md`
- Data formats in Firestore: `docs/DATA.md`

## Stack (do not change without asking)
- Plain HTML/CSS/JS ES modules. **No build step, no framework, no npm runtime deps.** Firebase JS SDK is imported from the gstatic CDN.
- Firebase Auth (Google sign-in) + Firestore with a persistent local cache (works offline). Hosting on Vercel; every push to a branch gets a Vercel preview URL.
- Router: hash routes registered in `js/app.js` via `registerRoute(name, mount, unmount)`. Each screen lives in `js/pages/`, shared UI in `js/ui/`, data access only through `js/lib/firestore.js`.
- Styles: `css/01-tokens.css` (design tokens, light/dark themes), `02-base`, `03-components`, `04-utilities`. Use the tokens, never hard-coded colours.
- Icons: Lucide path data via `js/ui/icon.js` (the static nav in `index.html` duplicates them by hand).

## Hard rules
1. **Never push to `main` and never merge.** `main` deploys straight to the live site. Work on a branch named `feature/<milestone>-<short-name>`, push it, and open a PR. ירין merges.
2. **One milestone from `docs/roadmap.md` per branch/PR.** If you find more work, write it down in the PR description under "Follow-ups"; don't do it.
3. **Plan first.** Before writing code, read the milestone and the plan sections it points to, then present a short plan (files to touch, data shape, UI states) and wait for approval.
4. **Data:** every user document lives under `users/{uid}/...` (rules already isolate it). Any new collection or field must be documented in `docs/DATA.md` in the same PR, in the same style as the existing sections. The coach Claude writes to Firestore from outside the app by following that file.
5. **Never delete or rewrite existing user data** in migrations. Add fields with safe defaults; read old shapes gracefully.
6. Follow the conventions in `docs/DATA.md`: Israel time zone (`Asia/Jerusalem`) day bucketing, Firestore `Timestamp`s, local noon for date-only values, numbers as numbers.
7. **All tunable numbers in one place.** Points, level thresholds, streak rules, notification caps etc. go in a single config module (e.g. `js/lib/rules.js`), because ירין has not finalised them yet. Use the plan's values as defaults.
8. **No secrets in the repo or in client code.** The Firebase service-account key only ever lives in Vercel/GitHub environment variables (server functions, later milestones).
9. **UI language is Hebrew, RTL.** Write UI copy in natural, short Hebrew. Code, comments and commit messages in English.
10. **No punishment UI:** missed items are grey, never red; points and levels never go down (see the rewards chapter).

## Before every commit
- Run `tools/check.sh` (parses every module; there is no compiler).
- Open the app locally (any static server, e.g. `npx serve .` or `python3 -m http.server`) and click through the screens you touched, in both themes and at phone width (390px). Check RTL layout.
- Keep commits small with clear messages in the existing style: `Area: what changed`.

## PR description
- What the milestone delivers, screenshots (phone width), the new/changed Firestore paths, how to test on the Vercel preview, and "Follow-ups".
