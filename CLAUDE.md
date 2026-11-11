# ג׳ימי (Gym app) — instructions for Claude Code

## What this app is
A personal training, nutrition, sleep, habits and tasks PWA in Hebrew (RTL). Live at https://gym-yarin9.vercel.app.
It is becoming a gamified daily hub that friends can also use, each with their own Claude as a coach.

| File | What it is for |
|---|---|
| `docs/upgrade-plan.md` | The product plan (Hebrew). Source of truth for *what* to build. |
| `docs/roadmap.md` | Milestones in build order, their status, and their done-criteria (*how* and *when*). |
| `docs/specs/` | One spec per feature, written by `/feature` before building. |
| `docs/DATA.md` | Every Firestore path and field. The coach Claude writes data by following it. |
| `.claude/commands/feature.md` | The `/feature <request>` flow: questions → spec → plan → approval → build. |

## Working with ירין
- ירין is the product owner, not a developer. Talk to them in **short, plain Hebrew**. Code, comments, commit messages and PRs stay in English.
- **New work starts with `/feature <request>`** (e.g. `/feature רצפים להרגלים`). It asks questions, writes a spec, shows a plan and waits for "כן" before any code. Don't skip it for anything bigger than a small bug fix.
- Ask product questions as multiple choice with your recommendation first ("מומלץ"). Never ask him to paste logs, run git, or edit code; do it yourself.
- ירין wants to **learn the process while building**. At each stage say in one or two Hebrew lines what you are doing and why, in plain words (ענף = a separate copy of the code to work on without touching the live site; קומיט = a saved step; PR = a request to merge the branch into the live site, with a preview to test). No jargon without a short explanation the first time it appears in a conversation.
- ירין tests on the Vercel preview from an iPhone and merges the PR. End every build with the PR link and 3–5 short Hebrew test steps.

## Stack (do not change without asking)
- **App:** plain HTML/CSS/JS ES modules. **No build step, no framework, no npm deps in the app.** The Firebase JS SDK is imported from the gstatic CDN.
- **Data:** Firebase Auth (Google sign-in) + Firestore with a persistent local cache, so the app works offline. Data access only through `js/lib/firestore.js`.
- **Server:** Vercel serverless functions in `api/` (Node, `firebase-admin` from `package.json`, the only npm dependency). Files starting with `_` are helpers, not endpoints. The service account comes from the `FIREBASE_SA_JSON` env var in Vercel.
- **Hosting:** Vercel. Every pushed branch gets a preview URL `gym-git-<branch-with-dashes>-yarin9.vercel.app`. `main` = the live site.
- **Router:** hash routes registered in `js/app.js` via `registerRoute(name, mount, unmount)`. Screens in `js/pages/`, shared UI in `js/ui/`, pure logic in `js/lib/` (no DOM, testable in Node).
- **Styles:** `css/01-tokens.css` (design tokens, light/dark themes), `02-base`, `03-components`, `04-utilities`. Use the tokens, never hard-coded colours.
- **Icons:** Lucide path data via `js/ui/icon.js` (the static nav in `index.html` duplicates them by hand; `tools/check.sh` checks they match).
- **Tunable numbers:** `js/lib/rules.js` (points, levels, streaks, limits, shortcut links).
- **iPhone how-tos:** button names as the phone shows them live in `js/lib/ios-labels.js` (Hebrew + English). Hebrew iOS names verified on ירין's phone: Text = "מלל", Get Contents of URL = "קבלת תוכן של כתובת אינטרנט" (its URL must come from a separate "כתובת אינטרנט" action), app trigger = "אפליקציה" / "נפתחת" / "נסגרת". Anything not verified gets a note in the PR.

## Hard rules
1. **Never push to `main` and never merge.** `main` deploys straight to the live site. Work on a branch named `feature/<milestone>-<short-name>`, push it, and open a PR. ירין merges.
2. **One milestone from `docs/roadmap.md` per branch/PR.** If you find more work, write it down in the PR description under "Follow-ups" (and in the roadmap if it's a new milestone); don't do it.
3. **Plan first.** Before writing code: spec + plan (the `/feature` flow), and wait for ירין's approval.
4. **Data:** every user document lives under `users/{uid}/...` (rules already isolate it). Any new collection or field must be documented in `docs/DATA.md` in the same PR, in the same style as the existing sections.
5. **Never delete or rewrite existing user data**, in migrations or tests. Add fields with safe defaults; read old shapes gracefully. Never write to the production Firestore from a terminal without ירין's explicit "כן" for that exact write.
6. Follow the conventions in `docs/DATA.md`: Israel time zone (`Asia/Jerusalem`) day bucketing, Firestore `Timestamp`s, local noon for date-only values, numbers as numbers.
7. **All tunable numbers in `js/lib/rules.js`**, because ירין has not finalised them. Use the plan's values as defaults.
8. **No secrets in the repo or in client code.** The repo is public. Service-account keys live only in Vercel/GitHub env vars. Never print env vars or keys.
9. **UI language is Hebrew, RTL.** Natural, short Hebrew copy.
10. **No punishment UI:** missed items are grey, never red; points and levels never go down.
11. **Firestore rules:** if `firestore.rules` changes, say so in the PR in bold. ירין must run `firebase deploy --only firestore:rules` before merging.

## Before every commit
- `tools/check.sh` (parses every module; there is no compiler).
- `for t in tools/test-*.mjs; do node "$t" || break; done` — and add a test for any new pure logic in `js/lib/`.
- Open the app locally (`python3 -m http.server 8765`, then `http://localhost:8765/?dev`) and click through the screens you touched, in both themes and at phone width (390px). Check RTL layout and the browser console.
- Small commits in the existing style: `Area: what changed`.

## PR description
What it delivers, screenshots (phone width), new/changed Firestore paths, whether `firestore.rules` changed, how to test on the Vercel preview, and "Follow-ups".

## After a PR is opened
- Mark the milestone ◐ in `docs/roadmap.md` (in the same PR). ירין's merge makes it ☑. The next `/feature` run fixes any status that drifted.
- Keep the spec in `docs/specs/` in sync with what was actually built.
