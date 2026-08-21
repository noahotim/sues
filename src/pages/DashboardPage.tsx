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
  loadDashboardMetrics,
  loadElections,
  type DashboardMetrics,
  type Election,
} from "../lib/services";
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
      const [m, e] = await Promise.all([loadDashboardMetrics(), loadElections()]);
      setMetrics(m);
      setElections(e);
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

  const colorMap: Record<string, string> = {
    primary: "bg-primary-50 text-primary-600",
    success: "bg-success-50 text-success-600",
    accent: "bg-accent-50 text-accent-600",
    warning: "bg-warning-50 text-warning-600",
    error: "bg-error-50 text-error-600",
  };

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
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          Welcome back{profile?.full_name ? `, ${profile.full_name}` : ""}.
          {role && <span className="ml-1">You are signed in as {role.label}.</span>}
        </p>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className="p-5">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${colorMap[stat.color]}`}>
              {stat.icon}
            </div>
            <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
            <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
          </Card>
        ))}
      </div>

      {/* Recent elections */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Elections</h2>
        {elections.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">
            No elections have been created yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="pb-3 font-medium">Title</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Start</th>
                  <th className="pb-3 font-medium">End</th>
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
