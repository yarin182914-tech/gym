const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Escape before interpolating ANY stored or user-entered value into an HTML
// template string — exercise names, meal descriptions and notes are free text,
// so they reach innerHTML as markup otherwise. Safe for both text content and
// quoted attribute values.
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
}
