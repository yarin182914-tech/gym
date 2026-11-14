// Every colour theme in css/01-tokens.css must define every colour token
// (CLAUDE.md hard rule 12), and text must stay readable on each theme's own
// surfaces and fills:
//   node tools/test-theme-tokens.mjs
// Exits non-zero when a theme block is missing a colour token, sets one
// that :root doesn't know, or drops a text/background pair under its
// minimum contrast.

import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../css/01-tokens.css', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

// name → { token: value }. '' is :root (DARK).
const blocks = new Map();
for (const [, theme, body] of css.matchAll(/:root(?:\[data-theme="([^"]+)"\])?\s*\{([^}]*)\}/g)) {
  const tokens = {};
  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[name] = value.trim();
  blocks.set(theme || '', tokens);
}

const root = blocks.get('');
const themes = [...blocks.keys()].filter(Boolean);
let failed = 0;
const fail = (msg) => {
  console.log(`  FAIL  ${msg}`);
  failed += 1;
};

if (!root || themes.length < 6) {
  console.log('FAILED — expected :root and six theme blocks in css/01-tokens.css');
  process.exit(1);
}

// ---- 1. Coverage: every colour token, in every theme ----
// A colour token is one whose :root value holds a colour, or one that any
// theme block sets. The feet game's drawing is one illustration for every
// theme, so its tokens stay in :root only.
const hasColour = (value) => /#[0-9a-f]{3,8}\b|rgba?\(/i.test(value);
const THEME_INDEPENDENT = (name) => name.startsWith('--foot-');

const colourTokens = new Set(Object.keys(root).filter((name) => hasColour(root[name])));
for (const theme of themes) for (const name of Object.keys(blocks.get(theme))) colourTokens.add(name);

for (const name of [...colourTokens].sort()) {
  if (THEME_INDEPENDENT(name)) continue;
  if (!(name in root)) fail(`${name}: set in a theme block but not in :root`);
  for (const theme of themes) {
    if (!(name in blocks.get(theme))) fail(`${name}: missing in the "${theme}" theme`);
  }
}

// ---- 2. Contrast ----
function parseColour(value) {
  const hex = value.match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
    const n = (i) => parseInt(full.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) / 255 : 1 };
  }
  const rgb = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/i);
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] === undefined ? 1 : +rgb[4] };
  return null;
}

const over = (top, under) => ({
  r: top.r * top.a + under.r * (1 - top.a),
  g: top.g * top.a + under.g * (1 - top.a),
  b: top.b * top.a + under.b * (1 - top.a),
  a: 1,
});

function luminance({ r, g, b }) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(fg, bg) {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

// [text, background, minimum, what it is]. 4.5 = body text (WCAG AA);
// 3 = a bold label, a large number or an icon.
const PAIRS = [
  ['--text', '--bg', 4.5, 'body text on the page'],
  ['--text', '--surface', 4.5, 'body text on a card'],
  ['--text', '--surface-raised', 4.5, 'body text on a raised surface'],
  ['--text-muted', '--bg', 4.5, 'secondary text on the page'],
  ['--text-muted', '--surface', 4.5, 'secondary text on a card'],
  ['--text-muted', '--surface-raised', 4.5, 'secondary text on a raised surface'],
  ['--accent', '--bg', 4.5, 'links and active states on the page'],
  ['--accent', '--surface', 4.5, 'links and active states on a card'],
  ['--gold', '--surface', 4.5, 'chip and badge text on a card'],
  ['--accent-2', '--surface', 4.5, 'exercise names on a card'],
  ['--success-text', '--surface', 4.5, 'done-state text on a card'],
  ['--gold-text', '--accent', 4.5, 'the primary button label (gradient start)'],
  ['--gold-text', '--accent-2-fill', 4.5, 'the primary button label (gradient end)'],
  ['--gold-text', '--success', 4.5, 'the success button label'],
  ['--gold-text', '--danger', 4.5, 'the danger button label'],
  ['--accent-contrast', '--accent', 3, 'the + button icon (gradient start)'],
  ['--accent-contrast', '--accent-2-fill', 3, 'the + button icon (gradient end)'],
  ['--rust', '--surface', 3, 'set index numbers on a card'],
  ['--danger', '--surface', 3, 'the delete icon on a card'],
  ['--ring-train', '--surface', 3, 'the workout ring on a card'],
  ['--ring-food', '--surface', 3, 'the food ring on a card'],
  ['--ring-sleep', '--surface', 3, 'the sleep ring on a card'],
  ['--reward-text', '--reward', 4.5, 'the +points tag'],
];

const allThemes = ['', ...themes];
let checked = 0;
for (const theme of allThemes) {
  const tokens = { ...root, ...blocks.get(theme) };
  const label = theme || 'dark';
  const pageBg = parseColour(tokens['--bg']);
  for (const [fgName, bgName, min, what] of PAIRS) {
    const fgRaw = parseColour(tokens[fgName] || '');
    const bgRaw = parseColour(tokens[bgName] || '');
    if (!fgRaw || !bgRaw || !pageBg) {
      fail(`${label}: cannot read ${fgName} / ${bgName}`);
      continue;
    }
    const bg = over(bgRaw, pageBg);
    const ratio = contrast(over(fgRaw, bg), bg);
    checked += 1;
    if (ratio < min) fail(`${label}: ${fgName} on ${bgName} is ${ratio.toFixed(2)}:1, needs ${min}:1 (${what})`);
  }
}

console.log(
  failed
    ? `FAILED — ${failed} theme token problem(s).`
    : `OK — ${colourTokens.size} colour tokens in all ${allThemes.length} themes, ${checked} contrast pairs.`,
);
process.exit(failed ? 1 : 0);
