import { onAuthChange, signIn, signInWithEmail, signUpWithEmail, resetPassword } from './auth.js';
import { useCloud } from './firebase-config.js';
import { ensureUserDoc } from './lib/firestore.js';
import { registerRoute, startRouter } from './lib/router.js';
import { mountActiveSession, unmountActiveSession } from './pages/active-session.js';
import { mountHistory, unmountHistory } from './pages/history.js';
import { mountDashboard, unmountDashboard } from './pages/dashboard.js';
import { mountNutrition, unmountNutrition } from './pages/nutrition.js';
import { mountPlan } from './pages/plan.js';

const authScreen = document.getElementById('auth-screen');
const appRoot = document.getElementById('app');
const nav = document.getElementById('bottom-nav');
const signInBtn = document.getElementById('google-signin-btn');

signInBtn.addEventListener('click', () => {
  signIn().catch((err) => alert('ההתחברות נכשלה: ' + err.message));
});

// ---------- email/password fallback ----------
// Firebase's error.code is stable across SDK versions; error.message is an
// internal English string not meant for end users, so every code we expect
// to actually hit gets its own Hebrew line instead.
const AUTH_ERROR_MESSAGES = {
  'auth/invalid-email': 'כתובת אימייל לא תקינה.',
  'auth/user-not-found': 'לא נמצא משתמש עם האימייל הזה.',
  'auth/wrong-password': 'סיסמה שגויה.',
  'auth/invalid-credential': 'אימייל או סיסמה שגויים.',
  'auth/email-already-in-use': 'כבר קיים חשבון עם האימייל הזה — נסה/י להתחבר במקום.',
  'auth/weak-password': 'הסיסמה חייבת להכיל לפחות 6 תווים.',
  'auth/too-many-requests': 'יותר מדי ניסיונות — נסה/י שוב בעוד כמה דקות.',
  'auth/missing-password': 'צריך להזין סיסמה.',
};

function authErrorMessage(err) {
  return AUTH_ERROR_MESSAGES[err.code] || 'משהו השתבש. נסה/י שוב.';
}

const emailForm = document.getElementById('email-auth-form');
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const authErrorEl = document.getElementById('auth-error');
const signUpBtn = document.getElementById('email-signup-btn');
const forgotPasswordBtn = document.getElementById('forgot-password-btn');

function setAuthError(text, { isError = true } = {}) {
  authErrorEl.textContent = text;
  authErrorEl.style.color = text ? (isError ? 'var(--danger)' : 'var(--success)') : '';
}

// The submit button (type=submit, inside a <form>) also fires on pressing
// Enter in either field — sign-up stays a separate plain button so that
// habit can't accidentally create a new account instead of signing in.
emailForm.addEventListener('submit', (e) => {
  e.preventDefault();
  setAuthError('');
  signInWithEmail(emailInput.value, passwordInput.value).catch((err) => setAuthError(authErrorMessage(err)));
});

signUpBtn.addEventListener('click', () => {
  setAuthError('');
  signUpWithEmail(emailInput.value, passwordInput.value).catch((err) => setAuthError(authErrorMessage(err)));
});

forgotPasswordBtn.addEventListener('click', () => {
  setAuthError('');
  if (!emailInput.value) {
    setAuthError('כדי לאפס סיסמה, קודם צריך להזין את כתובת האימייל למעלה.');
    return;
  }
  resetPassword(emailInput.value)
    .then(() => setAuthError('נשלח מייל לאיפוס סיסמה.', { isError: false }))
    .catch((err) => setAuthError(authErrorMessage(err)));
});

if ('serviceWorker' in navigator) {
  // Registered unconditionally (dev sandbox included) — network-first means
  // it never masks a fresh edit, it only adds an offline fallback.
  navigator.serviceWorker.register('./sw.js').catch((err) => console.error('[sw] registration failed', err));
}

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
