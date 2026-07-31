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
