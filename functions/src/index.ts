import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

admin.initializeApp();
const db = admin.firestore();

// 1. Trigger: Auto-create user document & assign default role on sign up
export const onUserCreated = functions.auth.user().onCreate(async (user) => {
  try {
    const usersRef = db.collection("users");
    // Check if this is the first user
    const usersSnapshot = await usersRef.limit(1).get();
    const isFirstUser = usersSnapshot.empty;
    
    let role = "VOTER";
    if (isFirstUser) {
      role = "ROLE_CHAIRPERSON";
    }

    // Assign custom claim
    await admin.auth().setCustomUserClaims(user.uid, { role });

    // Create user document
    await usersRef.doc(user.uid).set({
      email: user.email || "",
      fullName: user.displayName || "Unknown User",
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

    // e. Check for duplicate vote (votes don't have voter ID, but we track if they voted in a separate collection or inside roster)
    // Actually, in the old schema, `votes` had `voter_id` to prevent duplicate votes per position.
    // Wait, if votes don't have `voter_id` for anonymity, we MUST track their voting status per position elsewhere, or just track overall `has_voted` in the roster.
    // The old schema `submit_vote` checked: SELECT EXISTS(SELECT 1 FROM votes WHERE election_id = p_election_id AND position_id = p_position_id AND voter_id = auth.uid())
    // Let's create a `voter_receipts` subcollection inside `users` to track which positions they voted for.
    const receiptRef = db.collection("users").doc(authData.uid).collection("receipts").doc(`${electionId}_${positionId}`);
    const receiptDoc = await transaction.get(receiptRef);
    if (receiptDoc.exists) {
      throw new HttpsError("already-exists", "You have already voted for this position.");
    }

    // Insert vote (no voter_id to maintain anonymity)
    const voteRef = db.collection("votes").doc();
    transaction.set(voteRef, {
      electionId,
      positionId,
      candidateId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Insert receipt
    transaction.set(receiptRef, {
      electionId,
      positionId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Mark roster as has_voted = true
    transaction.update(rosterDoc.ref, { hasVoted: true });

    // Audit log
    const auditRef = db.collection("audit_logs").doc();
    transaction.set(auditRef, {
      userId: authData.uid,
      userEmail: authData.token.email,
      action: "CAST_VOTE",
      entityType: "vote",
      entityId: candidateId,
      details: { electionId, positionId },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  });
});

// 3. Callable: Set user role (Admin only)
export const setUserRole = onCall(async (request) => {
  const authData = request.auth;
  if (!authData || authData.token.role !== "ROLE_CHAIRPERSON") {
    throw new HttpsError("permission-denied", "Only Chairperson can assign roles.");
  }

  const { targetUid, targetRole } = request.data;
  if (!targetUid || !targetRole) {
    throw new HttpsError("invalid-argument", "Missing targetUid or targetRole.");
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
