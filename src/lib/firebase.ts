import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getAnalytics } from "firebase/analytics";

const env = import.meta.env;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
};

const missing = Object.entries(firebaseConfig)
  .filter(([key]) => key !== "measurementId")
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  throw new Error(
    `Missing Firebase configuration: ${missing.join(", ")}. Copy .env.example to .env and fill in your project's values.`,
  );
}

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// When VITE_USE_EMULATORS=true the app talks to the local Firebase
// Emulator Suite instead of the production project (see EMULATOR.md).
if (env.VITE_USE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099");
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
} else {
  try {
    getAnalytics(app);
  } catch {
    // Analytics is optional (blocked by ad-blockers, unsupported browsers).
  }
}

export const googleProvider = new GoogleAuthProvider();
