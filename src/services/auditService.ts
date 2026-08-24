import { db } from "../lib/firebase";
import { collection, query, orderBy, getDocs, onSnapshot, limit } from "firebase/firestore";

export interface AuditLog {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  details: any;
  createdAt: string;
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
          userId: data.userId,
          userEmail: data.userEmail,
          action: data.action,
          entityType: data.entityType,
          entityId: data.entityId,
          details: data.details,
          createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString()
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
          userId: data.userId,
          userEmail: data.userEmail,
          action: data.action,
          entityType: data.entityType,
          entityId: data.entityId,
          details: data.details,
          createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString()
        } as AuditLog;
      });
      callback(logs);
    });
  }
};
