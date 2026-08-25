import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth, connectAuthEmulator,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, getDocs, collection, query, where } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";

const app = initializeApp({ apiKey: "demo", projectId: "demo-sues" });
const auth = getAuth(app);
const db = getFirestore(app);
const fns = getFunctions(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
connectFirestoreEmulator(db, "127.0.0.1", 8080);
connectFunctionsEmulator(fns, "127.0.0.1", 5001);

let fails = 0;
const ok = (n, p, d = "") => { if (!p) fails++; console.log(`${p ? "PASS" : "FAIL"}  ${n}${d ? " -- " + d : ""}`); };

// --- VOTER from CSV casts ballots for BOTH positions ------------------------
{
  const email = "apio.samson@sun.ac.ug";
  await signInWithEmailAndPassword(auth, email, "sues2026");
  ok("CSV voter signs in (account accepted, kept)", true, email);

  const castVote = httpsCallable(fns, "castVote");
  const r1 = await castVote({ electionId: "presec2026", positionId: "pos_president", candidateId: "cand_pres1" });
  ok("votes for President (Otim James)", r1.data?.success === true);

  const r2 = await castVote({ electionId: "presec2026", positionId: "pos_secretary", candidateId: "cand_sec2" });
  ok("votes for Secretary (Otime)", r2.data?.success === true);

  let blocked = false;
  try { await castVote({ electionId: "presec2026", positionId: "pos_president", candidateId: "cand_pres1" }); } catch { blocked = true; }
  ok("double vote for a position blocked", blocked);

  await signOut(auth);
}

// --- second CSV voter, voter in another election blocked / ok ----------------
{
  await signInWithEmailAndPassword(auth, "akello.mary@sun.ac.ug", "sues2026");
  const castVote = httpsCallable(fns, "castVote");
  const r = await castVote({ electionId: "presec2026", positionId: "pos_president", candidateId: "cand_pres2" });
  ok("2nd CSV voter can vote", r.data?.success === true);
  await signOut(auth);
}

// --- OUTSIDE email (not in CSV, not on register) ----------------------------
{
  const email = `intruder${Date.now()}@sun.ac.ug`; // plausible format but not on any roster
  try { await createUserWithEmailAndPassword(auth, email, "sues2026"); } catch {}
  let deleted = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try { await signInWithEmailAndPassword(auth, email, "sues2026"); await signOut(auth); } catch { deleted = true; break; }
  }
  ok("email NOT on roster/register is rejected & deleted", deleted, email);
}

// --- tally visible to results ------------------------------------------------
{
  const votes = await getDocs(query(collection(db, "votes"), where("electionId", "==", "presec2026")));
  const byCand = {};
  votes.docs.forEach((d) => { const c = d.data().candidateId; byCand[c] = (byCand[c] || 0) + 1; });
  ok("votes recorded & tallyable", votes.size >= 2, JSON.stringify(byCand));
}

await signOut(auth).catch(() => {});
await deleteApp(app);
console.log("\n==== " + (fails === 0 ? "ALL CHECKS PASSED" : fails + " FAILURE(S)") + " ====");
process.exit(fails ? 1 : 0);
