// Shared by the server functions in api/ (files starting with "_" are not
// endpoints on Vercel). The service account comes from the
// FIREBASE_SA_JSON environment variable — never from the repo.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { parseKey, hashSecret } from '../js/lib/api-key.js';

export { FieldValue };

export function db() {
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SA_JSON)) });
  return getFirestore();
}

export function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

// The common start of every endpoint: POST, a configured server, a valid
// key with `scope`, and a JSON body. Returns { store, userRef, keyRef,
// body } — or null after replying with the error.
export async function begin(req, res, scope) {
  if (req.method !== 'POST') return reply(res, 405, { ok: false, message: 'רק POST' }), null;
  if (!process.env.FIREBASE_SA_JSON) return reply(res, 503, { ok: false, message: 'השרת עוד לא מוגדר' }), null;
  const key = parseKey(req.headers.authorization);
  if (!key) return reply(res, 401, { ok: false, message: 'מפתח חסר או לא תקין' }), null;
  let body;
  try {
    body = await readBody(req);
  } catch {
    return reply(res, 400, { ok: false, message: 'הגוף אינו JSON תקין' }), null;
  }
  const store = db();
  const userRef = store.collection('users').doc(key.uid);
  const keyRef = userRef.collection('apiKeys').doc(await hashSecret(key.secret));
  const keyDoc = await keyRef.get();
  if (!keyDoc.exists || !(keyDoc.data().scopes || []).includes(scope)) {
    reply(res, 401, { ok: false, message: 'המפתח לא מוכר. אפשר ליצור חדש בדף "חיבורים"' });
    return null;
  }
  return { store, userRef, keyRef, body };
}

export const touchKey = (keyRef) => keyRef.update({ lastUsedAt: FieldValue.serverTimestamp() }).catch(() => {});
