// Shared by the server functions: where the key comes from, the body, and
// the reply.

import { isKeyShaped, hashKey } from '../../js/lib/mcp-keys.js';
import { lookupKey } from './store.js';

// The personal key, from `Authorization: Bearer …` or `?key=`.
export function keyFrom(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const q = req.query?.key ?? new URL(req.url, 'http://x').searchParams.get('key');
  return Array.isArray(q) ? q[0] : q;
}

// → { key } (the mcpKeys doc: hash, uid, scope…), or { status, message }
// when the request can't go on.
export async function resolveKey(req) {
  const key = keyFrom(req);
  if (!isKeyShaped(key)) return { status: 401, message: 'Missing or malformed key — copy the address again from ג׳ימי → חיבורים' };
  try {
    const found = await lookupKey(await hashKey(key));
    return found ? { key: found } : { status: 401, message: 'Unknown or revoked key — make a new one in ג׳ימי → חיבורים' };
  } catch (err) {
    console.error('[api] key lookup failed', err.message);
    return { status: 500, message: 'Server not configured' };
  }
}

export async function readBody(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let text = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : null;
  if (text === null) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    text = Buffer.concat(chunks).toString('utf8');
  }
  return text ? JSON.parse(text) : {};
}

export function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  if (body === undefined) return res.end();
  res.setHeader('Content-Type', type);
  return res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
