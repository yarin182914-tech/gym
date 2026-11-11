// Personal keys for sending data to ג׳ימי from outside the app — first the
// iPhone steps shortcut (api/steps.js), later the Claude connector (M11).
//
// A key is `gymi.<uid>.<secret>`, shown to the user once. Only a SHA-256
// hash of the secret is stored, at users/{uid}/apiKeys/{hash} (see
// docs/DATA.md), so a leaked database never leaks a working key. The uid
// in the key tells the server where to look; the secret proves it.
//
// No DOM and no Firestore here: the server and tools/test-api-key.mjs run
// it under Node (Web Crypto is global in Node 20+ and every browser).

export const KEY_PREFIX = 'gymi';
const SECRET_BYTES = 24;

function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function makeSecret() {
  return base64url(globalThis.crypto.getRandomValues(new Uint8Array(SECRET_BYTES)));
}

export const formatKey = (uid, secret) => `${KEY_PREFIX}.${uid}.${secret}`;

// "Bearer gymi.<uid>.<secret>" or the bare key → { uid, secret }, or null.
export function parseKey(value) {
  const key = String(value || '').trim().replace(/^Bearer\s+/i, '');
  const m = /^gymi\.([A-Za-z0-9]{10,64})\.([A-Za-z0-9_-]{20,64})$/.exec(key);
  return m ? { uid: m[1], secret: m[2] } : null;
}

export async function hashSecret(secret) {
  const data = new TextEncoder().encode(secret);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
