// Toggle the maintenance kill-switch (system_config/maintenance) directly via a
// service account. This is the OUT-OF-BAND safety net: because the lock denies
// EVERY sign-in (including the chairperson), the app UI cannot be used to reopen
// the system once it is locked. Use this script instead.
//
// Usage:
//   1. Download a service-account key: Firebase Console -> Project settings
//      -> Service accounts -> Generate new private key (save as e.g. sa.json).
//   2. npm install            (pulls in the firebase-admin devDependency)
//   3. node scripts/maintenance.mjs on  /path/to/sa.json   (lock everything)
//      node scripts/maintenance.mjs off /path/to/sa.json   (reopen everything)
//   4. node scripts/maintenance.mjs show /path/to/sa.json  (print current state)
//
// Optional: pass a custom lock message as the 4th argument, e.g.
//   node scripts/maintenance.mjs on sa.json "Maintenance until 3pm - CONTACT NOAH"

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const [state, serviceAccountPath, customMessage] = process.argv.slice(2);

if (!state || !serviceAccountPath) {
  console.error(
    "Usage: node scripts/maintenance.mjs <on|off|show> <service-account.json> [message]"
  );
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccountPath) });
const db = getFirestore().collection("system_config").doc("maintenance");

const DEFAULT_MESSAGE =
  "Access to this system is temporarily locked.\nCONTACT NOAH to be authorised.";

if (state === "show") {
  const snap = await db.get();
  if (!snap.exists) {
    console.log("maintenance = OFF (no configuration document)");
  } else {
    const d = snap.data();
    console.log(`maintenance = ${d.enabled ? "ON (locked)" : "OFF (open)"}`);
    if (d.message) console.log(`message: ${JSON.stringify(d.message)}`);
    if (d.updatedAt) console.log(`updatedAt: ${d.updatedAt.toDate?.() ?? d.updatedAt}`);
    if (d.updatedBy) console.log(`updatedBy: ${d.updatedBy}`);
  }
  process.exit(0);
}

if (state !== "on" && state !== "off") {
  console.error(`Unknown state "${state}". Use "on", "off" or "show".`);
  process.exit(1);
}

const enabled = state === "on";
await db.set(
  {
    enabled,
    message: enabled && customMessage ? customMessage : DEFAULT_MESSAGE,
    updatedAt: new Date().toISOString(),
    updatedBy: "maintenance.mjs (service account)",
  },
  { merge: true }
);

console.log(
  enabled
    ? "System LOCKED. Every sign-in is now denied and the CONTACT NOAH lockout is shown."
    : "System REOPENED. Normal allowlist sign-in has resumed."
);
