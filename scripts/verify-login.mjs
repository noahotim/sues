// Headless end-to-end verification of login eligibility + voting.
// Runs against the local Firebase Emulator Suite. Temporary verification script.
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
  setDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";

const RESULTS = [];
function record(name, pass, detail = "") {
  RESULTS.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const app = initializeApp({ apiKey: "demo", authDomain: "localhost", projectId: "demo-sues" });
const auth = getAuth(app);
const db = getFirestore(app);
const fns = getFunctions(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
connectFirestoreEmulator(db, "127.0.0.1", 8080);
connectFunctionsEmulator(fns, "127.0.0.1", 5001);

async function trySignIn(email, password = "Passw0rd!") {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  } catch (e) {
    return null;
  }
}

async function waitForDeletion(email, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(1000);
    const u = await trySignIn(email);
    if (!u) return true; // sign-in rejected -> account was deleted by the trigger
    await signOut(auth);
  }
  return false;
}

async function loginAndCheck(email) {
  const user = await trySignIn(email);
  if (!user) return null;
  const token = await user.getIdTokenResult();
  const profile = await getDoc(doc(db, "users", user.uid));
  return { uid: user.uid, role: token.claims.role ?? null, hasProfile: profile.exists() };
}

// ---- 1. Allowed email (first registrant -> Chairperson) -------------------
{
  const email = "2200000001@sun.ac.ug";
  try { await createUserWithEmailAndPassword(auth, email, "Passw0rd!"); } catch {}
  // Poll until the onCreate trigger has applied claims (sign-in succeeds
  // instantly; the profile/claims land moments later).
  let info = null;
  for (let i = 0; i < 25 && !(info && info.role && info.hasProfile); i++) {
    await sleep(1000);
    info = await loginAndCheck(email);
  }
  record("login: registered student accepted", !!info, info ? JSON.stringify(info) : "could not sign in");
  record("first registrant becomes Chairperson", info?.role === "ROLE_CHAIRPERSON", "role=" + info?.role);
  record("user profile document created", info?.hasProfile === true);
  const chairDoc = await getDoc(doc(db, "users", (await trySignIn(email)).uid));
  record("initial role mirrored into users doc", chairDoc.data()?.role === "ROLE_CHAIRPERSON", "doc.role=" + chairDoc.data()?.role);

  // Client gate simulation (what authService does right after the popup):
  const meta = await getDoc(doc(db, "eligible_emails", "_meta"));
  const member = await getDoc(doc(db, "eligible_emails", email));
  record("client gate passes register member", meta.exists() && member.exists());
}

// ---- 2. Allowed email (later registrant -> Voter) --------------------------
{
  const email = "noah.otim@sun.ac.ug";
  try { await createUserWithEmailAndPassword(auth, email, "Passw0rd!"); } catch {}
  let info = null;
  for (let i = 0; i < 25 && !(info && info.role && info.hasProfile); i++) {
    await sleep(1000);
    info = await loginAndCheck(email);
  }
  record("login: second registered student accepted", !!info);
  record("later registrant gets Voter role", info?.role === "VOTER", "role=" + info?.role);
}

// ---- 3. Rejected: well-formed student email NOT on the register ------------
{
  // Unique per run: must not have been created during an earlier
  // bootstrap-window session, otherwise it legitimately still exists.
  const email = `22${String(Date.now()).slice(-7)}@sun.ac.ug`;
  try { await createUserWithEmailAndPassword(auth, email, "Passw0rd!"); } catch {}
  // Client gate: membership lookup must miss
  const member = await getDoc(doc(db, "eligible_emails", email));
  record("client gate blocks non-member student number", !member.exists());
  const deleted = await waitForDeletion(email);
  record("server deletes account not on register", deleted, email);
}

// ---- 4. Rejected: outside domain -------------------------------------------
{
  const email = "outsider@gmail.com";
  try { await createUserWithEmailAndPassword(auth, email, "Passw0rd!"); } catch {}
  const member = await getDoc(doc(db, "eligible_emails", email));
  record("client gate blocks gmail address", !member.exists());
  const deleted = await waitForDeletion(email);
  record("server deletes gmail signup", deleted, email);
}

// ---- 5. Security rules: register cannot be listed / written -----------------
{
  let listDenied = false;
  try { await getDocs(collection(db, "eligible_emails")); } catch { listDenied = true; }
  record("rules deny listing the whole register", listDenied);
  let writeDenied = false;
  try { await setDoc(doc(db, "eligible_emails", "hacker@gmail.com"), { email: "x" }); } catch { writeDenied = true; }
  record("rules deny writing the register", writeDenied);
}

// ---- 6. Full vote flow (Chairperson seeds; Voter votes) ---------------------
try {
  const electionId = "e" + Date.now(); // fresh ids so reruns never collide
  const positionId = "p_" + electionId;
  const candidateId = "c_" + electionId;
  const rosterId = "r_" + electionId;

  // Rules require an Election Manager to create elections/positions/etc.
  const chair = await trySignIn("2200000001@sun.ac.ug");
  record("chairperson can sign in to seed election", !!chair);

  await setDoc(doc(db, "elections", electionId), {
    title: "Verify Election", description: "", status: "active",
    startTime: new Date(Date.now() - 60000).toISOString(),
    endTime: new Date(Date.now() + 3600000).toISOString(),
    resultsPublished: false,
  });
  await setDoc(doc(db, "positions", positionId), { electionId, title: "President", maxVotes: 1, displayOrder: 1 });
  await setDoc(doc(db, "candidates", candidateId), { electionId, positionId, name: "Alice", bio: "", photoUrl: "", displayOrder: 1 });
  await setDoc(doc(db, "voter_roster", rosterId), { electionId, voterEmail: "noah.otim@sun.ac.ug", voterName: "Noah", hasVoted: false });

  await signOut(auth); // switch identity: chairperson -> voter

  const voter = await trySignIn("noah.otim@sun.ac.ug");
  record("voter can sign in to vote", !!voter);

  const castVote = httpsCallable(fns, "castVote");
  const res = await castVote({ electionId, positionId, candidateId });
  record("castVote succeeds for rostered voter", res.data?.success === true);

  const receipt = await getDoc(doc(db, "users", voter.uid, "receipts", `${electionId}_${positionId}`));
  record("vote receipt created", receipt.exists());

  const rosterEntry = await getDoc(doc(db, "voter_roster", rosterId));
  record("roster marked hasVoted", rosterEntry.data()?.hasVoted === true);

  let doubleVoteBlocked = false;
  try { await castVote({ electionId, positionId, candidateId }); } catch { doubleVoteBlocked = true; }
  record("double vote blocked", doubleVoteBlocked);

  // Audit logs are Chairperson-only per the rules - switch back before reading.
  await signOut(auth);
  await trySignIn("2200000001@sun.ac.ug");
  const audits = await getDocs(query(collection(db, "audit_logs"), where("details.electionId", "==", electionId)));
  const a = audits.docs[0]?.data();
  record("audit log keeps ballot secrecy", !!a && a.userId === undefined && a.userEmail === undefined, JSON.stringify(a || {}));
} catch (e) {
  record("vote flow completed without errors", false, String(e?.message || e));
}

await signOut(auth);
await deleteApp(app);

const failed = RESULTS.filter((r) => !r.pass);
console.log("\n==== RESULT: " + (failed.length === 0 ? "ALL " + RESULTS.length + " CHECKS PASSED" : failed.length + " FAILURE(S)") + " ====");
process.exit(failed.length ? 1 : 0);
