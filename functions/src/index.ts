import admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

admin.initializeApp();
const db = admin.firestore();

// 1. Trigger: Auto-create user document on sign up.
// NOTE: no role is ever granted here. Roles come from the register
// (eligible_emails), managed in User Management — there is no "first user
// becomes Chairperson" race, and a stranger who signs up gains nothing.
export const onUserCreated = functions.auth.user().onCreate(async (user) => {
  try {
    const usersRef = db.collection("users");
    // If a user document already exists, role assignment is managed explicitly
    // (e.g. by the demo seed); don't overwrite it.
    const existing = await usersRef.doc(user.uid).get();
    if (existing.exists) return;

    // Create the profile with NO privileges. Any role shown to the UI comes
    // from the register (eligible_emails) or an explicit admin assignment.
    await usersRef.doc(user.uid).set({
      email: user.email || "",
      fullName: user.displayName || "Unknown User",
      role: "VOTER",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error("Error setting up new user:", error);
  }
});

// 2. Callable: Cast a vote securely
export const castVote = onCall(async (request) => {
  const authData = request.auth;
  if (!authData) {
    throw new HttpsError("unauthenticated", "User must be authenticated to vote.");
  }
  // Only verified email providers may vote. Without this, a password/etc.
  // provider could register an unverified account under a voter's address.
  if (authData.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "Email must be verified to vote.");
  }

  const { electionId, positionId, candidateId } = request.data;
  if (!electionId || !positionId || !candidateId) {
    throw new HttpsError("invalid-argument", "Missing electionId, positionId, or candidateId.");
  }

  return await db.runTransaction(async (transaction) => {
    // a. Validate election
    const electionRef = db.collection("elections").doc(electionId);
    const electionDoc = await transaction.get(electionRef);
    if (!electionDoc.exists) {
      throw new HttpsError("not-found", "Election not found.");
    }
    const election = electionDoc.data();
    if (election?.status !== "active") {
      throw new HttpsError("failed-precondition", "Election is not active.");
    }
    const now = new Date();
    if (election.startTime && now < election.startTime.toDate()) {
      throw new HttpsError("failed-precondition", "Voting has not opened yet.");
    }
    if (election.endTime && now > election.endTime.toDate()) {
      throw new HttpsError("failed-precondition", "Voting has closed.");
    }

    // b. Validate position
    const positionRef = db.collection("positions").doc(positionId);
    const positionDoc = await transaction.get(positionRef);
    if (!positionDoc.exists || positionDoc.data()?.electionId !== electionId) {
      throw new HttpsError("failed-precondition", "Invalid position for this election.");
    }

    // c. Validate candidate
    const candidateRef = db.collection("candidates").doc(candidateId);
    const candidateDoc = await transaction.get(candidateRef);
    if (!candidateDoc.exists || candidateDoc.data()?.positionId !== positionId || candidateDoc.data()?.electionId !== electionId) {
      throw new HttpsError("failed-precondition", "Invalid candidate for this position.");
    }

    // d. Validate eligibility
    const rosterQuery = db.collection("voter_roster")
      .where("electionId", "==", electionId)
      .where("voterEmail", "==", authData.token.email);
    const rosterSnapshot = await transaction.get(rosterQuery);
    if (rosterSnapshot.empty) {
      throw new HttpsError("permission-denied", "You are not on the voter roster for this election.");
    }
    const rosterDoc = rosterSnapshot.docs[0];
    if (!rosterDoc) {
      throw new HttpsError("permission-denied", "You are not on the voter roster for this election.");
    }

    // e. Enforce once-and-only-once per voter, keyed by the roster entry
    //    (email-scoped), so it cannot be bypassed with a second account.
    const rosterData = rosterDoc.data() || {};
    const votedPositions = Array.isArray(rosterData.votedPositions) ? rosterData.votedPositions : [];
    if (votedPositions.includes(positionId)) {
      throw new HttpsError("already-exists", "You have already voted for this position.");
    }

    // Defense in depth: also reject if a receipt already exists for this uid.
    const receiptRef = db.collection("users").doc(authData.uid).collection("receipts").doc(`${electionId}_${positionId}`);
    const receiptDoc = await transaction.get(receiptRef);
    if (receiptDoc.exists) {
      throw new HttpsError("already-exists", "You have already voted for this position.");
    }

    // Insert vote (no voter_id to maintain anonymity). Deliberately no
    // timestamp: a precise timestamp on the vote could be correlated with the
    // named receipt (written in the same transaction at the same commit time)
    // to reconstruct the ballot.
    const voteRef = db.collection("votes").doc();
    transaction.set(voteRef, {
      electionId,
      positionId,
      candidateId,
    });

    // Insert receipt
    transaction.set(receiptRef, {
      electionId,
      positionId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Mark roster as voted (per-position + overall flag). Done atomically in the
    // same transaction, so concurrent duplicate submissions are rejected.
    transaction.update(rosterDoc.ref, {
      hasVoted: true,
      votedPositions: admin.firestore.FieldValue.arrayUnion(positionId),
    });

    // Audit log - deliberately WITHOUT the voter's identity and WITHOUT the
    // candidate chosen, so ballot secrecy holds: an admin cannot link a vote
    // to its voter or learn which candidate a voter picked.
    const auditRef = db.collection("audit_logs").doc();
    transaction.set(auditRef, {
      action: "CAST_VOTE",
      entityType: "vote",
      entityId: positionId,
      details: { electionId, positionId },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  });
});

// 3. Callable: Set user role (Admin only)
const VALID_ROLES = ["ROLE_ADMINISTRATOR", "ROLE_CHAIRPERSON", "ROLE_SECRETARY", "ROLE_ASSISTANT", "VOTER"];
export const setUserRole = onCall(async (request) => {
  const authData = request.auth;
  if (!authData || authData.token.role !== "ROLE_CHAIRPERSON") {
    throw new HttpsError("permission-denied", "Only Chairperson can assign roles.");
  }

  const { targetUid, targetRole } = request.data;
  if (!targetUid || !targetRole) {
    throw new HttpsError("invalid-argument", "Missing targetUid or targetRole.");
  }
  if (!VALID_ROLES.includes(targetRole)) {
    throw new HttpsError("invalid-argument", `Unknown role: ${targetRole}`);
  }

  // Assign the new role
  await admin.auth().setCustomUserClaims(targetUid, { role: targetRole });

  // Update user doc for UI purposes
  await db.collection("users").doc(targetUid).update({
    role: targetRole, // for easy frontend querying
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Audit log
  await db.collection("audit_logs").add({
    userId: authData.uid,
    userEmail: authData.token.email,
    action: "UPDATE_USER_ROLE",
    entityType: "user",
    entityId: targetUid,
    details: { targetRole },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true };
});
