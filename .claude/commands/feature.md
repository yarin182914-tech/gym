---
description: New feature request → questions, spec, plan, ירין's approval, then build on a branch and open a PR
argument-hint: <what you want, in your own words, e.g. רצפים להרגלים>
---

# /feature — from a request to a PR

ירין's request: **$ARGUMENTS**

You are the developer; ירין is the product owner and wants to learn the process.
Follow the five stages below **in order**. Talk to ירין in short, plain Hebrew.
At the start of each stage, write one line: which stage this is and what it is for
(e.g. "שלב 2 מתוך 5 — שאלות: כדי שאבנה בדיוק מה שאתה צריך ולא מה שאני מנחש").
If `$ARGUMENTS` is empty, ask ירין in one line what they want to add or change, then start.

---

## Stage 1 — Understand (no questions yet, no code)

1. Read `CLAUDE.md`, `docs/roadmap.md`, and the parts of `docs/upgrade-plan.md`
   and `docs/DATA.md` that touch this request.
2. Run `git fetch origin main && git status`. If the working tree has
   uncommitted changes, stop and tell ירין in one line (don't stash or discard
   them yourself).
3. Find what already exists for this request: grep the code, `docs/specs/`, the roadmap
   (an existing milestone? status?), and any open branch or PR with a similar name.
4. Fix any roadmap status that drifted: a milestone whose PR is merged is ☑.
5. Decide the size:
   - **Small fix** (a bug, wording, one screen tweak, under ~1 hour): skip to Stage 3
     with a 5-line spec in the PR description instead of a spec file.
   - **Feature:** the full flow below.
   - **Too big for one PR:** propose splitting it into milestones (M-numbers in
     roadmap order, each one leaves the app working) and build only the first.

Tell ירין in 2–3 lines what you found: what exists already, where it fits in
the roadmap, the size.

## Stage 2 — Questions

Ask only what the plan, the roadmap and the code don't already answer.
- Ask at most **5 questions per round** and at most 2 rounds. Use the AskUserQuestion tool
  when it is available, otherwise a numbered list.
- Each question is multiple choice, the first option is your recommendation, marked
  "(מומלץ)", with a short reason. ירין may answer "כמו שהמלצת" to all of them.
- Typical topics (pick the relevant ones, don't ask all):
  - What problem it solves for ירין, and what "it works" looks like on a normal day.
  - Who uses it: only ירין, or friends too (multi-user from day one?).
  - Where it lives: which screen, a Today card, the + button, notifications.
  - What gets saved and what is computed (never store what can be derived).
  - Points, streaks and badges (`js/lib/rules.js`), and the no-punishment rule.
  - Offline: must it work in airplane mode?
  - Edge cases: missed days, editing the past, time zone and midnight, old data.
  - What is explicitly *not* in this version.

## Stage 3 — Spec

Write `docs/specs/<short-english-slug>.md` (for example `habit-streaks.md`) with
this template. Product parts in Hebrew (ירין reads them), technical parts in English.

```markdown
# <שם הפיצ׳ר בעברית>
Milestone: M<n> · Branch: feature/<m>-<slug> · Status: draft | approved | built
Requested by ירין on <yyyy-mm-dd>: "<the request in their own words>"

## למה (הבעיה)
## מה זה עושה (במשפט אחד)
## איך זה נראה
Screens and states: empty, first use, normal, loading, offline, error, success.
Where it opens from. Phone width 390px, RTL, light + dark.
## זרימה
Step by step, from the tap to the result.
## חוקים ומספרים
Every number goes to `js/lib/rules.js`, with its default.
## Data (Firestore)
New/changed paths and fields, types, defaults for old documents, who writes them
(app / server / coach). Mirrors what will go into docs/DATA.md.
## Server / outside the app
Only if needed: api/ endpoints, keys, env vars, firestore.rules changes.
## לא בגרסה הזאת
## הגדרת "גמור"
Testable checks, e.g. "marking a habit 3 days in a row shows 3 in the streak,
also offline".
## שאלות פתוחות
```

Also add or update the milestone entry in `docs/roadmap.md`: status ☐, a pointer to
the spec, the done-criteria. Keep the existing style of the roadmap.

## Stage 4 — Plan, then STOP for approval

Show ירין, in Hebrew, short:
1. A link/path to the spec and a 3-line summary of it.
2. The plan: files to add or change (one line each, what and why), data changes,
   tests, and whether `firestore.rules` or env vars change (those need ירין's
   action before merge, so say it clearly).
3. Rough size (S / M / L) and the branch name.
4. The question: "לבנות? (כן / לשנות משהו)".

**Do not write app code before ירין says yes.** Changes → update the spec and
plan, and show only what changed.

## Stage 5 — Build

1. Create the branch from the latest main:
   `git checkout -b feature/<m>-<slug> origin/main`.
   In one line, tell ירין what a branch is: "ענף = עותק נפרד של הקוד, האתר החי לא נפגע".
2. Build in small steps, a commit for each (`Area: what changed`). Pure logic goes in
   `js/lib/` with a `tools/test-<name>.mjs` test. Numbers go in `js/lib/rules.js`. Data
   access goes through `js/lib/firestore.js`. Docs go in `docs/DATA.md`. Follow every hard rule in `CLAUDE.md`.
3. Before each commit, run `tools/check.sh` and all `tools/test-*.mjs`.
4. Check the UI in a browser at 390px, in light and dark, with no console errors. Take
   screenshots of the main states.
5. Update the spec to what was actually built (Status: built), and set the roadmap
   milestone to ◐.
6. Push with `git push -u origin <branch>` and open a PR, with the description from
   `CLAUDE.md` plus the screenshots. Never push to `main`, never merge.
7. Finish with a short Hebrew message to ירין:
   - What was built, in 2–3 lines.
   - The Vercel preview link (`gym-git-<branch-with-dashes>-yarin9.vercel.app`) and the PR link.
   - 3–5 test steps on the iPhone.
   - Anything ירין must do before merging (rules deploy, env var), or "אין".
   - One line on what the PR is and what the merge does ("מיזוג = הענף נכנס לאתר החי").
   - Follow-ups that came up, as one short list.

If something is unclear in the middle of the build, ask one question with a recommendation instead of
guessing. If the build reveals more work, add it under Follow-ups (and to the roadmap
if it's a milestone). Don't widen the PR.
