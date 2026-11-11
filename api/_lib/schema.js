// A small JSON-Schema subset for tool arguments: object / string / number /
// integer / boolean / array, with required, enum, minimum, maximum,
// pattern, maxLength, maxItems and default. Unknown keys are refused, so a
// typo ("calorie") fails loudly instead of silently writing nothing.
// Pure — tools/test-mcp.mjs runs it under Node.

const typeOk = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  integer: (v) => Number.isInteger(v),
  boolean: (v) => typeof v === 'boolean',
  array: (v) => Array.isArray(v),
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
};

function check(schema, value, path) {
  if (!typeOk[schema.type](value)) return `${path}: expected ${schema.type}`;
  if (schema.enum && !schema.enum.includes(value)) return `${path}: must be one of ${schema.enum.join(', ')}`;
  if (schema.type === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) return `${path}: bad format (${schema.description || schema.pattern})`;
    if (schema.maxLength !== undefined && value.length > schema.maxLength) return `${path}: longer than ${schema.maxLength}`;
    if (schema.minLength !== undefined && value.trim().length < schema.minLength) return `${path}: empty`;
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    if (schema.minimum !== undefined && value < schema.minimum) return `${path}: below ${schema.minimum}`;
    if (schema.maximum !== undefined && value > schema.maximum) return `${path}: above ${schema.maximum}`;
  }
  if (schema.type === 'array') {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return `${path}: more than ${schema.maxItems} items`;
    for (let i = 0; i < value.length; i += 1) {
      const err = check(schema.items, value[i], `${path}[${i}]`);
      if (err) return err;
    }
  }
  if (schema.type === 'object' && schema.properties) {
    for (const key of Object.keys(value)) {
      if (!schema.properties[key]) return `${path ? `${path}.` : ''}${key}: unknown argument`;
    }
    for (const key of schema.required || []) {
      if (value[key] === undefined) return `${path ? `${path}.` : ''}${key}: required`;
    }
    for (const [key, sub] of Object.entries(schema.properties)) {
      if (value[key] === undefined) continue;
      const err = check(sub, value[key], path ? `${path}.${key}` : key);
      if (err) return err;
    }
  }
  return null;
}

// → { ok: true, value } with defaults filled in, or { ok: false, error }.
export function validateArgs(schema, args) {
  const value = { ...(args ?? {}) };
  const err = check(schema, value, '');
  if (err) return { ok: false, error: err };
  for (const [key, sub] of Object.entries(schema.properties || {})) {
    if (value[key] === undefined && sub.default !== undefined) value[key] = sub.default;
  }
  return { ok: true, value };
}
