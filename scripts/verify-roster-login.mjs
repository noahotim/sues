import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

const app = initializeApp({ apiKey: "demo", projectId: "demo-sues" });
const auth = getAuth(app);
const db = getFirestore(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
connectFirestoreEmulator(db, "127.0.0.1", 8080);

let fails = 0;
function record(name, pass, detail = "") {
  if (!pass) fails++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- CASE A: roster-only email (on voter_roster, NOT on register) ----------
{
  const email = "imported1@sun.ac.ug"; // added to demo_election roster earlier
  try { await createUserWithEmailAndPassword(auth, email, "Passw0rd!"); } catch {}
  // Authenticate FIRST (exactly like the real flow: popup -> then checks)
  const c0 = await signInWithEmailAndPassword(auth, email, "Passw0rd!");
  const meta = await getDoc(doc(db, "eligible_emails", "_meta"));
  const onRegister = (await getDoc(doc(db, "eligible_emails", email))).exists();
  const mine = await getDocs(query(collection(db, "voter_roster"), where("voterEmail", "==", email)));
  record("A1 client gate admits roster member (not on register)", meta.exists() && !onRegister && !mine.empty);
  await signOut(auth);

  // Poll for trigger outcome: must SURVIVE with VOTER claim + profile
  let ok = null;
  for (let i = 0; i < 25; i++) {
    await sleep(1000);
    try {
      const c = await signInWithEmailAndPassword(auth, email, "Passw0rd!");
      const t = await c.user.getIdTokenResult(true);
      const prof = await getDoc(doc(db, "users", c.user.uid));
      if (t.claims.role && prof.exists()) { ok = { role: t.claims.role }; break; }
    } catch {}
  }
  record("A2 server keeps roster-member account", !!ok, JSON.stringify(ok));
  record("A3 roster voter gets VOTER role", ok?.role === "VOTER");
}

// ---- CASE B: control - gmail still rejected ---------------------------------
{
  const email = `zz${Date.now()}@gmail.com`;
  try { await createUserWithEmailAndPassword(auth, email, "Passw0rd!"); } catch {}
  let deleted = false;
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    try { await signInWithEmailAndPassword(auth, email, "Passw0rd!"); await signOut(auth); }
    catch { deleted = true; break; }
  }
  record("B1 non-roster gmail still deleted", deleted, email);
}

await signOut(auth);
await deleteApp(app);
console.log("\n==== " + (fails === 0 ? "ALL CHECKS PASSED" : fails + " FAILURE(S)") + " ====");
process.exit(fails ? 1 : 0);
