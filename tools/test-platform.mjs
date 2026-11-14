// Which install button the first screen offers (js/lib/platform.js). No libraries:
//   node tools/test-platform.mjs
// Exits non-zero if any case fails.

const { detectPlatform, installOffer } = await import('../js/lib/platform.js');

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

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Instagram 359.0.0.25.90 (iPhone15,2; iOS 18_1; he_IL; he; scale=3.00; 1179x2556; 665236729)',
  ipadAsMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0',
  windowsChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

const iphone = detectPlatform({ userAgent: UA.iphoneSafari, platform: 'iPhone', maxTouchPoints: 5 });
const iphoneChrome = detectPlatform({ userAgent: UA.iphoneChrome, platform: 'iPhone', maxTouchPoints: 5 });
const iphoneInApp = detectPlatform({ userAgent: UA.iphoneInstagram, platform: 'iPhone', maxTouchPoints: 5 });
const ipad = detectPlatform({ userAgent: UA.ipadAsMac, platform: 'MacIntel', maxTouchPoints: 5 });
const mac = detectPlatform({ userAgent: UA.ipadAsMac, platform: 'MacIntel', maxTouchPoints: 0 });
const android = detectPlatform({ userAgent: UA.android, platform: 'Linux armv81', maxTouchPoints: 5 });
const androidFirefox = detectPlatform({ userAgent: UA.androidFirefox, platform: 'Linux armv81', maxTouchPoints: 5 });
const desktop = detectPlatform({ userAgent: UA.windowsChrome, platform: 'Win32', maxTouchPoints: 0 });

console.log('detectPlatform');
check('iPhone in Safari', iphone, { os: 'ios', safari: true });
check('iPhone in Chrome is not Safari', iphoneChrome, { os: 'ios', safari: false });
check('iPhone inside Instagram is not Safari', iphoneInApp, { os: 'ios', safari: false });
check('an iPad that reports as a Mac', ipad, { os: 'ios', safari: true });
check('a real Mac (no touch screen)', mac, { os: 'other', safari: false });
check('Android', android, { os: 'android', safari: false });
check('a computer', desktop, { os: 'other', safari: false });
check('nothing passed in', detectPlatform(), { os: 'other', safari: false });

console.log('installOffer');
check('iPhone in Safari: the steps', installOffer({ platform: iphone }), 'steps');
check('iPad that reports as a Mac: the steps', installOffer({ platform: ipad }), 'steps');
check('iPhone in Chrome: no button', installOffer({ platform: iphoneChrome }), null);
check('iPhone inside Instagram: no button', installOffer({ platform: iphoneInApp }), null);
check('Android, before Chrome offers: no button', installOffer({ platform: android }), null);
check('Android, once Chrome offers: its window', installOffer({ platform: android, hasPrompt: true }), 'prompt');
check('Android Firefox never offers: no button', installOffer({ platform: androidFirefox }), null);
check('a computer, once Chrome offers: its window', installOffer({ platform: desktop, hasPrompt: true }), 'prompt');
check('a computer with no offer: no button', installOffer({ platform: desktop }), null);
check('a Mac in Safari: no button', installOffer({ platform: mac }), null);
check('already installed on an iPhone: no button', installOffer({ platform: iphone, standalone: true }), null);
check('already installed on Android: no button', installOffer({ platform: android, standalone: true, hasPrompt: true }), null);
check('nothing passed in', installOffer(), null);

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
