// Import the eligible-voter allowlist into Firestore from a CSV file.
//
// Usage:
//   1. Download a service-account key: Firebase Console -> Project settings
//      -> Service accounts -> Generate new private key (save as e.g. sa.json).
//   2. npm install            (pulls in the firebase-admin devDependency)
//   3. node scripts/import-eligible-emails.mjs emails.csv /path/to/sa.json
//
// The CSV may have one email per line or several separated by commas or
// semicolons; a header line is ignored automatically. Each email becomes a
// document at eligible_emails/<email> which both the sign-in flow and the
// onUserCreated trigger use as the eligibility check.

import fs from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const [csvPath, serviceAccountPath] = process.argv.slice(2);

if (!csvPath || !serviceAccountPath) {
  console.error("Usage: node scripts/import-eligible-emails.mjs <emails.csv> <service-account.json>");
  process.exit(1);
}

const raw = fs.readFileSync(csvPath, "utf8");
const lines = raw.split(/\r?\n/);

const emails = new Set();
for (const line of lines) {
  for (const token of line.split(/[,;]/)) {
    const email = token.trim().toLowerCase();
    // Skip empties and header/label rows that are not plain emails.
    if (!email || !email.includes("@") || /\s/.test(email)) continue;
    emails.add(email);
  }
}

if (emails.size === 0) {
  console.error("No valid emails found in", csvPath);
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccountPath) });
const db = getFirestore();

const list = [...emails];
const BATCH_SIZE = 400;
let written = 0;

for (let i = 0; i < list.length; i += BATCH_SIZE) {
  const batch = db.batch();
  for (const email of list.slice(i, i + BATCH_SIZE)) {
    batch.set(db.collection("eligible_emails").doc(email), {
      email,
      addedAt: new Date().toISOString(),
    });
  }
  // Marker the login flow reads: its presence means "the register is live,
  // membership decides". Written in every batch so it always lands.
  batch.set(db.collection("eligible_emails").doc("_meta"), {
    seeded: true,
    count: list.length,
    updatedAt: new Date().toISOString(),
  });
  await batch.commit();
  written += Math.min(BATCH_SIZE, list.length - i);
  console.log(`Imported ${written}/${list.length}`);
}

console.log(`Done. ${written} eligible email(s) are now in Firestore under "eligible_emails".`);
console.log('The register is now LIVE: sign-in is restricted to exactly these emails.');
