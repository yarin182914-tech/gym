import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js';
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-app-check.js';

// These values are safe to be public — Firestore security rules are what
// actually protect the data, not this config object.
const firebaseConfig = {
  apiKey: 'AIzaSyAVNgyxFPTkNnIgSRFaWqkzcGFwOOhjFi0',
  authDomain: 'gym-site-ea1b7.firebaseapp.com',
  projectId: 'gym-site-ea1b7',
  storageBucket: 'gym-site-ea1b7.firebasestorage.app',
  messagingSenderId: '350979502689',
  appId: '1:350979502689:web:270d45e1009493f797f020',
};

// Opt-in local sandbox: `?dev` on localhost swaps the cloud backend for a
// localStorage store (js/lib/dev-store.js) and skips the Google sign-in gate.
// It exists so the app can be exercised end-to-end without interactive auth.
// Deliberately impossible to enable on the deployed site, and it never touches
// real Firestore data — plain localhost with no flag behaves exactly as before.
const IS_LOCALHOST = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
export const useCloud = !(IS_LOCALHOST && new URLSearchParams(location.search).has('dev'));

export const app = useCloud ? initializeApp(firebaseConfig) : null;
export const auth = useCloud ? getAuth(app) : null;
export const db = useCloud
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }),
    })
  : null;

// ---------- App Check (Firebase AI Logic requires this to call Gemini) ----------
// A reCAPTCHA v3 *site key* (public by design, not a secret) registered at
// https://www.google.com/recaptcha/admin/create for this app's real domain,
// then linked under Firebase Console > App Check. Until a real key replaces
// the placeholder below, nutrition photo analysis reports itself unavailable
// instead of making a request that's guaranteed to be rejected — see
// js/lib/nutrition/providers/gemini-vision.js.
const RECAPTCHA_SITE_KEY = 'REPLACE_WITH_RECAPTCHA_V3_SITE_KEY';
export const isAppCheckConfigured = !RECAPTCHA_SITE_KEY.startsWith('REPLACE_');

if (useCloud && isAppCheckConfigured) {
  if (IS_LOCALHOST) {
    // Lets Gemini calls succeed from a local dev server without a real
    // reCAPTCHA challenge. The SDK prints a token to the console on first
    // run — register that same token under Firebase Console > App Check >
    // Manage debug tokens, or local calls will still be rejected.
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}
