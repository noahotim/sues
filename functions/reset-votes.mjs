// Admin reset of prior vote state in the emulator (run from functions/ dir: node reset-votes.mjs)
import admin from "firebase-admin";

process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
admin.initializeApp({ projectId: "sues-d7a7f" });
const fdb = admin.firestore();

async function main() {
  const votes = await fdb.collection("votes").get();
  const batch = fdb.batch();
  votes.docs.forEach((d) => batch.delete(d.ref));
  const receipts = await fdb.collectionGroup("receipts").get();
  receipts.docs.forEach((d) => batch.delete(d.ref));
  // Wipe roster entirely so a clean re-seed produces exactly one row per voter.
  const ros = await fdb.collection("voter_roster").get();
  ros.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  console.log(`reset state (votes=${votes.size}, receipts=${receipts.size}, roster wiped=${ros.size})`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
