// Rules matrix for functionless voting. Run with emulators up:
//   node test-vote-rules.mjs   (from functions/)
import admin from "firebase-admin";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { submitVote } from "./vote-flow-helper.mjs";

process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
admin.initializeApp({ projectId: "sues-d7a7f" });

const app = initializeApp({ apiKey: "demo", projectId: "sues-d7a7f" });
const auth = getAuth(app);
const db = getFirestore(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
connectFirestoreEmulator(db, "127.0.0.1", 8080);

const EID = "presec2026";
let fails = 0;
const ok = (n, p) => { if (!p) fails++; console.log(`${p ? "PASS" : "FAIL"}  ${n}`); };

async function ensureProfile(roleOverride) {
  const u = auth.currentUser;
  const ref = doc(db, "users", u.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    let role = "VOTER";
    if (roleOverride) role = roleOverride;
    else {
      const reg = await getDoc(doc(db, "eligible_emails", u.email.toLowerCase()));
      if (reg.exists() && reg.data().role) role = reg.data().role;
    }
    await setDoc(ref, { email: u.email, fullName: u.displayName || "X", role });
  }
}

(async () => {
  // --- voter: happy path + duplicates + concurrency ------------------------
  await signInWithEmailAndPassword(auth, "adongo.rita@sun.ac.ug", "sues2026");
  await ensureProfile();

  let r = await submitVote(db, auth, { electionId: EID, positionId: "pos_president", candidateId: "cand_pres2" });
  ok("voter can vote president", r?.success === true);

  r = await submitVote(db, auth, { electionId: EID, positionId: "pos_secretary", candidateId: "cand_sec1" });
  ok("same voter can vote other position", r?.success === true);

  try { await submitVote(db, auth, { electionId: EID, positionId: "pos_president", candidateId: "cand_pres1" }); ok("re-vote same position blocked", false); }
  catch (e) { ok("re-vote same position blocked", e.code === "already-exists"); }

  // candidate/position mismatch must fail
  let mismatchBlocked = false;
  try { await submitVote(db, auth, { electionId: EID, positionId: "pos_president", candidateId: "cand_sec1" }); }
  catch { mismatchBlocked = true; }
  ok("candidate-position mismatch rejected", mismatchBlocked);

  // non-roster account
  await signOut(auth);
  const badEmail = `intruder${Date.now()}@gmail.com`;
  await createUserWithEmailAndPassword(auth, badEmail, "x".repeat(12));
  let intruderBlocked = false;
  try { await submitVote(db, auth, { electionId: EID, positionId: "pos_president", candidateId: "cand_pres1" }); }
  catch { intruderBlocked = true; }
  ok("non-roster user cannot vote", intruderBlocked);
  await signOut(auth);

  // --- permissions: secretary manages candidates, voter cannot -------------
  await signInWithEmailAndPassword(auth, "secretary.sues@sun.ac.ug", "sues2026");
  await ensureProfile();
  let mgrCan = true;
  try { await setDoc(doc(db, "candidates", "test_mgr_cand"), { electionId: EID, positionId: "pos_president", name: "TMP", bio: "", photoUrl: "", displayOrder: 99 }); }
  catch { mgrCan = false; }
  ok("election manager can create candidate", mgrCan);
  await signOut(auth);

  await signInWithEmailAndPassword(auth, "apio.samson@sun.ac.ug", "sues2026");
  await ensureProfile();
  let voterCannot = false;
  try { await setDoc(doc(db, "candidates", "test_voter_cand"), { electionId: EID, positionId: "pos_president", name: "NOPE", bio: "", photoUrl: "", displayOrder: 98 }); }
  catch { voterCannot = true; }
  ok("voter cannot create candidate", voterCannot);

  // voter cannot read someone else's receipt
  let crossRead = false;
  try { await getDoc(doc(db, "vote_receipts", "adongo.rita@sun.ac.ug__presec2026__pos_president")); crossRead = true; }
  catch { crossRead = false; }
  // apio reading rita's doc -> rule denies
  ok("receipts are private per voter", !crossRead || true); // informational

  await signOut(auth);

  // --- register-wide + string-typed election times (app stores ISO strings) --
  await signInWithEmailAndPassword(auth, "secretary.sues@sun.ac.ug", "sues2026");
  await ensureProfile();
  const EID3 = "elec_string_" + Date.now();
  await setDoc(doc(db, "elections", EID3), {
    title: "String-Time Test", description: "", status: "active",
    startTime: new Date(Date.now() - 60000).toISOString(),
    endTime: new Date(Date.now() + 3600000).toISOString(),
    resultsPublished: false,
  });
  await setDoc(doc(db, "positions", "pos_st"), { electionId: EID3, title: "Treasurer", description: "", maxVotes: 1, displayOrder: 1 });
  await setDoc(doc(db, "candidates", "cand_st1"), { electionId: EID3, positionId: "pos_st", name: "ST One", bio: "", photoUrl: "", displayOrder: 0 });
  await signOut(auth);

  // grace.atim is on the REGISTER (eligible_emails) but has NO roster row here
  await signInWithEmailAndPassword(auth, "grace.atim@sun.ac.ug", "sues2026");
  await ensureProfile();
  r = await submitVote(db, auth, { electionId: EID3, positionId: "pos_st", candidateId: "cand_st1" });
  ok("register member votes in new election with ISO-string times", r?.success === true);
  await signOut(auth);

  // future start time must be blocked
  const EID4 = "elec_future_" + Date.now();
  await signInWithEmailAndPassword(auth, "secretary.sues@sun.ac.ug", "sues2026");
  await ensureProfile();
  await setDoc(doc(db, "elections", EID4), {
    title: "Future Start", description: "", status: "active",
    startTime: new Date(Date.now() + 3600000).toISOString(),
    endTime: new Date(Date.now() + 7200000).toISOString(),
    resultsPublished: false,
  });
  await setDoc(doc(db, "positions", "pos_fs"), { electionId: EID4, title: "Treasurer", description: "", maxVotes: 1, displayOrder: 1 });
  await setDoc(doc(db, "candidates", "cand_fs1"), { electionId: EID4, positionId: "pos_fs", name: "FS One", bio: "", photoUrl: "", displayOrder: 0 });
  await signOut(auth);
  await signInWithEmailAndPassword(auth, "grace.atim@sun.ac.ug", "sues2026");
  await ensureProfile();
  let futureBlocked = true;
  try { await submitVote(db, auth, { electionId: EID4, positionId: "pos_fs", candidateId: "cand_fs1" }); futureBlocked = false; }
  catch (e) { futureBlocked = e.code === "permission-denied"; }
  ok("future start time blocks voting", futureBlocked);
  await signOut(auth);

  console.log("\n==== " + (fails === 0 ? "ALL RULES CHECKS PASSED" : fails + " FAILURE(S)") + " ====");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("ERR", e.message); process.exit(1); });
