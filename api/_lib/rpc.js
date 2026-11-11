// MCP over Streamable HTTP, stateless: each POST carries one JSON-RPC
// message (or a batch) and gets plain JSON back — no sessions, no SSE
// stream, which is all a serverless function can hold. Pure apart from the
// tool context it's handed, so tools/test-mcp.mjs runs it with a fake store.

import { toolList, callTool } from './tools.js';

export const SERVER_INFO = { name: 'gymi', title: 'ג׳ימי', version: '1.0.0' };
const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

export const INSTRUCTIONS = [
  'ג׳ימי is the user\'s own training, nutrition, sleep and habits app (Hebrew). These tools read and write only this user\'s data.',
  'Dates are Israel dates (yyyy-mm-dd) and times are Israel time. A night of sleep is keyed by the morning.',
  'For the evening check, call get_changes once, then get_today.',
  'Before any write (log_*, mark_habit), show the user exactly what will be saved, in Hebrew, and wait for an explicit yes — unless they just asked for that exact entry. There is no undo and no delete here; deleting is done in the app.',
  'Points and levels are scored by the app from the data; never promise a number of points.',
].join('\n');

const error = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const ok = (id, result) => ({ jsonrpc: '2.0', id, result });

// One message → a response object, or null for a notification.
// ctx: the tool context (store, uid, now, …) for this request.
export async function handleMessage(msg, ctx) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return msg && 'result' in msg ? null : error(msg?.id, -32600, 'Invalid request');
  }
  const isNotification = msg.id === undefined;
  const { id, method, params = {} } = msg;
  if (isNotification) return null; // notifications/initialized, cancelled… nothing to do

  switch (method) {
    case 'initialize': {
      const asked = params.protocolVersion;
      return ok(id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, { tools: toolList() });
    case 'tools/call': {
      if (typeof params.name !== 'string') return error(id, -32602, 'Missing tool name');
      try {
        const result = await callTool(params.name, params.arguments, ctx);
        return result ? ok(id, result) : error(id, -32602, `Unknown tool: ${params.name}`);
      } catch (err) {
        console.error('[mcp] tool failed', params.name, err);
        return ok(id, { content: [{ type: 'text', text: 'Server error while running the tool — try again in a moment.' }], isError: true });
      }
    }
    case 'resources/list':
      return ok(id, { resources: [] });
    case 'prompts/list':
      return ok(id, { prompts: [] });
    default:
      return error(id, -32601, `Method not found: ${method}`);
  }
}

// A POST body (one message or a batch) → the response body, or null when
// there's nothing to answer (only notifications) → HTTP 202.
export async function handleBody(body, ctx) {
  if (Array.isArray(body)) {
    if (!body.length) return error(null, -32600, 'Empty batch');
    const out = (await Promise.all(body.map((m) => handleMessage(m, ctx)))).filter(Boolean);
    return out.length ? out : null;
  }
  return handleMessage(body, ctx);
}
