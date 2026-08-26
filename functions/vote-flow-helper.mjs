// Client-side voting flow (mirrors src/services/voteService.ts) for demo/test
// scripts. Works entirely against Firestore - no Cloud Functions required.
import { doc, setDoc, getDoc, serverTimestamp, arrayUnion } from "firebase/firestore";

export async function submitVote(db, auth, { electionId, positionId, candidateId }) {
  const user = auth.currentUser;
  if (!user || !user.email) throw Object.assign(new Error("Must be signed in"), { code: "unauthenticated" });
  const email = user.email.toLowerCase();
  const receiptRef = doc(db, "vote_receipts", `${email}__${electionId}__${positionId}`);

  const existing = await getDoc(receiptRef).catch(() => null);
  if (existing && existing.exists()) {
    throw Object.assign(new Error("You have already voted for this position."), { code: "already-exists" });
  }

  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

  try {
    await setDoc(receiptRef, { voterEmail: email, electionId, positionId, nonce, createdAt: serverTimestamp() });
  } catch (e) {
    if (e.code === "already-exists") throw Object.assign(new Error("You have already voted for this position."), { code: "already-exists" });
    throw e; // permission-denied etc.
  }

  await setDoc(doc(db, "votes", nonce), { electionId, positionId, candidateId, createdAt: serverTimestamp() });

  try {
    await setDoc(
      doc(db, "voter_roster", `voter_${electionId}_${email}`),
      { hasVoted: true, votedPositions: arrayUnion(positionId) },
      { merge: true }
    );
  } catch {}

  return { success: true };
}
