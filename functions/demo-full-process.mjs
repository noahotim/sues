// Full-process demonstration: all eligible voters cast votes, then the Chair
// publishes results, and we print the final tally. Run from functions/:
//   node demo-full-process.mjs
import admin from "firebase-admin";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth, connectAuthEmulator,
  signInWithEmailAndPassword, signOut,
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, collection, query, where, getDocs } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";
import { signInAs } from "./demo-auth-helper.mjs";

process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
admin.initializeApp({ projectId: "sues-d7a7f" });
const fdb = admin.firestore();

const EID = "presec2026";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) Clean any prior votes so the demo starts fresh
async function cleanVotes() {
  const votes = await fdb.collection("votes").get();
  const batch = fdb.batch();
  votes.docs.forEach((d) => batch.delete(d.ref));
  const receipts = await fdb.collectionGroup("receipts").get();
  receipts.docs.forEach((d) => batch.delete(d.ref));
  const ros = await fdb.collection("voter_roster").get();
  ros.docs.forEach((d) => batch.update(d.ref, { hasVoted: false, votedPositions: [] }));
  await batch.commit();
  console.log(`[setup] cleared ${votes.size} votes / ${receipts.size} receipts\n`);
}
await cleanVotes();

// 2) Ballots for the 5 eligible voters (mixed choices -> interesting result)
const BALLOTS = [
  { email: "apio.samson@sun.ac.ug",   pres: "cand_pres1", sec: "cand_sec2" }, // Otim James, Otime
  { email: "adongo.rita@sun.ac.ug",   pres: "cand_pres2", sec: "cand_sec1" }, // Okeelo, Komif
  { email: "eciru.peter@sun.ac.ug",   pres: "cand_pres1", sec: "cand_sec2" }, // Otim James, Otime
  { email: "olupot.george@sun.ac.ug", pres: "cand_pres1", sec: "cand_sec1" }, // Otim James, Komif
  { email: "akello.mary@sun.ac.ug",   pres: "cand_pres2", sec: "cand_sec2" }, // Okeelo, Otime
];

const app = initializeApp({ apiKey: "demo", projectId: "sues-d7a7f" });
const auth = getAuth(app);
const fns = getFunctions(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
connectFunctionsEmulator(fns, "127.0.0.1", 5001);
const castVote = httpsCallable(fns, "castVote");

console.log("=== STEP 1: ELIGIBLE VOTERS CAST THEIR VOTES ===");
for (const b of BALLOTS) {
  await signInAs(auth, b.email);
  const r1 = await castVote({ electionId: EID, positionId: "pos_president", candidateId: b.pres });
  const r2 = await castVote({ electionId: EID, positionId: "pos_secretary", candidateId: b.sec });
  const ok = r1.data?.success && r2.data?.success;
  console.log(`  ${b.email.padEnd(26)} -> President:${b.pres}  Secretary:${b.sec}  [${ok ? "OK" : "FAIL"}]`);
  await signOut(auth);
}
await sleep(300);

// 3) Chair publishes the results
console.log("\n=== STEP 2: CHAIR PERSON PUBLISHES RESULTS ===");
await fdb.collection("elections").doc(EID).update({ status: "published", resultsPublished: true });
console.log("  Election set to status='published', resultsPublished=true\n");

// 4) Final tally (what the Results page shows)
console.log("=== STEP 3: FINAL RESULTS ===");
const candSnap = await fdb.collection("candidates").where("electionId", "==", EID).get();
const cands = {};
candSnap.docs.forEach((d) => (cands[d.id] = d.data()));
const posSnap = await fdb.collection("positions").where("electionId", "==", EID).get();
const positions = posSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.displayOrder - b.displayOrder);

const votesSnap = await fdb.collection("votes").where("electionId", "==", EID).get();
const counts = {};
votesSnap.docs.forEach((d) => { const c = d.data().candidateId; counts[c] = (counts[c] || 0) + 1; });

const rosterSnap = await fdb.collection("voter_roster").where("electionId", "==", EID).get();
const eligible = rosterSnap.size;
const voted = rosterSnap.docs.filter((d) => d.data().hasVoted).length;

for (const pos of positions) {
  const posCands = Object.entries(cands).filter(([, c]) => c.positionId === pos.id);
  const total = posCands.reduce((s, [id]) => s + (counts[id] || 0), 0);
  const ranked = posCands
    .map(([id, c]) => ({ name: c.name, votes: counts[id] || 0 }))
    .sort((a, b) => b.votes - a.votes);
  console.log(`\n  ${pos.title.toUpperCase()}  (${total} votes cast)`);
  ranked.forEach((r, i) => {
    const pct = total ? Math.round((r.votes / total) * 100) : 0;
    const crown = i === 0 && r.votes > 0 ? "  <-- WINNER" : "";
    console.log(`    ${r.name.padEnd(16)} ${String(r.votes).padStart(2)} vote(s)  ${pct}%${crown}`);
  });
}
console.log(`\n  Eligible voters: ${eligible}   Turnout: ${eligible ? Math.round((voted / eligible) * 100) : 0}%`);
console.log("  (Votes are anonymous — no voter identity is stored.)\n");

await deleteApp(app);
await sleep(200);
console.log("DONE. Open http://localhost:5173 as chair.sues@sun.ac.ug to view the published Results page.");
process.exit(0);
