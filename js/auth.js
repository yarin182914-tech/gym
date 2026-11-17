import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js';
import { auth, useCloud } from './firebase-config.js';

const provider = useCloud ? new GoogleAuthProvider() : null;

export function signIn() {
  return signInWithPopup(auth, provider);
}

export function signOutUser() {
  return signOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

export function currentUid() {
  return auth?.currentUser ? auth.currentUser.uid : null;
}

// When this Google account first signed in (Firebase Auth), or null — the
// "הגוף שלי" card on Today shows only for accounts from BODY.cardFromDate.
export function accountCreatedAt() {
  const t = auth?.currentUser?.metadata?.creationTime;
  const d = t ? new Date(t) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}
