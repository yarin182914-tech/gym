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

// True once the real Firebase project config has been pasted in above.
// Until then the app runs in local dev mode (see js/lib/dev-store.js):
// no login required, data is kept in this browser's localStorage instead
// of syncing to the cloud. Switches back to real Firebase/auth automatically
// the moment this file has real values.
export const isConfigured = firebaseConfig.apiKey !== 'REPLACE_ME';

export const app = isConfigured ? initializeApp(firebaseConfig) : null;
export const auth = isConfigured ? getAuth(app) : null;
export const db = isConfigured
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }),
    })
  : null;
