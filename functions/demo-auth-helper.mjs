// Shared sign-in helper for the demo scripts. Mirrors how the real app signs
// in (the Auth emulator auto-creates the user on first sign-in), so the demos
// don't depend on pre-created password accounts.
import admin from "firebase-admin";
import { signInWithCustomToken } from "firebase/auth";

export async function signInAs(auth, email, password = "sues2026") {
  if (!admin.apps.length) admin.initializeApp({ projectId: "sues-d7a7f" });
  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
  } catch {
    userRecord = await admin.auth().createUser({ email, password });
  }
  const token = await admin.auth().createCustomToken(userRecord.uid);
  await signInWithCustomToken(auth, token);
}
