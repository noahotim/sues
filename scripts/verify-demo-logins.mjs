import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, getDoc } from "firebase/firestore";

const ACCOUNTS = [
  ["chair.sues@sun.ac.ug", "ROLE_CHAIRPERSON"],
  ["secretary.sues@sun.ac.ug", "ROLE_SECRETARY"],
  ["assistant.sues@sun.ac.ug", "ROLE_ASSISTANT"],
  ["voter.sues@sun.ac.ug", "VOTER"],
];

for (const [email, expected] of ACCOUNTS) {
  const app = initializeApp({ apiKey: "demo", projectId: "demo-sues" }, email);
  const auth = getAuth(app);
  const db = getFirestore(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  try {
    const cred = await signInWithEmailAndPassword(auth, email, "sues2026");
    const token = await cred.user.getIdTokenResult(true);
    const role = token.claims.role;
    const profile = await getDoc(doc(db, "users", cred.user.uid));
    const onRegister = (await getDoc(doc(db, "eligible_emails", email))).exists();
    const ok = role === expected && profile.exists() && onRegister;
    console.log(`${ok ? "PASS" : "FAIL"} ${email}  role=${role}  profile=${profile.exists()}  registered=${onRegister}`);
  } catch (e) {
    console.log(`FAIL ${email} -> ${e.code || e.message}`);
  }
  await deleteApp(app);
}
process.exit(0);
