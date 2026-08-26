// Simulates FIRST-EVER sign-in: register entry exists, users/{uid} does NOT.
import admin from "firebase-admin";
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";

process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
admin.initializeApp({ projectId: "sues-d7a7f" });
const adb = admin.firestore();
const aauth = admin.auth();

const app = initializeApp({ apiKey: "demo", projectId: "sues-d7a7f" });
const auth = getAuth(app);
const db = getFirestore(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
connectFirestoreEmulator(db, "127.0.0.1", 8080);

let fails = 0;
const ok = (n, p) => { if (!p) fails++; console.log(`${p ? "PASS" : "FAIL"}  ${n}`); };
const step = async (name, fn) => {
  try { const v = await fn(); console.log(`PASS  ${name}`); return v; }
  catch (e) { fails++; console.log(`FAIL  ${name} :: [${e?.code}] ${e?.message}`); return null; }
};

(async () => {
  await adb.collection("eligible_emails").doc("otim.no25@gmail.com")
    .set({ email: "otim.no25@gmail.com", role: "ROLE_CHAIRPERSON" }, { merge: true });
  try {
    const au = await aauth.getUserByEmail("otim.no25@gmail.com");
    await aauth.updateUser(au.uid, { password: "sues2026" });
  } catch {
    await aauth.createUser({ email: "otim.no25@gmail.com", password: "sues2026", emailVerified: true });
  }
  const au = await aauth.getUserByEmail("otim.no25@gmail.com");
  await adb.collection("users").doc(au.uid).delete().catch(() => {});
  console.log("(fresh first-login state ready)\n");

  const s = await step("sign in", () => signInWithEmailAndPassword(auth, "otim.no25@gmail.com", "sues2026"));
  if (!s) process.exit(1);

  const reg = await step("gate read own register entry",
    () => getDoc(doc(db, "eligible_emails", "otim.no25@gmail.com")));
  ok("register entry exists", !!reg?.exists());
  const role = reg?.exists() && typeof reg.data().role === "string" ? reg.data().role : "VOTER";

  await step("bootstrap users doc (role=" + role + ")", () =>
    setDoc(doc(db, "users", auth.currentUser.uid), {
      email: "otim.no25@gmail.com", fullName: "Otim Noah", role,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));

  await step("admin: read votes tally", () => getDocs(collection(db, "votes")));
  await step("admin: create candidate", () => setDoc(doc(db, "candidates", "test_chair_cand"), {
    electionId: "presec2026", positionId: "pos_president", name: "T", bio: "", photoUrl: "", displayOrder: 99,
  }));

  console.log("\n==== " + (fails === 0 ? "FIRST-LOGIN FLOW OK" : fails + " FAILURE(S)") + " ====");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("ERR", e.message); process.exit(1); });
