// Hebrew counts (js/lib/plural.js). No libraries:
//   node tools/test-plural.mjs
// Exits non-zero if any case fails.

const { countHe } = await import('../js/lib/plural.js');

let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`  ok    ${name}`);
  else {
    failed += 1;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        got      ${a}`);
  }
}

console.log('counts');
check('one, masculine', countHe(1, 'יום', 'ימים'), 'יום אחד');
check('one, feminine', countHe(1, 'נקודה', 'נקודות', { feminine: true }), 'נקודה אחת');
check('zero takes the plural', countHe(0, 'יום', 'ימים'), '0 ימים');
check('two and up', [2, 3, 21].map((n) => countHe(n, 'הרגל', 'הרגלים')), ['2 הרגלים', '3 הרגלים', '21 הרגלים']);
check('thousands get a separator', countHe(1250, 'נקודה', 'נקודות', { feminine: true }), '1,250 נקודות');

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
