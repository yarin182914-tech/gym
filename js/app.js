import { onAuthChange, signIn } from './auth.js';
import { useCloud } from './firebase-config.js';
import { ensureUserDoc } from './lib/firestore.js';
import { registerRoute, startRouter } from './lib/router.js';
import { mountActiveSession, unmountActiveSession } from './pages/active-session.js';
import { mountHistory, unmountHistory } from './pages/history.js';
import { mountDashboard, unmountDashboard } from './pages/dashboard.js';
import { mountNutrition, unmountNutrition } from './pages/nutrition.js';
import { mountPlan } from './pages/plan.js';
import { captureInstallPrompt, notifyAppEntered } from './ui/install-banner.js';

const authScreen = document.getElementById('auth-screen');
const appRoot = document.getElementById('app');
const nav = document.getElementById('bottom-nav');
const signInBtn = document.getElementById('google-signin-btn');

signInBtn.addEventListener('click', () => {
  signIn().catch((err) => alert('ההתחברות נכשלה: ' + err.message));
});

if ('serviceWorker' in navigator) {
  // Registered unconditionally (dev sandbox included) — network-first means
  // it never masks a fresh edit, it only adds an offline fallback.
  navigator.serviceWorker.register('./sw.js').catch((err) => console.error('[sw] registration failed', err));
}

captureInstallPrompt();

let routerStarted = false;

registerRoute('session', () => mountActiveSession(appRoot), unmountActiveSession);
registerRoute('history', () => mountHistory(appRoot), unmountHistory);
registerRoute('dashboard', () => mountDashboard(appRoot), unmountDashboard);
registerRoute('nutrition', () => mountNutrition(appRoot), unmountNutrition);
registerRoute('plan', () => mountPlan(appRoot));

async function enterApp() {
  authScreen.classList.add('hidden');
  appRoot.classList.remove('hidden');
  nav.classList.remove('hidden');
  notifyAppEntered();
  await ensureUserDoc();
  if (!routerStarted) {
    startRouter();
    routerStarted = true;
  }
}

if (!useCloud) {
  // Local sandbox (`?dev` on localhost) — see js/firebase-config.js.
  const banner = document.createElement('div');
  banner.textContent = 'מצב בדיקה מקומי — הנתונים נשמרים רק בדפדפן הזה ואינם מסונכרנים';
  banner.style.cssText = 'background:var(--accent-dim);color:var(--text);text-align:center;font-size:0.8rem;padding:6px;';
  document.body.prepend(banner);
  const { seedDevStoreIfEmpty } = await import('./dev/seed.js');
  await seedDevStoreIfEmpty();
  enterApp();
} else {
  onAuthChange(async (user) => {
    if (user) {
      await enterApp();
    } else {
      authScreen.classList.remove('hidden');
      appRoot.classList.add('hidden');
      nav.classList.add('hidden');
    }
  });
}
