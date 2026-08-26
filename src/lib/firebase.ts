import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getAnalytics } from "firebase/analytics";

// Config comes from env vars (see .env.example). The literals are safe public
// web-app values used as fallbacks so fresh deployments work out of the box.
const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "AIzaSyDNAj9wQZOEzPjbTLFdFg53WkrddoxB-Qk",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "sues-vote-live.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "sues-vote-live",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "sues-vote-live.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "729771304998",
  appId: env.VITE_FIREBASE_APP_ID ?? "1:729771304998:web:8a187a6603ff879b3d1ee7",
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
try {
  if (firebaseConfig.measurementId && !firebaseConfig.measurementId.startsWith("G-XXXX")) {
    getAnalytics(app);
  }
} catch {
  // Analytics is optional (blocked by ad-blockers / unsupported browsers).
}
export const googleProvider = new GoogleAuthProvider();

// When running locally against the Firebase emulators, point the SDKs at them.
// Set VITE_USE_EMULATORS=true in .env (see .env.example for the full set).
if (import.meta.env.VITE_USE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
}
