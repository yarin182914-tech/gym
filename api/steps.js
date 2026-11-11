// POST /api/steps — the iPhone shortcut sends the day's steps here in the
// background (no Safari, works with the phone locked). Same rules as the
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

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { parseKey, hashSecret } from '../js/lib/api-key.js';
import { parseImport, mergeSteps } from '../js/lib/steps-import.js';

function db() {
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SA_JSON)) });
  return getFirestore();
}

const fmt = (n) => Number(n).toLocaleString('en-US');

function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { ok: false, message: 'רק POST' });
  if (!process.env.FIREBASE_SA_JSON) return reply(res, 503, { ok: false, message: 'השרת עוד לא מוגדר' });

  const key = parseKey(req.headers.authorization);
  if (!key) return reply(res, 401, { ok: false, message: 'מפתח חסר או לא תקין' });

  let body;
  try {
    body = await readBody(req);
  } catch {
    return reply(res, 400, { ok: false, message: 'הגוף אינו JSON תקין' });
  }
  // Shortcuts may send the number as text, with a decimal point, or with
  // separators; parseImport takes it as the in-app import does.
  const rawSteps = body.steps === undefined ? '' : String(body.steps).split('.')[0];
  const parsed = parseImport({ steps: rawSteps, date: body.date ? String(body.date) : '' });
  if (parsed.error === 'steps') return reply(res, 400, { ok: false, message: 'מספר הצעדים לא תקין, לא נשמר כלום' });
  if (parsed.error) return reply(res, 400, { ok: false, message: 'התאריך מחוץ לטווח, לא נשמר כלום' });

  try {
    const store = db();
    const userRef = store.collection('users').doc(key.uid);
    const keyRef = userRef.collection('apiKeys').doc(await hashSecret(key.secret));
    const keyDoc = await keyRef.get();
    if (!keyDoc.exists || !(keyDoc.data().scopes || []).includes('steps')) {
      return reply(res, 401, { ok: false, message: 'המפתח לא מוכר. אפשר ליצור חדש בדף "חיבורים"' });
    }

    const dayRef = userRef.collection('dailyActivity').doc(parsed.date);
    const saved = await store.runTransaction(async (tx) => {
      const snap = await tx.get(dayRef);
      const patch = mergeSteps(snap.exists ? snap.data() : null, parsed.steps);
      if (!patch) return false;
      tx.set(dayRef, { ...patch, date: parsed.date, loggedAt: FieldValue.serverTimestamp() }, { merge: true });
      return true;
    });
    keyRef.update({ lastUsedAt: FieldValue.serverTimestamp() }).catch(() => {});

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
