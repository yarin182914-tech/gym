// Hebrew counts. One goes after its noun ("יום אחד", "נקודה אחת"); every
// other number goes before the plural ("3 ימים", "0 ימים"). Pure — tested
// by tools/test-plural.mjs.

// countHe(1, 'יום', 'ימים') → "יום אחד"; countHe(3, 'יום', 'ימים') → "3 ימים".
// feminine: "אחת" instead of "אחד".
export function countHe(n, one, many, { feminine = false } = {}) {
  if (n === 1) return `${one} ${feminine ? 'אחת' : 'אחד'}`;
  return `${Number(n).toLocaleString('he-IL')} ${many}`;
}
