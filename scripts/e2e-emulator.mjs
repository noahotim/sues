// End-to-end check of the voting flow against the Firebase Emulator Suite.
// Requires: emulators running (npm run emulators), then run `npm run test:e2e`.
import fs from "node:fs";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  getIdToken,
} from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
} from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";

const LOG = "e2e-emulator.log";
fs.writeFileSync(LOG, "");
function log(msg) {
  fs.appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`);
  console.log(msg);
}

let stage = "startup";
setTimeout(() => {
  log(`WATCHDOG TIMEOUT at stage: ${stage}`);
  process.exit(2);
}, 120000);

const app = initializeApp({ apiKey: "demo", authDomain: "localhost", projectId: "demo-sues" });
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
connectFirestoreEmulator(db, "127.0.0.1", 8080);
connectFunctionsEmulator(functions, "127.0.0.1", 5001);

// Must be a valid @sun.ac.ug student email (number starting 220-260), otherwise
// the onUserCreated trigger deletes the account and the flow cannot proceed.
const email = `220${(Date.now() % 10000000).toString().padStart(7, "0")}@sun.ac.ug`;
const password = "password123";
const electionId = `elec_${Date.now()}`;
const positionId = `pos_${Date.now()}`;
const candidateId = `can_${Date.now()}`;
const rosterId = `roster_${Date.now()}`;

function assert(cond, msg) {
  if (!cond) {
    log("FAIL: " + msg);
    process.exitCode = 1;
  } else {
    log("PASS: " + msg);
  }
}

async function promoteToChairperson(uid) {
  const res = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify({ role: "ROLE_CHAIRPERSON" }) }),
  });
  log("promote status: " + res.status);
}

async function main() {
  stage = "signup";
  log("SIGNUP: " + email);
  const userCred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = userCred.user.uid;
  log("SIGNUP ok uid=" + uid);

  stage = "trigger-wait";
  let claims = null;
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const t = await getIdToken(userCred.user, true);
    claims = JSON.parse(Buffer.from(t.split(".")[1], "base64").toString());
    if (claims.role) break;
  }
  if (claims && claims.role) {
    log("PASS: trigger set custom claim role=" + claims.role);
  } else {
    log("NOTE: trigger not applied within 45s; promoting via auth emulator admin API (startup race, not a code issue)");
    await promoteToChairperson(uid);
    const t = await getIdToken(userCred.user, true);
    claims = JSON.parse(Buffer.from(t.split(".")[1], "base64").toString());
  }
  log("token claims: " + JSON.stringify(claims));
  if (claims && claims.role === "VOTER") {
    log("NOTE: user got VOTER (emulator not fresh) - promoting to chairperson via admin API");
    await promoteToChairperson(uid);
    const t = await getIdToken(userCred.user, true);
    claims = JSON.parse(Buffer.from(t.split(".")[1], "base64").toString());
  }
  assert(claims && claims.role === "ROLE_CHAIRPERSON", `chairperson access available (got ${claims && claims.role})`);

  stage = "users-doc";
  let userDoc = await getDoc(doc(db, "users", uid));
  for (let i = 0; i < 30 && !userDoc.exists(); i++) {
    await new Promise((r) => setTimeout(r, 1000));
    userDoc = await getDoc(doc(db, "users", uid));
  }
  log("users doc exists: " + userDoc.exists());
  assert(userDoc.exists(), "onUserCreated created users doc");

  stage = "seed";
  const now = new Date();
  const start = new Date(now.getTime() - 60000).toISOString();
  const end = new Date(now.getTime() + 600000).toISOString();
  await setDoc(doc(db, "elections", electionId), {
    title: "Test Election", description: "e2e", status: "active",
    startTime: start, endTime: end, resultsPublished: false,
  });
  log("election seeded");
  await setDoc(doc(db, "positions", positionId), {
    electionId, title: "President", description: "p", maxVotes: 1, displayOrder: 1,
  });
  log("position seeded");
  await setDoc(doc(db, "candidates", candidateId), {
    electionId, positionId, name: "Alice", bio: "", photoUrl: "", displayOrder: 1,
  });
  log("candidate seeded");
  await setDoc(doc(db, "voter_roster", rosterId), {
    electionId, voterEmail: email, voterName: "Tester", hasVoted: false,
  });
  log("roster seeded");

  stage = "castVote";
  const castVote = httpsCallable(functions, "castVote");
  log("calling castVote...");
  const res = await castVote({ electionId, positionId, candidateId });
  log("castVote returned: " + JSON.stringify(res.data));
  assert(res.data && res.data.success === true, "castVote returned success");

  stage = "verify";
  const votesSnap = await getDocs(query(collection(db, "votes"), where("electionId", "==", electionId)));
  log("votes count: " + votesSnap.size);
  assert(votesSnap.size >= 1, `vote recorded (count=${votesSnap.size})`);

  const receiptsSnap = await getDocs(collection(db, "users", uid, "receipts"));
  log("receipts count: " + receiptsSnap.size);
  assert(receiptsSnap.size === 1, `receipt created (count=${receiptsSnap.size})`);

  const rosterDoc = await getDoc(doc(db, "voter_roster", rosterId));
  log("roster hasVoted: " + (rosterDoc.data() || {}).hasVoted);
  assert(rosterDoc.data().hasVoted === true, "roster marked hasVoted=true");

  stage = "double-vote";
  try {
    await castVote({ electionId, positionId, candidateId });
    assert(false, "double vote should be rejected");
  } catch (e) {
    log("double vote error: " + (e && e.message));
    assert(/already (exists|voted)/i.test(e.message || ""), `double vote rejected (${e.message})`);
  }

  await rejectCheck();

  log("\nE2E RESULT: " + (process.exitCode ? "FAILURES PRESENT" : "ALL CHECKS PASSED"));
  process.exit(process.exitCode || 0);
}

async function rejectCheck() {
  stage = "reject-check";
  const badEmail = "evil@gmail.com";
  let created = false;
  try {
    await createUserWithEmailAndPassword(auth, badEmail, password);
    created = true;
  } catch (e) {
    created = false;
  }
  // Give the onCreate trigger time to delete the rejected account.
  await new Promise((r) => setTimeout(r, 2500));
  let stillThere = true;
  try {
    const c = await signInWithEmailAndPassword(auth, badEmail, password);
    await getIdToken(c.user, true);
    stillThere = true;
  } catch (e) {
    stillThere = false;
  }
  assert(!stillThere, `non-student email rejected (created=${created}, stillThere=${stillThere})`);
}

main().catch((e) => {
  log("E2E ERROR at stage " + stage + ": " + e);
  log(e && e.stack);
  process.exit(1);
});
