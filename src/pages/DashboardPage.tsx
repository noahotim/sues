import { useEffect, useState } from "react";
import {
  Vote,
  Users,
  BarChart3,
  CheckCircle2,
  TrendingUp,
  ClipboardList,
  Lock,
  LockOpen,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import {
  electionService,
  candidateService,
  rosterService,
  authService,
  getMaintenanceAdminEmails,
  type MaintenanceMode,
  MAINTENANCE_DEFAULT_MESSAGE,
  type Election,
  type Candidate,
  type VoterRosterEntry,
} from "../services";
import { Card, LoadingState, ErrorState, Badge, Select, Button, Input } from "../components/ui";

export default function DashboardPage() {
  const { profile, role } = useAuth();
  const [elections, setElections] = useState<Election[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [roster, setRoster] = useState<VoterRosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [maintenance, setMaintenance] = useState<MaintenanceMode>({ enabled: false, message: MAINTENANCE_DEFAULT_MESSAGE });
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const [adminEmails, setAdminEmails] = useState("");
  const [adminEmailsBusy, setAdminEmailsBusy] = useState(false);
  const [adminEmailsSaved, setAdminEmailsSaved] = useState(false);

  const isAdmin = role?.id === "ROLE_ADMINISTRATOR";
  const canManageMaintenance = isAdmin || role?.id === "ROLE_CHAIRPERSON";

  // Current maintenance kill-switch (Administrator/Chairperson sees + can toggle it).
  useEffect(() => {
    if (!canManageMaintenance) return;
    authService.getMaintenanceMode().then((m) => {
      if (m) setMaintenance(m);
    });
    getMaintenanceAdminEmails().then((emails) => {
      setAdminEmails(emails.join(", "));
    });
  }, [canManageMaintenance]);

  async function toggleMaintenance() {
    setMaintenanceBusy(true);
    const res = await authService.setMaintenanceMode(!maintenance.enabled);
    setMaintenanceBusy(false);
    if (!res.error) {
      setMaintenance((prev) => ({
        ...prev,
        enabled: !prev.enabled,
      }));
    }
  }

  async function saveAdminEmails() {
    setAdminEmailsBusy(true);
    const list = adminEmails.split(",").map((e) => e.trim()).filter(Boolean);
    const res = await authService.setMaintenanceAdminEmails(list);
    setAdminEmailsBusy(false);
    if (!res.error) {
      setAdminEmailsSaved(true);
      window.setTimeout(() => setAdminEmailsSaved(false), 2500);
    }
  }

  // Live elections list (realtime).
  useEffect(() => {
    const unsub = electionService.subscribeToElections((data) => {
      setElections(data);
      if (data.length > 0) {
        setSelectedElectionId((prev) =>
          prev && data.some((e) => e.id === prev) ? prev : data[0].id
        );
      } else {
        setSelectedElectionId("");
      }
      setLoading(false);
      setError(false);
    });
    return () => unsub();
  }, []);

  // Live candidates + roster for the selected election (realtime).
  useEffect(() => {
    if (!selectedElectionId) {
      setCandidates([]);
      setRoster([]);
      return;
    }
    const unsubC = candidateService.subscribeToCandidates(selectedElectionId, setCandidates);
    const unsubR = rosterService.subscribeToRoster(selectedElectionId, setRoster);
    return () => {
      unsubC();
      unsubR();
    };
  }, [selectedElectionId]);

  if (loading) return <LoadingState message="Loading dashboard..." />;
  if (error)
    return <ErrorState message="Failed to load dashboard data." onRetry={() => window.location.reload()} />;

  const activeElections = elections.filter((e) => e.status === "active").length;
  const votersVoted = roster.filter((r) => r.hasVoted).length;
  const turnout = roster.length > 0 ? Math.round((votersVoted / roster.length) * 100) : 0;

  const statCards = [
    {
      label: "Total Elections",
      value: elections.length,
      icon: <Vote size={20} />,
      color: "primary",
    },
    {
      label: "Active Elections",
      value: activeElections,
      icon: <BarChart3 size={20} />,
      color: "success",
    },
    {
      label: "Candidates",
      value: candidates.length,
      icon: <Users size={20} />,
      color: "accent",
    },
    {
      label: "Eligible Voters",
      value: roster.length,
      icon: <ClipboardList size={20} />,
      color: "primary",
    },
    {
      label: "Voters Voted",
      value: votersVoted,
      icon: <CheckCircle2 size={20} />,
      color: "success",
    },
    {
      label: "Turnout",
      value: `${turnout}%`,
      icon: <TrendingUp size={20} />,
      color: "accent",
    },
  ];

  function statusBadge(status: string): React.ReactNode {
    const map: Record<string, { variant: "neutral" | "success" | "warning" | "primary"; label: string }> = {
      draft: { variant: "neutral", label: "Draft" },
      active: { variant: "success", label: "Active" },
      closed: { variant: "warning", label: "Closed" },
      published: { variant: "primary", label: "Published" },
    };
    const cfg = map[status] ?? { variant: "neutral" as const, label: status };
    return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="mb-8 border-b-2 border-primary-900 pb-4">
        <div className="flex items-center gap-4">
          <img
            src="/sues-logo.jpg"
            alt="SUES logo"
            className="w-14 h-14 object-contain rounded-sm hidden sm:block"
          />
          <div>
            <h2 className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-1">SUES Administration</h2>
            <h1 className="text-3xl font-extrabold text-primary-900 tracking-tight">System Overview</h1>
            <p className="text-sm text-slate-600 mt-2">
              Welcome back{profile?.fullName ? `, ${profile.fullName}` : ""}.
              {role && <span className="ml-1">You are signed in as {role.label}.</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Election selector - candidates/voters/turnout are scoped to it */}
      {elections.length > 0 && (
        <Select
          label="Election Overview"
          value={selectedElectionId}
          onChange={setSelectedElectionId}
          options={elections.map((e) => ({ value: e.id, label: e.title }))}
          placeholder="Choose an election..."
        />
      )}

      {/* Metrics grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className="p-6 border-t-4 border-t-primary-900 flex flex-col justify-between h-32 rounded-sm shadow-none">
            <div className="flex justify-between items-start mb-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{stat.label}</p>
              <div className="text-slate-400">{stat.icon}</div>
            </div>
            <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Maintenance kill-switch (Administrator/Chairperson only) */}
      {canManageMaintenance && (
        <Card className="p-6 rounded-sm shadow-none border-t-4 border-t-red-600">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              {maintenance.enabled ? (
                <Lock className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
              ) : (
                <LockOpen className="w-6 h-6 text-slate-400 shrink-0 mt-0.5" />
              )}
              <div>
                <h2 className="text-lg font-bold text-primary-900 mb-1 uppercase tracking-widest">
                  Maintenance Lock
                </h2>
                <p className="text-sm text-slate-600">
                  {maintenance.enabled
                    ? "The system is LOCKED. Only the Administrator email(s) you set below can sign in; everyone else sees the CONTACT NOAH lockout."
                    : "The system is open. Turn the lock ON to deny every sign-in and show the CONTACT NOAH lockout."}
                </p>
              </div>
            </div>
            <Button
              onClick={toggleMaintenance}
              disabled={maintenanceBusy}
              variant={maintenance.enabled ? "danger" : "primary"}
              className="shrink-0"
            >
              {maintenanceBusy
                ? "Updating…"
                : maintenance.enabled
                ? "Reopen system"
                : "Lock system (deny all sign-ins)"}
            </Button>
          </div>

          {/* Email(s) allowed to sign in while the lock is ON */}
          <div className="mt-5 border-t border-slate-200 pt-4">
            <label htmlFor="maintenance-admin-emails" className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
              Administrator email(s) allowed to sign in during lock (comma-separated)
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={adminEmails}
                onChange={(v) => setAdminEmails(v)}
                placeholder="admin@example.com, owner@example.com"
              />
              <Button
                onClick={saveAdminEmails}
                disabled={adminEmailsBusy || !adminEmails.trim()}
                variant="secondary"
                className="shrink-0"
              >
                {adminEmailsBusy ? "Saving…" : adminEmailsSaved ? "Saved" : "Save"}
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Nothing is set by default. Only the email(s) you list here (or that you assign the
              Administrator role to in User Management) can sign in while the lock is ON.
            </p>
          </div>
        </Card>
      )}

      {/* Recent elections */}
      <Card className="p-6 rounded-sm shadow-none">
        <h2 className="text-lg font-bold text-primary-900 mb-6 uppercase tracking-widest">Elections</h2>
        {elections.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">No elections have been created yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b-2 border-slate-200">
                  <th className="pb-3 text-xs font-bold uppercase tracking-wider">Title</th>
                  <th className="pb-3 text-xs font-bold uppercase tracking-wider">Status</th>
                  <th className="pb-3 text-xs font-bold uppercase tracking-wider">Candidates</th>
                  <th className="pb-3 text-xs font-bold uppercase tracking-wider">Voters</th>
                  <th className="pb-3 text-xs font-bold uppercase tracking-wider">Voted</th>
                </tr>
              </thead>
              <tbody>
                {elections.map((election) => (
                  <tr key={election.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 font-medium text-slate-900">{election.title}</td>
                    <td className="py-3">{statusBadge(election.status)}</td>
                    <td className="py-3 text-slate-600">
                      {election.id === selectedElectionId ? candidates.length : "—"}
                    </td>
                    <td className="py-3 text-slate-600">
                      {election.id === selectedElectionId ? roster.length : "—"}
                    </td>
                    <td className="py-3 text-slate-600">
                      {election.id === selectedElectionId
                        ? `${roster.filter((r) => r.hasVoted).length} / ${roster.length}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
