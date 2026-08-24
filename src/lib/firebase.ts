import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyAw4XaKN7AWSHJ4PKrSVQZBuEOhYGRTV80",
  authDomain: "sues-d7a7f.firebaseapp.com",
  projectId: "sues-d7a7f",
  storageBucket: "sues-d7a7f.firebasestorage.app",
  messagingSenderId: "279653164795",
  appId: "1:279653164795:web:1c382e4587c116d836b25e",
  measurementId: "G-X77Q6NHFY5"
};


export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
getAnalytics(app);
export const googleProvider = new GoogleAuthProvider();
