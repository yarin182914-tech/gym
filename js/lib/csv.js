// Minimal client-side CSV export — "give the data back to its owner" doesn't
// need a spreadsheet library or a server: a Blob + a synthetic <a download>
// is the whole mechanism. Columns are {label, value(row)} pairs so callers
// describe *what* to export, not string-building.

function escapeCsvField(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows, columns) {
  const header = columns.map((c) => escapeCsvField(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => escapeCsvField(c.value(row))).join(','));
  // Leading BOM keeps Excel reading this as UTF-8 instead of guessing an
  // encoding that mangles the Hebrew column headers/content.
  return '﻿' + [header, ...lines].join('\r\n');
}

export function downloadCsv(filename, csvText) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
