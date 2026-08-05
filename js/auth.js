import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js';
import { auth, useCloud } from './firebase-config.js';

const provider = useCloud ? new GoogleAuthProvider() : null;

export function signIn() {
  return signInWithPopup(auth, provider);
}

// Fallback for anyone who'd rather not use (or share) a Google account —
// e.g. a partner logging their own workouts without a separate Google login.
export function signInWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function signUpWithEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
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
