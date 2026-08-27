import { db } from "../lib/firebase";
import { collection, query, orderBy, getDocs, onSnapshot, limit, addDoc, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";

export interface AuditLog {
  id: string;
  userId?: string;
  userEmail?: string;
  actorEmail?: string;
  action: string;
  entityType: string;
  entityId: string;
  details: any;
  createdAt: string;
}

// Actions that must NEVER carry voter identity (ballot secrecy).
const ANONYMOUS_ACTIONS = ["CAST_VOTE"];

function mapDoc(doc: any): AuditLog {
  const data = doc.data();
  return {
    id: doc.id,
    userId: data.userId,
    userEmail: data.userEmail,
    actorEmail: data.actorEmail,
    action: data.action,
    entityType: data.entityType,
    entityId: data.entityId,
    details: data.details,
    createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
  };
}

export const auditService = {
  /**
   * Append an audit entry. Best-effort: it never blocks or fails the action it
   * records. CAST_VOTE entries are deliberately anonymous.
   */
  log: async (action: string, entityType: string, entityId: string, details?: Record<string, unknown>) => {
    try {
      const actor = getAuth().currentUser;
      const data: Record<string, unknown> = {
        action,
        entityType,
        entityId,
        details: details || {},
        createdAt: serverTimestamp(),
      };
      if (!ANONYMOUS_ACTIONS.includes(action)) {
        data.actorEmail = actor?.email ?? "";
      }
      await addDoc(collection(db, "audit_logs"), data);
    } catch {
      /* audit must never break the main operation */
    }
  },

  getAuditLogs: async () => {
    try {
      const q = query(collection(db, "audit_logs"), orderBy("createdAt", "desc"), limit(100));
      const snapshot = await getDocs(q);
      return { data: snapshot.docs.map(mapDoc), error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  subscribeToAuditLogs: (callback: (data: AuditLog[]) => void) => {
    const q = query(collection(db, "audit_logs"), orderBy("createdAt", "desc"), limit(100));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(mapDoc));
    });
  }
};
