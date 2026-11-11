// The Claude connector (M11): a remote MCP server (Streamable HTTP,
// stateless) at /api/mcp. Each user pastes
//   https://<site>/api/mcp?key=gymi_…
// into Claude (Settings → Connectors → Add custom connector). The key's
// SHA-256 finds mcpKeys/{hash} → uid, and every tool works only under
// users/{uid}/. Keys are made and revoked on the "חיבורים" page.

// The app buckets days in Israel time and its helpers use the local clock,
// so the function runs in Israel time too (Vercel defaults to UTC).
process.env.TZ = 'Asia/Jerusalem';

import { handleBody } from './_lib/rpc.js';
import { store, touchKey, markChecked } from './_lib/store.js';
import { resolveKey, readBody, send } from './_lib/http.js';

const rpcError = (code, message) => ({ jsonrpc: '2.0', id: null, error: { code, message } });

export default async function handler(req, res) {
  // No server-to-client stream and no sessions in a stateless function.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, rpcError(-32000, 'Use POST'));
  }

  const auth = await resolveKey(req);
  if (!auth.key) return send(res, auth.status, rpcError(auth.status === 401 ? -32001 : -32603, auth.message));
  const found = auth.key;
  // A steps-only key (the iPhone shortcut's) can't open the connector.
  if (found.scope !== 'full') return send(res, 403, rpcError(-32001, 'This key only sends steps — make a Claude key in ג׳ימי → חיבורים'));

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
