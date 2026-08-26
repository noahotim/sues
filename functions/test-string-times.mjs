// Focused check: voting works with Firestore-Timestamp election times
// (what the app now writes), and is blocked before the start time.
import admin from "firebase-admin";
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, setDoc, Timestamp } from "firebase/firestore";
import { submitVote } from "./vote-flow-helper.mjs";

process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
admin.initializeApp({ projectId: "sues-d7a7f" });

const app = initializeApp({ apiKey: "demo", projectId: "sues-d7a7f" });
const auth = getAuth(app);
const db = getFirestore(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
connectFirestoreEmulator(db, "127.0.0.1", 8080);

const sign = async (e) => { await signInWithEmailAndPassword(auth, e, "sues2026"); };

(async () => {
  await sign("secretary.sues@sun.ac.ug");
  const EID = "str_" + Date.now();
  await setDoc(doc(db, "elections", EID), {
    title: "Timestamp Times", status: "active",
    startTime: Timestamp.fromDate(new Date(Date.now() - 60000)),
    endTime: Timestamp.fromDate(new Date(Date.now() + 3600000)),
    resultsPublished: false,
  });
  await setDoc(doc(db, "positions", "pos1"), { electionId: EID, title: "President", maxVotes: 1, displayOrder: 1 });
  await setDoc(doc(db, "candidates", "cand1"), { electionId: EID, positionId: "pos1", name: "A", bio: "", photoUrl: "", displayOrder: 0 });
  await setDoc(doc(db, "eligible_emails", "grace.atim@sun.ac.ug"), { email: "grace.atim@sun.ac.ug", role: "ROLE_SECRETARY" }, { merge: true });
  await signOut(auth);

  await sign("grace.atim@sun.ac.ug");
  const r = await submitVote(db, auth, { electionId: EID, positionId: "pos1", candidateId: "cand1" });
  console.log(r?.success === true ? "PASS - timestamp-time voting works" : "FAIL - " + JSON.stringify(r));
  await signOut(auth);

  await sign("secretary.sues@sun.ac.ug");
  const EID2 = "fut_" + Date.now();
  await setDoc(doc(db, "elections", EID2), {
    title: "Future", status: "active",
    startTime: Timestamp.fromDate(new Date(Date.now() + 3600000)),
    endTime: Timestamp.fromDate(new Date(Date.now() + 7200000)),
    resultsPublished: false,
  });
  await setDoc(doc(db, "positions", "pos2"), { electionId: EID2, title: "Treasurer", maxVotes: 1, displayOrder: 1 });
  await setDoc(doc(db, "candidates", "cand2"), { electionId: EID2, positionId: "pos2", name: "B", bio: "", photoUrl: "", displayOrder: 0 });
  await signOut(auth);

  await sign("grace.atim@sun.ac.ug");
  try {
    const r2 = await submitVote(db, auth, { electionId: EID2, positionId: "pos2", candidateId: "cand2" });
    console.log(r2 && r2.success ? "FAIL - voted before start" : "PASS - future start blocked");
  } catch (e) {
    console.log(e.code === "permission-denied" ? "PASS - future start blocked" : "check " + e.code);
  }
  process.exit(0);
})().catch((e) => { console.log("ERR", e.message); process.exit(1); });
