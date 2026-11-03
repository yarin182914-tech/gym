// "Install the app" — the difference between a browser tab with an address
// bar and a full-screen app with its own icon. The manifest, icons and
// service worker already make it installable; this is what gets it
// actually installed:
//
// - Chrome/Android/desktop fire beforeinstallprompt — captured here and
//   offered as a one-tap install banner.
// - iOS Safari never fires it (a platform limitation): there's no button
//   that can install, only Share → "הוספה למסך הבית", so the banner and
//   the settings entry show those steps instead.
//
// The banner can be dismissed for good; ⚙ settings keeps "התקנת האפליקציה"
// for as long as the app runs in a browser (installApp below).

import { icon } from './icon.js';
import { openBottomSheet } from './bottom-sheet.js';

const DISMISS_KEY = 'gym-install-banner-dismissed-v1';
let deferredPrompt = null;
let appEntered = false;
let bannerEl = null;

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS reports as a Mac

// matchMedia covers Android/desktop Chrome; navigator.standalone is the
// legacy iOS Safari equivalent. Either means it's already installed.
export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function eligible() {
  try {
    if (localStorage.getItem(DISMISS_KEY)) return false;
  } catch { /* blocked storage — just offer it */ }
  return !isStandalone();
}

// Call once at app boot. beforeinstallprompt fires at most once per page
// load and must be captured immediately or it's lost for that load.
export function captureInstallPrompt() {
  if (isStandalone()) return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (appEntered) showBanner();
  });
  window.addEventListener('appinstalled', () => {
    localStorage.setItem(DISMISS_KEY, '1');
    hideBanner();
  });
}

// Call once the signed-in shell is showing — the banner anchors above the
// bottom nav, which is hidden until then.
export function notifyAppEntered() {
  appEntered = true;
  if (deferredPrompt || isIOS()) showBanner();
}

// ⚙ settings' "התקנת האפליקציה": the native prompt where there is one,
// otherwise the steps for this browser.
export async function installApp() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice; // a captured prompt can only be used once
    deferredPrompt = null;
    hideBanner();
    return;
  }
  openInstallSteps();
}

function openInstallSteps() {
  const steps = isIOS()
    ? [
      ['share', 'ב-Safari, הקישו על כפתור השיתוף בסרגל התחתון'],
      ['square-plus', 'גללו ובחרו "הוספה למסך הבית"'],
      ['download', 'פתחו את האפליקציה מהאייקון החדש — היא תיפתח במסך מלא'],
    ]
    : [
      ['ellipsis-vertical', 'ב-Chrome, הקישו על תפריט ⋮ בפינה'],
      ['download', 'בחרו "התקנת אפליקציה" (או "הוספה למסך הבית")'],
      ['square-plus', 'פתחו את האפליקציה מהאייקון החדש — היא תיפתח במסך מלא'],
    ];
  openBottomSheet({
    ariaLabel: 'התקנת האפליקציה',
    render(body, sheetApi) {
      body.innerHTML = `
        <h3 style="margin:0 0 6px; color:var(--text);">התקנת האפליקציה</h3>
        <p class="text-muted" style="font-size:var(--text-sm);">כך היא נפתחת במסך מלא, בלי שורת הכתובת של הדפדפן.</p>
        <ol class="install-steps">
          ${steps.map(([name, text]) => `<li>${icon(name, { className: 'icon--sm' })}<span>${text}</span></li>`).join('')}
        </ol>
        <p class="text-muted" style="font-size:0.8rem;">כבר יש אייקון שנפתח עם שורת כתובת? מחקו אותו והוסיפו מחדש.</p>
        <div class="sheet-actions">
          <button type="button" class="btn btn-primary" data-close>הבנתי</button>
        </div>`;
      body.querySelector('[data-close]').addEventListener('click', () => sheetApi.close());
    },
  });
}

function showBanner() {
  if (bannerEl || !eligible()) return;
  const ios = !deferredPrompt;
  bannerEl = document.createElement('div');
  bannerEl.className = 'card install-banner';
  bannerEl.id = 'install-banner';
  bannerEl.innerHTML = `
    <span class="install-banner-text">התקינו את האפליקציה למסך הבית — מסך מלא, בלי שורת הכתובת</span>
    <div class="install-banner-actions">
      <button type="button" class="btn btn-primary" data-role="install-accept">${icon(ios ? 'share' : 'download', { className: 'icon--sm' })} ${ios ? 'איך?' : 'התקנה'}</button>
      <button type="button" class="btn btn-outline" data-role="install-dismiss" aria-label="סגירה">${icon('x', { className: 'icon--sm' })}</button>
    </div>`;
  document.body.appendChild(bannerEl);

  bannerEl.querySelector('[data-role="install-accept"]').addEventListener('click', () => {
    if (ios) {
      hideBanner();
      openInstallSteps();
    } else {
      installApp();
    }
  });
  bannerEl.querySelector('[data-role="install-dismiss"]').addEventListener('click', () => {
    localStorage.setItem(DISMISS_KEY, '1');
    hideBanner();
  });
}

function hideBanner() {
  bannerEl?.remove();
  bannerEl = null;
}
