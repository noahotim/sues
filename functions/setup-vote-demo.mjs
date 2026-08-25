// One-shot demo bootstrap for the emulator (project sues-d7a7f).
// Creates base staff accounts, the "presec2026" election with President &
// Secretary positions and candidates, and imports the CSV voter roster.
// Run with the emulators already up:  node setup-vote-demo.mjs
import admin from "firebase-admin";
import { readFileSync } from "fs";
import { join } from "path";

process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
admin.initializeApp({ projectId: "sues-d7a7f" });
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
const auth = admin.auth();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry wrapper for flaky emulator gRPC calls ("call already cancelled")
async function retry(fn, label, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === attempts - 1) throw e;
      console.log(`  retry ${label} (${e.code || e.message})`);
      await sleep(400 * (i + 1));
    }
  }
}

const EID = "presec2026";
const PASS = "sues2026";
const NOW = new Date();
const start = new Date(NOW.getTime() - 5 * 60 * 1000);
const end = new Date(NOW.getTime() + 5 * 60 * 60 * 1000);

const baseAccounts = [
  ["chair.sues@sun.ac.ug", "ROLE_CHAIRPERSON", "Chair Person"],
  ["secretary.sues@sun.ac.ug", "ROLE_SECRETARY", "Secretary Sues"],
  ["assistant.sues@sun.ac.ug", "ROLE_ASSISTANT", "Assistant Sues"],
  ["voter.sues@sun.ac.ug", "VOTER", "Voter Sues"],
  ["grace.atim@sun.ac.ug", "ROLE_SECRETARY", "Grace Atim"],
  ["2200000001@sun.ac.ug", "ROLE_CHAIRPERSON", "Chair One"],
  ["noah.otim@sun.ac.ug", "ROLE_ASSISTANT", "Noah Otim"],
];

async function upsertUser(email, role, name, addToRegister) {
  email = email.trim().toLowerCase();
  let uid;
  try {
    const u = await retry(() => auth.getUserByEmail(email), `getUser ${email}`);
    uid = u.uid;
  } catch {
    const u = await retry(() => auth.createUser({ email, password: PASS, emailVerified: true, displayName: name }), `createUser ${email}`);
    uid = u.uid;
  }
  await retry(
    () =>
      db
        .collection("users")
        .doc(uid)
        .set(
          { email, fullName: name, role, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        ),
    `userDoc ${email}`
  );
  if (addToRegister) {
    await retry(
      () =>
        db
          .collection("eligible_emails")
          .doc(email)
          .set({ email, fullName: name, role, createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }),
      `registerDoc ${email}`
    );
  }
  return uid;
}

async function main() {
  // 1. Base staff accounts (on the allowed register so they can log in)
  for (const [email, role, name] of baseAccounts) {
    await upsertUser(email, role, name, true);
    console.log(`account ${email} -> ${role}`);
    await sleep(250);
  }

  // 2. Election
  await retry(
    () =>
      db.collection("elections").doc(EID).set({
        title: "Presidential & Secretary Elections 2026",
        description: "Vote for the President and Secretary of the Soroti University Engineering Society.",
        status: "active",
        startTime: admin.firestore.Timestamp.fromDate(start),
        endTime: admin.firestore.Timestamp.fromDate(end),
        resultsPublished: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
    "election"
  );
  console.log(`election ${EID} created (active)`);

  // 3. Positions
  const PRES = "pos_president";
  const SEC = "pos_secretary";
  await retry(() => db.collection("positions").doc(PRES).set({ electionId: EID, title: "President", description: "Society President", maxVotes: 1, displayOrder: 1 }), "pos_president");
  await retry(() => db.collection("positions").doc(SEC).set({ electionId: EID, title: "Secretary", description: "Society Secretary", maxVotes: 1, displayOrder: 2 }), "pos_secretary");
  console.log("positions created: President, Secretary");

  // 4. Candidates
  const candidates = [
    ["cand_pres1", "Otim James", "Dedicated leader for SUES.", PRES, 1],
    ["cand_pres2", "Okeelo", "Committed to progress.", PRES, 2],
    ["cand_sec1", "Komif", "Organized and reliable.", SEC, 1],
    ["cand_sec2", "Otime", "Strong communicator.", SEC, 2],
  ];
  for (const [id, name, bio, pid, order] of candidates) {
    await retry(() => db.collection("candidates").doc(id).set({ electionId: EID, positionId: pid, name, bio, photoUrl: "", displayOrder: order }), `candidate ${id}`);
  }
  console.log("candidates created: " + candidates.map((c) => c[1]).join(", "));

  // 5. CSV roster + voter accounts
  const csvPath = join(process.cwd(), "..", "scripts", "demo-voters.csv");
  const lines = readFileSync(csvPath, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(1);
  const batch = db.batch();
  for (const line of lines) {
    const [email, name] = line.split(",");
    const ref = db.collection("voter_roster").doc();
    batch.set(ref, { electionId: EID, voterEmail: email.trim().toLowerCase(), voterName: (name || "").trim(), hasVoted: false });
  }
  await retry(() => batch.commit(), "rosterBatch");
  console.log(`roster imported: ${lines.length} voters`);

  for (const line of lines) {
    const [email, name] = line.split(",");
    await upsertUser(email, "VOTER", (name || "").trim(), false); // roster-based login, not the general register
    await sleep(250);
  }
  console.log(`voter accounts created: ${lines.length}`);

  // 6. Re-assert staff claims last (win any race with onUserCreated trigger)
  await sleep(1500);
  for (const [email, role] of baseAccounts) {
    try {
      const u = await auth.getUserByEmail(email.trim().toLowerCase());
      await auth.setCustomUserClaims(u.uid, { role });
    } catch (e) {
      console.log(`claim reassert failed for ${email}: ${e.message}`);
    }
  }

  console.log("\n==== DEMO BOOTSTRAP COMPLETE ====");
  process.exit(0);
}

main().catch((e) => {
  console.error("SEED FAILED:", e);
  process.exit(1);
});
