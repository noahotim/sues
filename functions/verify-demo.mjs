// Verify the demo end-to-end against the emulators.
// Run from functions/ dir: node verify-demo.mjs
// (it uses the admin SDK to clear prior VOTES only, leaving the roster intact)
import admin from "firebase-admin";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth, connectAuthEmulator,
  signInWithEmailAndPassword, signOut,
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, collection, query, where } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";
import { signInAs } from "./demo-auth-helper.mjs";

process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Light reset: clear prior votes/receipts + reset hasVoted, keep roster rows.
async function resetVoteState() {
  const fdb = admin.firestore();
  const votes = await fdb.collection("votes").get();
  const batch = fdb.batch();
  votes.docs.forEach((d) => batch.delete(d.ref));
  const receipts = await fdb.collectionGroup("receipts").get();
  receipts.docs.forEach((d) => batch.delete(d.ref));
  const ros = await fdb.collection("voter_roster").get();
  ros.docs.forEach((d) => batch.update(d.ref, { hasVoted: false, votedPositions: [] }));
  await batch.commit();
  console.log(`reset vote state (votes=${votes.size}, receipts=${receipts.size}, roster rows=${ros.size})`);
}
admin.initializeApp({ projectId: "sues-d7a7f" });
await resetVoteState();

// --- client-side verification -------------------------------------------
const app = initializeApp({ apiKey: "demo", projectId: "sues-d7a7f" });
const auth = getAuth(app);
const db = getFirestore(app);
const fns = getFunctions(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
connectFirestoreEmulator(db, "127.0.0.1", 8080);
connectFunctionsEmulator(fns, "127.0.0.1", 5001);

const EID = "presec2026";
let fails = 0;
const ok = (n, p, d = "") => { if (!p) fails++; console.log(`${p ? "PASS" : "FAIL"}  ${n}${d ? " -- " + d : ""}`); };

// Replicates the client login-gate (authService.signInWithGoogle)
async function passesGate(email) {
  const onRegister = await getDoc(doc(db, "eligible_emails", email));
  if (onRegister.exists()) return true;
  const ros = await getDocs(query(collection(db, "voter_roster"), where("voterEmail", "==", email.toLowerCase())));
  return !ros.empty;
}

// 1. CSV voter login-gate + vote flow
{
  const email = "apio.samson@sun.ac.ug";
  await signInAs(auth, email);
  ok("CSV voter passes login gate", await passesGate(email), email);

  const castVote = httpsCallable(fns, "castVote");
  const r1 = await castVote({ electionId: EID, positionId: "pos_president", candidateId: "cand_pres1" });
  ok("votes President (Otim James)", r1.data?.success === true);
  const r2 = await castVote({ electionId: EID, positionId: "pos_secretary", candidateId: "cand_sec2" });
  ok("votes Secretary (Otime)", r2.data?.success === true);

  let blocked = false;
  try { await castVote({ electionId: EID, positionId: "pos_president", candidateId: "cand_pres1" }); } catch (e) { blocked = e.code === "functions/already-exists"; }
  ok("double vote for a position blocked", blocked);
  await signOut(auth);
}

// 2. another CSV voter
{
  const email = "akello.mary@sun.ac.ug";
  await signInAs(auth, email);
  ok("2nd CSV voter passes login gate", await passesGate(email));
  const castVote = httpsCallable(fns, "castVote");
  const r = await castVote({ electionId: EID, positionId: "pos_president", candidateId: "cand_pres2" });
  ok("2nd CSV voter can vote (Okeelo)", r.data?.success === true);
  await signOut(auth);
}

// 3. NON-CSV email would be rejected by the gate
{
  const intruder = `intruder${Date.now()}@sun.ac.ug`;
  await signInAs(auth, intruder);
  ok("non-CSV email fails login gate", !(await passesGate(intruder)), intruder);
  let voteBlocked = false;
  try {
    const castVote = httpsCallable(fns, "castVote");
    await castVote({ electionId: EID, positionId: "pos_president", candidateId: "cand_pres1" });
  } catch (e) { voteBlocked = e.code === "functions/permission-denied"; }
  ok("non-CSV email cannot vote (no roster)", voteBlocked);
  await signOut(auth);
}

// 4. tally (admin-only read, as designed for anonymity)
{
  await signInAs(auth, "chair.sues@sun.ac.ug");
  const votes = await getDocs(query(collection(db, "votes"), where("electionId", "==", EID)));
  const byCand = {};
  votes.docs.forEach((d) => { const c = d.data().candidateId; byCand[c] = (byCand[c] || 0) + 1; });
  ok("votes recorded & tallyable by admin", votes.size >= 3, JSON.stringify(byCand));
  await signOut(auth);
}

await deleteApp(app);
await sleep(200);
console.log("\n==== " + (fails === 0 ? "ALL DEMO CHECKS PASSED" : fails + " FAILURE(S)") + " ====");
process.exit(fails ? 1 : 0);
