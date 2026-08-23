import { useEffect, useState } from "react";
import {
  Vote,
  Users,
  BarChart3,
  CheckCircle2,
  TrendingUp,
  ClipboardList,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import {
  dashboardService,
  electionService,
  type DashboardMetrics,
  type Election,
} from "../services";
import { Card, LoadingState, ErrorState, Badge } from "../components/ui";

export default function DashboardPage() {
  const { profile, role } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [elections, setElections] = useState<Election[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(false);
    try {
      const m = await dashboardService.loadDashboardMetrics();
      const { data: e } = await electionService.getElections();
      setMetrics(m);
      if (e) setElections(e);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  if (loading) return <LoadingState message="Loading dashboard..." />;
  if (error || !metrics)
    return <ErrorState message="Failed to load dashboard data." onRetry={loadData} />;

  const statCards = [
    {
      label: "Total Elections",
      value: metrics.totalElections,
      icon: <Vote size={20} />,
      color: "primary",
    },
    {
      label: "Active Elections",
      value: metrics.activeElections,
      icon: <BarChart3 size={20} />,
      color: "success",
    },
    {
      label: "Candidates",
      value: metrics.totalCandidates,
      icon: <Users size={20} />,
      color: "accent",
    },
    {
      label: "Eligible Voters",
      value: metrics.totalEligibleVoters,
      icon: <ClipboardList size={20} />,
      color: "primary",
    },
    {
      label: "Votes Cast",
      value: metrics.totalVotesCast,
      icon: <CheckCircle2 size={20} />,
      color: "success",
    },
    {
      label: "Turnout",
      value: `${metrics.turnoutPercentage}%`,
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
        <h2 className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-1">SUES Administration</h2>
        <h1 className="text-3xl font-extrabold text-primary-900 tracking-tight">System Overview</h1>
        <p className="text-sm text-slate-600 mt-2">
          Welcome back{profile?.full_name ? `, ${profile.full_name}` : ""}.
          {role && <span className="ml-1">You are signed in as {role.label}.</span>}
        </p>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className="p-6 border-t-4 border-t-primary-900 flex flex-col justify-between h-32 rounded-sm shadow-none">
            <div className="flex justify-between items-start mb-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{stat.label}</p>
              <div className="text-slate-400">
                {stat.icon}
              </div>
            </div>
            <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Recent elections */}
      <Card className="p-6 rounded-sm shadow-none">
        <h2 className="text-lg font-bold text-primary-900 mb-6 uppercase tracking-widest">Recent Elections</h2>
        {elections.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">
            No elections have been created yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b-2 border-slate-200">
                  <th className="pb-3 text-xs font-bold uppercase tracking-wider">Title</th>
                  <th className="pb-3 text-xs font-bold uppercase tracking-wider">Status</th>
                  <th className="pb-3 text-xs font-bold uppercase tracking-wider">Start</th>
                  <th className="pb-3 text-xs font-bold uppercase tracking-wider">End</th>
                </tr>
              </thead>
              <tbody>
                {elections.slice(0, 5).map((election) => (
                  <tr key={election.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 font-medium text-slate-900">{election.title}</td>
                    <td className="py-3">{statusBadge(election.status)}</td>
                    <td className="py-3 text-slate-600">
                      {election.start_time
                        ? new Date(election.start_time).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="py-3 text-slate-600">
                      {election.end_time
                        ? new Date(election.end_time).toLocaleDateString()
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
