// POST /api/steps — the iPhone shortcut sends the day's steps here in the
// background (no Safari). The phone must be unlocked for the shortcut to read
// Apple Health, so it runs when an app is closed. Same rules as the
// in-app import (#/import, js/lib/steps-import.js): a whole number, today
// or up to a week back, and a day's steps never go down.
//
//   Authorization: Bearer gymi.<uid>.<secret>   (made on "חיבורים")
//   Body (JSON):   { "steps": 12450, "date": "2026-11-10" }   date optional
//
// The key is checked against users/{uid}/apiKeys/{sha256(secret)}; the
// function only ever touches that user's own documents. The service
// account comes from the FIREBASE_SA_JSON environment variable on Vercel —
// never from the repo.

import { begin, reply, touchKey, FieldValue } from './_shared.js';
import { parseImport, mergeSteps } from '../js/lib/steps-import.js';

const fmt = (n) => Number(n).toLocaleString('en-US');

export default async function handler(req, res) {
  let ctx;
  try {
    ctx = await begin(req, res, 'steps');
  } catch (err) {
    console.error('[api/steps]', err);
    return reply(res, 500, { ok: false, message: 'שגיאה בשרת, נסה שוב' });
  }
  if (!ctx) return;
  const { store, userRef, keyRef, body } = ctx;
  // Shortcuts may send the number as text, with a decimal point, or with
  // separators; parseImport takes it as the in-app import does.
  const rawSteps = body.steps === undefined ? '' : String(body.steps).split('.')[0];
  const parsed = parseImport({ steps: rawSteps, date: body.date ? String(body.date) : '' });
  if (parsed.error === 'steps') return reply(res, 400, { ok: false, message: 'מספר הצעדים לא תקין, לא נשמר כלום' });
  if (parsed.error) return reply(res, 400, { ok: false, message: 'התאריך מחוץ לטווח, לא נשמר כלום' });

  try {
    const dayRef = userRef.collection('dailyActivity').doc(parsed.date);
    const saved = await store.runTransaction(async (tx) => {
      const snap = await tx.get(dayRef);
      const patch = mergeSteps(snap.exists ? snap.data() : null, parsed.steps);
      if (!patch) return false;
      tx.set(dayRef, { ...patch, date: parsed.date, loggedAt: FieldValue.serverTimestamp() }, { merge: true });
      return true;
    });
    touchKey(keyRef);

    return reply(res, 200, {
      ok: true,
      saved,
      steps: parsed.steps,
      date: parsed.date,
      message: saved ? `נשמרו ${fmt(parsed.steps)} צעדים` : `כבר רשומים ${fmt(parsed.steps)} צעדים או יותר`,
    });
  } catch (err) {
    console.error('[api/steps]', err);
    return reply(res, 500, { ok: false, message: 'שגיאה בשרת, נסה שוב' });
  }
}
