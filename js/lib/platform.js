// Which device and browser this is, and which "install to the home screen"
// button fits it. Pure: every input is passed in, so tools/test-platform.mjs
// can run it in Node. js/ui/install-banner.js feeds it the real navigator.

// An in-app browser (a link opened inside Instagram, Facebook, TikTok…) or
// another iPhone browser: none of them is the Safari the install steps
// describe.
const IOS_NOT_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|GSA\/|FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|Snapchat/i;

// env: { userAgent, platform, maxTouchPoints } — the navigator's fields.
// Returns { os: 'ios' | 'android' | 'other', safari: boolean }.
export function detectPlatform(env = {}) {
  const ua = String(env.userAgent || '');
  const ios = /iphone|ipad|ipod/i.test(ua)
    // iPadOS reports itself as a Mac; a real Mac has no touch screen.
    || (env.platform === 'MacIntel' && Number(env.maxTouchPoints) > 1);
  if (ios) return { os: 'ios', safari: /safari/i.test(ua) && !IOS_NOT_SAFARI.test(ua) };
  if (/android/i.test(ua)) return { os: 'android', safari: false };
  return { os: 'other', safari: false };
}

// What the first screen offers:
//   'prompt' — the browser handed over its own install window (Chrome on
//              Android and on a computer): one tap opens it.
//   'steps'  — Safari on an iPhone or iPad can install, but only by hand
//              from the share menu: show the steps.
//   null     — already installed, or a browser that can't install: no button.
export function installOffer({ platform, standalone = false, hasPrompt = false } = {}) {
  if (standalone) return null;
  if (hasPrompt) return 'prompt';
  if (platform?.os === 'ios' && platform.safari) return 'steps';
  return null;
}
