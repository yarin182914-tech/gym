// Personal keys for the Claude connector (M11). Pure functions on Web
// Crypto, so the "חיבורים" card (browser) and the MCP server (Node,
// api/mcp.js) make and hash keys the same way — tools/test-mcp.mjs checks
// both. A key is shown once; only its SHA-256 (hex) is stored, as the id
// of mcpKeys/{hash} (docs/DATA.md).

import { MCP } from './rules.js';

const KEY_RE = new RegExp(`^${MCP.keyPrefix}[A-Za-z0-9_-]{${Math.ceil((MCP.keyBytes * 4) / 3)}}$`);

function base64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// A new random key, e.g. "gymi_3q2-…" (48 characters).
export function generateKey() {
  const bytes = new Uint8Array(MCP.keyBytes);
  crypto.getRandomValues(bytes);
  return MCP.keyPrefix + base64url(bytes);
}

// Whether a string has a key's shape — checked before any lookup.
export const isKeyShaped = (key) => typeof key === 'string' && KEY_RE.test(key);

// SHA-256 of the key, lowercase hex (64 characters).
export async function hashKey(key) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// What's kept in the clear to recognise a key on the card: "gymi_AbCd".
export const keyPreview = (key) => String(key).slice(0, MCP.previewChars);

// The address pasted into Claude (Settings → Connectors → Add custom
// connector). Claude's connector form has no header field, so the key
// rides in the query string.
export const connectorUrl = (origin, key) => `${origin}/api/mcp?key=${encodeURIComponent(key)}`;
