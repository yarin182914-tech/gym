// The Claude connector (M11): a remote MCP server (Streamable HTTP,
// stateless) at /api/mcp. Each user pastes
//   https://<site>/api/mcp?key=gymi_…
// into Claude (Settings → Connectors → Add custom connector). The key's
// SHA-256 finds mcpKeys/{hash} → uid, and every tool works only under
// users/{uid}/. Keys are made and revoked on the "חיבורים" page.

// The app buckets days in Israel time and its helpers use the local clock,
// so the function runs in Israel time too (Vercel defaults to UTC).
process.env.TZ = 'Asia/Jerusalem';

import { isKeyShaped, hashKey } from '../js/lib/mcp-keys.js';
import { handleBody } from './_lib/rpc.js';
import { store, lookupKey, touchKey, markChecked } from './_lib/store.js';

function keyFrom(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const q = req.query?.key ?? new URL(req.url, 'http://x').searchParams.get('key');
  return Array.isArray(q) ? q[0] : q;
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let text = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : null;
  if (text === null) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    text = Buffer.concat(chunks).toString('utf8');
  }
  return JSON.parse(text);
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  if (body === undefined) return res.end();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(body));
}

const rpcError = (code, message) => ({ jsonrpc: '2.0', id: null, error: { code, message } });

export default async function handler(req, res) {
  // No server-to-client stream and no sessions in a stateless function.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, rpcError(-32000, 'Use POST'));
  }

  const key = keyFrom(req);
  if (!isKeyShaped(key)) return send(res, 401, rpcError(-32001, 'Missing or malformed key — copy the connector address again from ג׳יני → חיבורים'));
  let found;
  try {
    found = await lookupKey(await hashKey(key));
  } catch (err) {
    console.error('[mcp] key lookup failed', err.message);
    return send(res, 500, rpcError(-32603, 'Server not configured'));
  }
  if (!found) return send(res, 401, rpcError(-32001, 'Unknown or revoked key — make a new one in ג׳יני → חיבורים'));

  let body;
  try {
    body = await readBody(req);
  } catch {
    return send(res, 400, rpcError(-32700, 'Parse error'));
  }

  const now = new Date();
  const ctx = {
    store,
    uid: found.uid,
    now,
    lastCheckAt: found.lastCheckAt,
    markChecked: (at) => markChecked(found, at),
  };
  const [out] = await Promise.all([handleBody(body, ctx), touchKey(found, now)]);
  return out === null ? send(res, 202) : send(res, 200, out);
}
