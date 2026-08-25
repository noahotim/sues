"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.setUserRole = exports.castVote = exports.onUserCreated = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const https_1 = require("firebase-functions/v2/https");
const functions = __importStar(require("firebase-functions/v1"));
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
// Only @sun.ac.ug student emails (numeric part starting 220-260) may use the app.
function isValidStudentEmail(email) {
    if (!email)
        return false;
    const m = /^(\d+)@sun\.ac\.ug$/i.exec(email);
    if (!m || !m[1])
        return false;
    const prefix = parseInt(m[1].slice(0, 3), 10);
    return prefix >= 220 && prefix <= 260;
}
// Normalize a start/end time that may be a Firestore Timestamp or an ISO string.
function toDate(value) {
    if (!value)
        return null;
    if (typeof value === "string")
        return new Date(value);
    return value.toDate();
}
// 1. Trigger: Auto-create user document & assign default role on sign up
exports.onUserCreated = functions.auth.user().onCreate(async (user) => {
    try {
        // Reject any account that is not a valid @sun.ac.ug student email.
        // We delete it so it can never be used to sign in or vote.
        if (!isValidStudentEmail(user.email)) {
            console.warn("Rejecting non-student email signup:", user.email);
            try {
                await (0, auth_1.getAuth)().deleteUser(user.uid);
            }
            catch (deleteError) {
                console.error("Failed to delete rejected user:", deleteError);
            }
            return;
        }
        const usersRef = db.collection("users");
        // Check if this is the first user
        const usersSnapshot = await usersRef.limit(1).get();
        const isFirstUser = usersSnapshot.empty;
        let role = "VOTER";
        if (isFirstUser) {
            role = "ROLE_CHAIRPERSON";
        }
        // Assign custom claim
        await (0, auth_1.getAuth)().setCustomUserClaims(user.uid, { role });
        // Create user document
        await usersRef.doc(user.uid).set({
            email: user.email || "",
            fullName: user.displayName || "Unknown User",
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    }
    catch (error) {
        console.error("Error setting up new user:", error);
    }
});
// 2. Callable: Cast a vote securely
exports.castVote = (0, https_1.onCall)(async (request) => {
    const authData = request.auth;
    if (!authData) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated to vote.");
    }
    const { electionId, positionId, candidateId } = request.data;
    if (!electionId || !positionId || !candidateId) {
        throw new https_1.HttpsError("invalid-argument", "Missing electionId, positionId, or candidateId.");
    }
    return await db.runTransaction(async (transaction) => {
        // a. Validate election
        const electionRef = db.collection("elections").doc(electionId);
        const electionDoc = await transaction.get(electionRef);
        if (!electionDoc.exists) {
            throw new https_1.HttpsError("not-found", "Election not found.");
        }
        const election = electionDoc.data();
        if (election?.status !== "active") {
            throw new https_1.HttpsError("failed-precondition", "Election is not active.");
        }
        const now = new Date();
        const startTime = toDate(election?.startTime);
        const endTime = toDate(election?.endTime);
        if (startTime && now < startTime) {
            throw new https_1.HttpsError("failed-precondition", "Voting has not opened yet.");
        }
        if (endTime && now > endTime) {
            throw new https_1.HttpsError("failed-precondition", "Voting has closed.");
        }
        // b. Validate position
        const positionRef = db.collection("positions").doc(positionId);
        const positionDoc = await transaction.get(positionRef);
        if (!positionDoc.exists || positionDoc.data()?.electionId !== electionId) {
            throw new https_1.HttpsError("failed-precondition", "Invalid position for this election.");
        }
        // c. Validate candidate
        const candidateRef = db.collection("candidates").doc(candidateId);
        const candidateDoc = await transaction.get(candidateRef);
        if (!candidateDoc.exists || candidateDoc.data()?.positionId !== positionId || candidateDoc.data()?.electionId !== electionId) {
            throw new https_1.HttpsError("failed-precondition", "Invalid candidate for this position.");
        }
        // d. Validate eligibility
        const rosterQuery = db.collection("voter_roster")
            .where("electionId", "==", electionId)
            .where("voterEmail", "==", authData.token.email);
        const rosterSnapshot = await transaction.get(rosterQuery);
        if (rosterSnapshot.empty) {
            throw new https_1.HttpsError("permission-denied", "You are not on the voter roster for this election.");
        }
        const rosterDoc = rosterSnapshot.docs[0];
        // e. Prevent duplicate votes per position using a receipt stored under the user
        const receiptRef = db.collection("users").doc(authData.uid).collection("receipts").doc(`${electionId}_${positionId}`);
        const receiptDoc = await transaction.get(receiptRef);
        if (receiptDoc.exists) {
            throw new https_1.HttpsError("already-exists", "You have already voted for this position.");
        }
        // Insert vote (no voter_id to maintain anonymity)
        const voteRef = db.collection("votes").doc();
        transaction.set(voteRef, {
            electionId,
            positionId,
            candidateId,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        // Insert receipt
        transaction.set(receiptRef, {
            electionId,
            positionId,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        // Mark roster as voted
        transaction.update(rosterDoc.ref, { hasVoted: true });
        // Audit log - deliberately WITHOUT the voter's identity so ballot
        // secrecy is preserved (an admin cannot link a vote to its voter).
        const auditRef = db.collection("audit_logs").doc();
        transaction.set(auditRef, {
            action: "CAST_VOTE",
            entityType: "vote",
            entityId: candidateId,
            details: { electionId, positionId },
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return { success: true };
    });
});
// 3. Callable: Set user role (Admin only)
exports.setUserRole = (0, https_1.onCall)(async (request) => {
    const authData = request.auth;
    if (!authData || authData.token.role !== "ROLE_CHAIRPERSON") {
        throw new https_1.HttpsError("permission-denied", "Only Chairperson can assign roles.");
    }
    const { targetUid, targetRole } = request.data;
    if (!targetUid || !targetRole) {
        throw new https_1.HttpsError("invalid-argument", "Missing targetUid or targetRole.");
    }
    // Assign the new role
    await (0, auth_1.getAuth)().setCustomUserClaims(targetUid, { role: targetRole });
    // Update user doc for UI purposes
    await db.collection("users").doc(targetUid).update({
        role: targetRole, // for easy frontend querying
        updatedAt: firestore_1.FieldValue.serverTimestamp()
    });
    // Audit log
    await db.collection("audit_logs").add({
        userId: authData.uid,
        userEmail: authData.token.email,
        action: "UPDATE_USER_ROLE",
        entityType: "user",
        entityId: targetUid,
        details: { targetRole },
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    return { success: true };
});
