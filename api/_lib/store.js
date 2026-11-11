// Firestore for the MCP server (M11), through firebase-admin. The service
// account comes from the FIREBASE_SA_JSON environment variable (Vercel →
// Settings → Environment Variables) — never from the repo.
//
// Every data call takes the uid the key resolved to and builds its path
// under users/{uid}/ — the tools have no other way in.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { MCP } from '../../js/lib/rules.js';

let db = null;

function firestore() {
  if (db) return db;
  const raw = process.env.FIREBASE_SA_JSON;
  if (!raw) throw new Error('FIREBASE_SA_JSON is not set');
  const app = getApps()[0] || initializeApp({ credential: cert(JSON.parse(raw)) });
  db = getFirestore(app);
  return db;
}

const col = (uid, name) => firestore().collection('users').doc(uid).collection(name);
const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

export const store = {
  async userDoc(uid) {
    const snap = await firestore().collection('users').doc(uid).get();
    return snap.exists ? snap.data() : {};
  },
  async getDoc(uid, name, id) {
    const snap = await col(uid, name).doc(id).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  },
  async listAll(uid, name) {
    return rows(await col(uid, name).get());
  },
  // Docs whose `date` string (yyyy-mm-dd) is within [from, to].
  async listDated(uid, name, from, to) {
    return rows(await col(uid, name).where('date', '>=', from).where('date', '<=', to).get());
  },
  // Docs whose Timestamp `field` is within [from, to).
  async listTimed(uid, name, field, from, to, max = 500) {
    return rows(await col(uid, name).where(field, '>=', Timestamp.fromDate(from)).where(field, '<', Timestamp.fromDate(to))
      .orderBy(field, 'desc').limit(max).get());
  },
  // Docs whose Timestamp `field` is after `since`.
  async listSince(uid, name, field, since, max = 200) {
    return rows(await col(uid, name).where(field, '>', Timestamp.fromDate(since)).orderBy(field, 'desc').limit(max).get());
  },
  async setDoc(uid, name, id, data, { merge = false } = {}) {
    await col(uid, name).doc(id).set(data, { merge });
  },
  async addDoc(uid, name, data) {
    return (await col(uid, name).add(data)).id;
  },
  timestamp: (date) => Timestamp.fromDate(date),
  serverTimestamp: () => FieldValue.serverTimestamp(),
};

// ---------- keys: mcpKeys/{sha256} → { uid, preview, createdAt, … } ----------

const keyCache = new Map(); // hash → { key, at }

// The key's doc ({ hash, uid, lastCheckAt, lastUsedAt }), or null when
// it's unknown or revoked. Cached for MCP.keyCacheMs.
export async function lookupKey(hash) {
  const hit = keyCache.get(hash);
  if (hit && Date.now() - hit.at < MCP.keyCacheMs) return hit.key;
  const snap = await firestore().collection('mcpKeys').doc(hash).get();
  const data = snap.exists ? snap.data() : null;
  const key = data && typeof data.uid === 'string' && data.uid
    ? { hash, uid: data.uid, lastCheckAt: data.lastCheckAt?.toDate() ?? null, lastUsedAt: data.lastUsedAt?.toDate() ?? null }
    : null;
  keyCache.set(hash, { key, at: Date.now() });
  return key;
}

// Bookkeeping on the key doc, written by the server only (the rules don't
// let the app change a key after creating it). update() fails on a key
// deleted in the meantime — that's fine, it's revoked.
async function patchKey(key, patch) {
  try {
    await firestore().collection('mcpKeys').doc(key.hash).update(patch);
    Object.assign(key, Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v.toDate ? v.toDate() : v])));
  } catch (err) {
    console.warn('[mcp] key update failed', err.code || err.message);
  }
}

export async function touchKey(key, now) {
  if (key.lastUsedAt && now - key.lastUsedAt < MCP.touchEveryMs) return;
  await patchKey(key, { lastUsedAt: Timestamp.fromDate(now) });
}

export const markChecked = (key, now) => patchKey(key, { lastCheckAt: Timestamp.fromDate(now) });
