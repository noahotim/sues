import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider, connectAuthEmulator, initializeAuth,
  indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence,
  browserPopupRedirectResolver,
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getAnalytics } from "firebase/analytics";

// Config comes from env vars (see .env.example). The literals are safe public
// web-app values used as fallbacks so fresh deployments work out of the box.
const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "AIzaSyBnm-saVnngv21h5zFkKTNG8NBE4XfvHJc",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "suesvotingsystem.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "suesvotingsystem",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "suesvotingsystem.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "913364593346",
  appId: env.VITE_FIREBASE_APP_ID ?? "1:913364593346:web:7f77ba8a92a806e118e95b",
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID
};

export const app = initializeApp(firebaseConfig);

// Multi-layer persistence + explicit resolver. The layered persistence stack is
// the documented remedy for storage-partitioned browsers (Brave/Safari/Chrome
// third-party partitions) where redirect sign-in previously lost its pending
// state ("missing initial state" error).
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
  popupRedirectResolver: browserPopupRedirectResolver,
});
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
