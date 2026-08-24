import { useEffect, useState, useCallback } from "react";
import { ScrollText } from "lucide-react";
import { auditService, type AuditLog } from "../services";
import {
  Card,
  LoadingState,
  ErrorState,
  EmptyState,
  Badge,
} from "../components/ui";

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await auditService.getAuditLogs();
      if (data) setLogs(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function formatAction(action: string): string {
    return action
      .toLowerCase()
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  function formatTime(ts: string): string {
    const date = new Date(ts);
    return date.toLocaleString();
  }

  if (loading) return <LoadingState message="Loading audit logs..." />;
  if (error) return <ErrorState message="We could not load the audit logs." onRetry={load} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="mb-8 border-b-2 border-primary-900 pb-4">
        <h2 className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-1">SUES Administration</h2>
        <h1 className="text-3xl font-extrabold text-primary-900 tracking-tight">Audit Logs</h1>
        <p className="text-sm text-slate-600 mt-2">
          A chronological record of all privileged operations performed in the system.
        </p>
      </div>

      {logs.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<ScrollText size={48} />}
            title="No audit entries yet"
            message="Audit log entries will appear here as privileged operations are performed."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden rounded-sm shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b-2 border-slate-200">
                <tr className="text-left text-slate-500">
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">Time</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">User</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">Action</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">Entity</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                      {formatTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-medium">{log.userEmail || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant="primary">{formatAction(log.action)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{log.entityType || "—"}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {Object.keys(log.details).length > 0
                        ? JSON.stringify(log.details)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
