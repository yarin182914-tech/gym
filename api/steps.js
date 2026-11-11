// Steps from the iPhone, silently (M11): the iOS Shortcut sends
//   GET or POST /api/steps?key=gymi_…&steps=12450&date=2026-11-09
// with "Get Contents of URL" instead of opening the app in Safari, so the
// daily automation runs in the background with no sign-in. Same rules as
// #/import (js/lib/steps-import.js): steps 0…100000, the date up to 7 days
// back and never ahead, and a day's steps never go down. Any key works; a
// steps-only key (scope 'steps', made on the "חיבורים" steps card) can do
// nothing else. The reply is one short Hebrew line, for a "Show Result".

process.env.TZ = 'Asia/Jerusalem';

import { parseImport, mergeSteps, israelDateKey } from '../js/lib/steps-import.js';
import { store, touchKey } from './_lib/store.js';
import { resolveKey, readBody, send } from './_lib/http.js';

const TEXT = 'text/plain; charset=utf-8';
const ERRORS = {
  steps: 'מספר הצעדים לא תקין, לא נשמר כלום',
  date: 'התאריך מחוץ לטווח, לא נשמר כלום',
};
const fmt = (n) => Number(n).toLocaleString('en-US');
const dayMonth = (key) => `${Number(key.slice(8))}.${Number(key.slice(5, 7))}`;

// The query string, plus a JSON or form body's fields on a POST.
async function params(req) {
  const q = new URL(req.url, 'http://x').searchParams;
  if (req.method === 'POST') {
    try {
      const body = await readBody(req);
      if (body && typeof body === 'object') for (const [k, v] of Object.entries(body)) if (!q.has(k)) q.set(k, String(v));
    } catch { /* no JSON body — the query is enough */ }
  }
  q.delete('key');
  return q;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, 'GET או POST בלבד', TEXT);
  }
  const auth = await resolveKey(req);
  if (!auth.key) return send(res, auth.status, auth.status === 401 ? 'המפתח לא תקין או בוטל. יוצרים קישור חדש בג׳ימי ← חיבורים.' : 'השרת לא מוגדר', TEXT);
  const { uid } = auth.key;

  const parsed = parseImport(await params(req), israelDateKey());
  if (parsed.error) return send(res, 400, ERRORS[parsed.error], TEXT);
  const { steps, date } = parsed;

  const now = new Date();
  const existing = await store.getDoc(uid, 'dailyActivity', date);
  const patch = mergeSteps(existing, steps);
  if (patch) {
    await store.setDoc(uid, 'dailyActivity', date, { ...patch, date, loggedAt: store.serverTimestamp() }, { merge: true });
  }
  await touchKey(auth.key, now);
  const where = date === israelDateKey(now) ? 'להיום' : `ל-${dayMonth(date)}`;
  return send(res, 200, patch
    ? `נשמרו ${fmt(steps)} צעדים ${where}`
    : `כבר שמורים ${fmt(existing?.steps ?? 0)} צעדים ${where}, לא שונה כלום`, TEXT);
}
