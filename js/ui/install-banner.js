// A small "install the app" affordance — the browser's own generic install
// menu exists but almost nobody notices it. Captures the native
// beforeinstallprompt event (Chrome/Android/desktop only — iOS Safari never
// fires it, which is a platform limitation, not a bug this module works
// around) and offers a one-tap install via a dismissible banner reusing
// existing components (.card/.btn/icon()) rather than a new one.

import { icon } from './icon.js';

const DISMISS_KEY = 'gym-install-banner-dismissed-v1';
let deferredPrompt = null;
let appEntered = false;
let bannerEl = null;

function eligible() {
  if (localStorage.getItem(DISMISS_KEY)) return false;
  // matchMedia covers Android/desktop Chrome; navigator.standalone is the
  // legacy iOS Safari equivalent. Either means it's already installed.
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) return false;
  return true;
}

// Call once at app boot. beforeinstallprompt fires at most once per page
// load and must be captured immediately or it's lost for that load.
export function captureInstallPrompt() {
  if (!eligible()) return;
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
  if (deferredPrompt) showBanner();
}

function showBanner() {
  if (bannerEl || !eligible()) return;
  bannerEl = document.createElement('div');
  bannerEl.className = 'card install-banner';
  bannerEl.id = 'install-banner';
  bannerEl.innerHTML = `
    <span class="install-banner-text">התקינו את האפליקציה למסך הבית לגישה מהירה יותר</span>
    <div class="install-banner-actions">
      <button type="button" class="btn btn-primary" data-role="install-accept">${icon('download', { className: 'icon--sm' })} התקנה</button>
      <button type="button" class="btn btn-outline" data-role="install-dismiss" aria-label="סגירה">${icon('x', { className: 'icon--sm' })}</button>
    </div>`;
  document.body.appendChild(bannerEl);

  bannerEl.querySelector('[data-role="install-accept"]').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice; // a captured prompt can only be used once
    deferredPrompt = null;
    hideBanner();
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
