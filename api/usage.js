// POST /api/usage — one shared iPhone shortcut, run by an "app opened" and
// an "app closed" automation per app, sends the moments here; the minutes
// in between fill the app's part of a limit habit (אינסטגרם in "אינסטגרם +
// פייסבוק"). iOS gives no app with Screen Time numbers, so this is the
// closest thing.
//
//   Authorization: Bearer gymi.<uid>.<secret>   (a key with scope "usage")
//   Body (JSON):   { "input": "אינסטגרם נפתח" }  — the automation's text
//              or  { "app": "instagram", "event": "open" | "close" }
//
// Writes users/{uid}/appSessions/{app} (the open session),
// appUsage/{date} (the day's seconds and opens) and, on a close, that
// habit's mark in habitLogs/{date}. See docs/DATA.md "App usage".

import { begin, reply, touchKey, FieldValue } from './_shared.js';
import { applyEvent, findUsageHabit, usageMark, minutesOf, parseUsageBody } from '../js/lib/app-usage.js';
import { israelDateKey } from '../js/lib/steps-import.js';

export default async function handler(req, res) {
  let ctx;
  try {
    ctx = await begin(req, res, 'usage');
  } catch (err) {
    console.error('[api/usage]', err);
    return reply(res, 500, { ok: false, message: 'שגיאה בשרת, נסה שוב' });
  }
  if (!ctx) return;
  const { store, userRef, keyRef, body } = ctx;
  const parsed = parseUsageBody(body);
  if (parsed.error) return reply(res, 400, { ok: false, message: parsed.error });
  const { event } = parsed;
  const { id: app, name } = parsed.app;

  try {
    const habitDocs = await userRef.collection('habits').get();
    const target = findUsageHabit(habitDocs.docs.map((d) => ({ id: d.id, ...d.data() })), parsed.app);
    const stateRef = userRef.collection('appSessions').doc(app);

    const out = await store.runTransaction(async (tx) => {
      const stateSnap = await tx.get(stateRef);
      const step = applyEvent(stateSnap.exists ? stateSnap.data() : null, event, new Date(), israelDateKey);
      let dayRef = null;
      let daySnap = null;
      let logRef = null;
      let logSnap = null;
      if (step.add) {
        dayRef = userRef.collection('appUsage').doc(step.add.day);
        daySnap = await tx.get(dayRef);
        if (target && event === 'close') {
          logRef = userRef.collection('habitLogs').doc(step.add.day);
          logSnap = await tx.get(logRef);
        }
      }
      // Reads done; writes from here.
      tx.set(stateRef, { ...step.state, updatedAt: FieldValue.serverTimestamp() });
      if (!step.add) return { minutes: null, opens: null };
      const prev = (daySnap.exists && daySnap.data().apps?.[app]) || {};
      const seconds = (Number(prev.seconds) || 0) + step.add.seconds;
      const opens = (Number(prev.opens) || 0) + step.add.opens;
      const minutes = minutesOf(seconds);
      tx.set(dayRef, {
        date: step.add.day,
        apps: { [app]: { name, seconds, opens, minutes } },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (logRef) {
        const mark = logSnap.exists ? logSnap.data().habits?.[target.habit.id] || null : null;
        tx.set(logRef, {
          date: step.add.day,
          habits: { [target.habit.id]: usageMark(target.habit, target.part, mark, minutes) },
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      return { minutes, opens };
    });
    touchKey(keyRef);

    let message;
    if (event === 'open') message = out.opens ? `${name}: פתיחה ${out.opens} היום` : `${name} נפתח`;
    else message = out.minutes === null ? `${name}: לא נמדד (לא נרשמה פתיחה)` : `${name} היום: ${out.minutes} דק׳`;
    return reply(res, 200, { ok: true, app, event, minutes: out.minutes, opens: out.opens, habit: target?.habit.name || null, message });
  } catch (err) {
    console.error('[api/usage]', err);
    return reply(res, 500, { ok: false, message: 'שגיאה בשרת, נסה שוב' });
  }
}
