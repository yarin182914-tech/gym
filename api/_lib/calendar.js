// Google Calendar for the server (M7): the user's stored consent, and the
// events of their tasks. Plain fetch against Google's REST API — no extra
// dependency. The spec is docs/specs/calendar-sync.md.
//
// The refresh token lives in calendarTokens/{uid}, a collection no
// Firestore rule matches, so only this code (firebase-admin) can read it.
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET come from Vercel's environment
// variables — never from the repo.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { db, FieldValue } from '../_shared.js';
import { CALENDAR } from '../../js/lib/rules.js';
import { syncAll } from './calendar-events.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
export const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export const configured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.FIREBASE_SA_JSON);

// The consent was withdrawn (or never given): the user has to connect again.
export class NotConnected extends Error {}

const userRef = (uid) => db().collection('users').doc(uid);
const tokenRef = (uid) => db().collection('calendarTokens').doc(uid);

// ---------- the consent link ----------

const b64 = (text) => Buffer.from(text).toString('base64url');
const sign = (payload) => createHmac('sha256', process.env.GOOGLE_CLIENT_SECRET).update(payload).digest('base64url');

// `state` carries who asked and where Google should come back to, signed
// so the callback can trust it.
export function makeState(uid, redirect) {
  const payload = b64(JSON.stringify({ uid, redirect, exp: Date.now() + CALENDAR.stateTtlMs }));
  return `${payload}.${sign(payload)}`;
}

export function readState(state) {
  const [payload, mac] = String(state || '').split('.');
  if (!payload || !mac) return null;
  const good = Buffer.from(sign(payload));
  const got = Buffer.from(mac);
  if (good.length !== got.length || !timingSafeEqual(good, got)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

export function consentUrl({ uid, redirect, email }) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirect,
    response_type: 'code',
    scope: `openid email ${SCOPE}`,
    // offline + consent: Google hands back a refresh token every time.
    access_type: 'offline',
    prompt: 'consent',
    state: makeState(uid, redirect),
  });
  if (email) q.set('login_hint', email);
  return `${AUTH_URL}?${q}`;
}

// ---------- tokens ----------

async function tokenCall(params) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      ...params,
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, body };
}

// The code Google sent to the callback → { refreshToken, scope, email }.
export async function exchangeCode(code, redirect) {
  const { ok, body } = await tokenCall({ grant_type: 'authorization_code', code, redirect_uri: redirect });
  if (!ok) throw new Error(`code exchange failed: ${body.error || 'unknown'}`);
  let email = '';
  try {
    // Straight from Google over TLS, so the payload is read as it is.
    email = JSON.parse(Buffer.from(body.id_token.split('.')[1], 'base64url').toString()).email || '';
  } catch { /* no email — the caller decides */ }
  return { refreshToken: body.refresh_token || '', accessToken: body.access_token || '', scope: body.scope || '', email };
}

export const revoke = (token) => fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {});

export async function saveConnection(uid, { refreshToken, scope, email }) {
  await tokenRef(uid).set({ refreshToken, scope, createdAt: FieldValue.serverTimestamp() });
  await userRef(uid).set({
    calendar: { connected: true, email, connectedAt: FieldValue.serverTimestamp(), lastSyncAt: null, needsReconnect: false },
  }, { merge: true });
}

export async function disconnect(uid) {
  const snap = await tokenRef(uid).get();
  if (snap.exists) {
    await revoke(snap.data().refreshToken);
    await tokenRef(uid).delete();
  }
  access.delete(uid);
  await userRef(uid).set({ calendar: { connected: false, needsReconnect: false } }, { merge: true });
}

// uid → { token, until }, while the function stays warm.
const access = new Map();

async function accessToken(uid) {
  const hit = access.get(uid);
  if (hit && hit.until > Date.now()) return hit.token;
  const snap = await tokenRef(uid).get();
  if (!snap.exists) throw new NotConnected('no calendar connection');
  const { ok, body } = await tokenCall({ grant_type: 'refresh_token', refresh_token: snap.data().refreshToken });
  if (!ok) {
    if (body.error === 'invalid_grant') {
      // Google dropped the consent: the card asks to connect again.
      await tokenRef(uid).delete();
      await userRef(uid).set({ calendar: { connected: false, needsReconnect: true } }, { merge: true });
      throw new NotConnected('consent withdrawn');
    }
    throw new Error(`token refresh failed: ${body.error || 'unknown'}`);
  }
  access.set(uid, { token: body.access_token, until: Date.now() + (Number(body.expires_in) || 3600) * 1000 - 60000 });
  return body.access_token;
}

// ---------- events ----------

async function gcal(token, method, path = '', body) {
  const res = await fetch(`${EVENTS_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Brings the calendar in line with these tasks (api/_lib/calendar-events.js).
// Returns how many events were touched. Throws NotConnected when there is
// no consent to use.
export async function syncTasks(uid, taskIds) {
  const tasks = userRef(uid).collection('tasks');
  let pending = null; // one token for the whole batch, fetched on first need
  const io = {
    readTask: async (id) => {
      const snap = await tasks.doc(id).get();
      return snap.exists ? snap.data() : null;
    },
    // updatedAt stays as it was: this is bookkeeping, not a change to the
    // task. A task deleted meanwhile is left deleted.
    writeTask: (id, patch) => tasks.doc(id).update(patch).catch(() => {}),
    call: async (method, path, body) => gcal(await (pending ||= accessToken(uid)), method, path, body),
  };
  const { touched, error } = await syncAll(io, uid, taskIds, (err) => err instanceof NotConnected);
  if (touched) await userRef(uid).set({ calendar: { lastSyncAt: FieldValue.serverTimestamp() } }, { merge: true });
  if (error) throw error;
  return touched;
}
