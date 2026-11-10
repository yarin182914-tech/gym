import { onAuthChange, signIn } from './auth.js';
import { useCloud } from './firebase-config.js';
import { ensureUserDoc } from './lib/firestore.js';
import { startRewards } from './lib/rewards-sync.js';
import { mountRewardMoments } from './ui/reward-moments.js';
import { registerRoute, startRouter } from './lib/router.js';
import { mountActiveSession, unmountActiveSession } from './pages/active-session.js';
import { mountHistory, unmountHistory } from './pages/history.js';
import { mountDashboard, unmountDashboard } from './pages/dashboard.js';
import { mountNutrition, unmountNutrition } from './pages/nutrition.js';
import { mountPlan } from './pages/plan.js';
import { mountToday, unmountToday } from './pages/today.js';
import { mountFeedback, unmountFeedback } from './pages/feedback.js';
import { mountTasks } from './pages/tasks.js';
import { mountSleep, unmountSleep } from './pages/sleep.js';
import { mountImport, stashImportFromUrl, hasPendingImport } from './pages/import.js';
import { mountConnections, unmountConnections } from './pages/connections.js';
import { mountQuickAdd } from './ui/quick-add.js';
import { captureInstallPrompt, notifyAppEntered } from './ui/install-banner.js';
import { mountAppBar } from './ui/app-bar.js';

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
// A steps import (#/import?steps=…) opened while signed out waits here
// for the sign-in.
stashImportFromUrl();

let routerStarted = false;

// The tabs are today, tasks, session, nutrition and sleep. History,
// dashboard, plan and feedback have no tab of their own (see the nav's
// data-routes in index.html) but keep their old URLs.
registerRoute('today', () => mountToday(appRoot), unmountToday);
registerRoute('tasks', () => mountTasks(appRoot));
registerRoute('session', () => mountActiveSession(appRoot), unmountActiveSession);
registerRoute('history', () => mountHistory(appRoot), unmountHistory);
registerRoute('dashboard', () => mountDashboard(appRoot), unmountDashboard);
registerRoute('nutrition', () => mountNutrition(appRoot), unmountNutrition);
registerRoute('sleep', () => mountSleep(appRoot), unmountSleep);
registerRoute('plan', () => mountPlan(appRoot));
registerRoute('feedback', () => mountFeedback(appRoot), unmountFeedback);
registerRoute('connections', () => mountConnections(appRoot), unmountConnections);
registerRoute('import', () => mountImport(appRoot));

async function enterApp() {
  authScreen.classList.add('hidden');
  appRoot.classList.remove('hidden');
  nav.classList.remove('hidden');
  notifyAppEntered();
  mountAppBar(appRoot);
  mountQuickAdd();
  await ensureUserDoc();
  // Points: scores the days since the last visit, then every save; the
  // moments ("+10", confetti, level-up) follow each pass.
  mountRewardMoments();
  startRewards();
  // A stashed steps import runs first, whatever screen the hash says.
  if (hasPendingImport() && !/^#\/import(\?|$)/.test(location.hash)) location.replace('#/import');
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
