import { db } from "../lib/firebase";
import { collection, query, orderBy, getDocs, onSnapshot, limit } from "firebase/firestore";

export interface AuditLog {
  id: string;
  user_id: string;
  user_email: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: any;
  created_at: string;
}

export const auditService = {
  getAuditLogs: async () => {
    try {
      const q = query(collection(db, "audit_logs"), orderBy("createdAt", "desc"), limit(100));
      const snapshot = await getDocs(q);
      const logs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          user_id: data.userId,
          user_email: data.userEmail,
          action: data.action,
          entity_type: data.entityType,
          entity_id: data.entityId,
          details: data.details,
          created_at: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString()
        } as AuditLog;
      });
      return { data: logs, error: null };
    } catch (error: any) {
      return { data: null, error: error.message };
    }
  },

  subscribeToAuditLogs: (callback: (data: AuditLog[]) => void) => {
    const q = query(collection(db, "audit_logs"), orderBy("createdAt", "desc"), limit(100));
    return onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          user_id: data.userId,
          user_email: data.userEmail,
          action: data.action,
          entity_type: data.entityType,
          entity_id: data.entityId,
          details: data.details,
          created_at: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString()
        } as AuditLog;
      });
      callback(logs);
    });
  }
};
