import { onAuthChange, signIn } from './auth.js';
import { isConfigured } from './firebase-config.js';
import { ensureUserDoc } from './lib/firestore.js';
import { registerRoute, startRouter } from './lib/router.js';
import { mountActiveSession, unmountActiveSession } from './pages/active-session.js';
import { mountHistory } from './pages/history.js';
import { mountDashboard } from './pages/dashboard.js';
import { mountNutrition } from './pages/nutrition.js';
import { mountPlan } from './pages/plan.js';

const authScreen = document.getElementById('auth-screen');
const appRoot = document.getElementById('app');
const nav = document.getElementById('bottom-nav');
const signInBtn = document.getElementById('google-signin-btn');

signInBtn.addEventListener('click', () => {
  signIn().catch((err) => alert('ההתחברות נכשלה: ' + err.message));
});

let routerStarted = false;

registerRoute('session', () => { unmountActiveSession(); mountActiveSession(appRoot); });
registerRoute('history', () => mountHistory(appRoot));
registerRoute('dashboard', () => mountDashboard(appRoot));
registerRoute('nutrition', () => mountNutrition(appRoot));
registerRoute('plan', () => mountPlan(appRoot));

async function enterApp() {
  authScreen.classList.add('hidden');
  appRoot.classList.remove('hidden');
  nav.classList.remove('hidden');
  await ensureUserDoc();
  if (!routerStarted) {
    startRouter();
    routerStarted = true;
  }
}

if (!isConfigured) {
  // Local dev mode: no Firebase project wired up yet, so skip the login
  // gate entirely and go straight into the app (data stays in this
  // browser's localStorage — see js/lib/dev-store.js). Remove this branch's
  // relevance automatically disappears once real config is pasted into
  // js/firebase-config.js.
  const banner = document.createElement('div');
  banner.textContent = 'מצב פיתוח מקומי — לא מחובר לענן, הנתונים נשמרים רק בדפדפן הזה';
  banner.style.cssText = 'background:var(--accent-dim);color:#fff;text-align:center;font-size:0.8rem;padding:6px;';
  document.body.prepend(banner);
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
