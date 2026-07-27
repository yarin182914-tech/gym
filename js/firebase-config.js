import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

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
