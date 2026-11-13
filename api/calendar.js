// /api/calendar — Google Calendar for the app (M7). A one-off task with a
// time or a day gets an event in the user's primary calendar; the spec is
// docs/specs/calendar-sync.md.
//
//   POST, Authorization: Bearer <Firebase ID token>, JSON body:
//     { "action": "status" }                    → is the server set up, and the user's connection
//     { "action": "start" }                     → { url } of Google's consent screen
//     { "action": "sync", "taskIds": ["…"] }    → events created / moved / marked ✓ / deleted;
//                                                 answers { done: [ids], failed: [ids] }
//     { "action": "disconnect" }                → consent revoked, events left as they are
//   GET ?code=…&state=…                         → Google's way back after the consent
//
// The function only ever touches the signed-in user's own documents and
// their own calendar. Secrets come from Vercel's environment variables
// (FIREBASE_SA_JSON, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET).

import { getAuth } from 'firebase-admin/auth';
import { db, reply, readBody } from './_shared.js';
import { CALENDAR } from '../js/lib/rules.js';
import { forCard } from './_lib/calendar-events.js';
import {
  configured, consentUrl, readState, exchangeCode, saveConnection, disconnect, revoke, syncTasks, NotConnected, SCOPE,
} from './_lib/calendar.js';

// Where Google may send the user back: the live site, a branch preview,
// or a local server. Each one is also listed on the OAuth client.
const HOSTS = [/^gym-yarin9\.vercel\.app$/, /^gym-git-[a-z0-9-]+-yarin9\.vercel\.app$/, /^(localhost|127\.0\.0\.1)(:\d+)?$/];

function originOf(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  if (!HOSTS.some((re) => re.test(host))) return null;
  return `${/^(localhost|127\.)/.test(host) ? 'http' : 'https'}://${host}`;
}

// Back to the "חיבורים" page, which says what happened.
function back(res, origin, result) {
  res.statusCode = 302;
  res.setHeader('Location', `${origin}/#/connections?calendar=${result}`);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

async function callback(req, res, origin) {
  const q = new URL(req.url, origin).searchParams;
  const state = readState(q.get('state'));
  const redirect = `${origin}/api/calendar`;
  if (!state || state.redirect !== redirect) return back(res, origin, 'failed');
  if (q.get('error') || !q.get('code')) return back(res, origin, 'cancelled');
  const got = await exchangeCode(q.get('code'), redirect);
  const drop = (result) => {
    revoke(got.refreshToken || got.accessToken);
    return back(res, origin, result);
  };
  // Google lets the user untick the calendar on the consent screen.
  if (!got.scope.split(' ').includes(SCOPE)) return drop('scope');
  if (!got.refreshToken) return drop('failed');
  // The calendar must be the account the user signs in to ג׳ימי with, so
  // a consent link passed to someone else can't tie their calendar to it.
  const user = await getAuth().getUser(state.uid);
  if (user.email && user.email.toLowerCase() !== got.email.toLowerCase()) return drop('account');
  await saveConnection(state.uid, got);
  return back(res, origin, 'ok');
}

export default async function handler(req, res) {
  const origin = originOf(req);
  try {
    if (req.method === 'GET') {
      if (!origin || !configured()) return reply(res, 503, { ok: false, message: 'השרת עוד לא מוגדר' });
      db();
      return await callback(req, res, origin);
    }
    if (req.method !== 'POST') return reply(res, 405, { ok: false, message: 'רק POST' });
    if (!configured()) return reply(res, 200, { ok: true, configured: false });

    const store = db();
    const idToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    let who;
    try {
      who = await getAuth().verifyIdToken(idToken);
    } catch {
      return reply(res, 401, { ok: false, message: 'צריך להתחבר מחדש' });
    }
    const uid = who.uid;
    let body;
    try {
      body = await readBody(req);
    } catch {
      return reply(res, 400, { ok: false, message: 'הגוף אינו JSON תקין' });
    }

    if (body.action === 'status') {
      const snap = await store.collection('users').doc(uid).get();
      return reply(res, 200, { ok: true, configured: true, calendar: forCard(snap.exists ? snap.data().calendar : null) });
    }
    if (body.action === 'start') {
      if (!origin) return reply(res, 400, { ok: false, message: 'כתובת לא מוכרת' });
      return reply(res, 200, { ok: true, url: consentUrl({ uid, redirect: `${origin}/api/calendar`, email: who.email || '' }) });
    }
    if (body.action === 'disconnect') {
      await disconnect(uid);
      return reply(res, 200, { ok: true });
    }
    if (body.action === 'sync') {
      const ids = (Array.isArray(body.taskIds) ? body.taskIds : [])
        .filter((id) => typeof id === 'string' && /^[\w-]{1,64}$/.test(id))
        .slice(0, CALENDAR.batchSize);
      try {
        const { touched, done, failed } = await syncTasks(uid, [...new Set(ids)]);
        // `done`: settled, the app can forget them. `failed`: send again.
        return reply(res, 200, { ok: true, connected: true, touched, done, failed: failed.map((f) => f.id) });
      } catch (err) {
        if (err instanceof NotConnected) return reply(res, 200, { ok: true, connected: false });
        throw err;
      }
    }
    return reply(res, 400, { ok: false, message: 'פעולה לא מוכרת' });
  } catch (err) {
    console.error('[api/calendar]', err);
    if (req.method === 'GET' && origin) return back(res, origin, 'failed');
    return reply(res, 500, { ok: false, message: 'שגיאה בשרת, נסה שוב' });
  }
}
