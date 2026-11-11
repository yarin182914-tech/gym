// Personal keys (js/lib/api-key.js). No libraries:
//   node tools/test-api-key.mjs
// Exits non-zero if any case fails.

const K = await import('../js/lib/api-key.js');

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

const uid = 'N2tdF3DUzEY5YqJfhLJWpD9Qx1K2';
const secret = K.makeSecret();
check('secret is 32 url-safe chars', /^[A-Za-z0-9_-]{32}$/.test(secret), true);
check('two secrets differ', K.makeSecret() !== secret, true);
const key = K.formatKey(uid, secret);
check('round trip', K.parseKey(key), { uid, secret });
check('with Bearer', K.parseKey(`Bearer ${key}`), { uid, secret });
check('bearer lower case, spaces', K.parseKey(`  bearer ${key} `), { uid, secret });
check('wrong prefix', K.parseKey(key.replace('gymi.', 'gym.')), null);
check('missing secret', K.parseKey(`gymi.${uid}.`), null);
check('a path in the uid', K.parseKey(`gymi.${uid}/x.${secret}`), null);
check('empty', K.parseKey(undefined), null);
check('sha-256 hex', await K.hashSecret('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
