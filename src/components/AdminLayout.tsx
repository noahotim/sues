import { useEffect, useState } from "react";
import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import * as LucideIcons from "lucide-react";
import type { ComponentType } from "react";
import { useAuth } from "../lib/auth";
import { authService } from "../services";
import { NAVIGATION_ITEMS } from "../lib/constants";
import { Spinner } from "./ui";

export default function AdminLayout() {
  const { session, profile, role, permissions, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [navItems, setNavItems] = useState<typeof NAVIGATION_ITEMS>([]);
  const [navLoading, setNavLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) {
      navigate("/login", { replace: true });
    }
  }, [loading, session, navigate]);

  useEffect(() => {
    async function fetchNav() {
      if (permissions.length > 0) {
        const filteredNav = NAVIGATION_ITEMS.filter((item) =>
          !item.permission_id || permissions.includes(item.permission_id)
        );
        setNavItems(filteredNav);
      } else {
        setNavItems([]);
      }
      setNavLoading(false);
    }
    fetchNav();
  }, [permissions]);

  async function handleSignOut() {
    await authService.signOut();
    navigate("/login", { replace: true });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner className="text-primary-500" />
      </div>
    );
  }

  if (!session) return null;

  // Filter navigation items by the user's permissions
  const visibleNavItems = navItems.filter(
    (item) => !item.permission_id || permissions.includes(item.permission_id)
  );

  function getIcon(name: string) {
    const icons = LucideIcons as unknown as Record<string, ComponentType<{ size?: number }> | undefined>;
    const Icon = icons[name];
    return Icon ? <Icon size={20} /> : <LucideIcons.Circle size={20} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen w-64 bg-primary-950 text-slate-100 flex flex-col z-40 transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="px-6 py-5 border-b border-primary-900">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-sm bg-white flex items-center justify-center">
              <LucideIcons.Vote size={20} className="text-primary-900" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-widest uppercase">SUES</h1>
              <p className="text-xs text-slate-400">Administration</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navLoading ? (
            <div className="flex justify-center py-8">
              <Spinner className="text-slate-400" />
            </div>
          ) : visibleNavItems.length === 0 ? (
            <p className="text-xs text-slate-500 px-3 py-4">No navigation available.</p>
          ) : (
            visibleNavItems.map((item) => (
              <Link
                key={item.id}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors border-l-4 ${
                  location.pathname === item.path
                    ? "border-accent-400 bg-primary-900 text-white"
                    : "border-transparent text-slate-300 hover:bg-primary-900 hover:text-white"
                }`}
              >
                {getIcon(item.icon_name)}
                <span>{item.label}</span>
              </Link>
            ))
          )}
        </nav>

        <div className="px-3 py-4 border-t border-primary-900">
          <div className="px-3 py-2 mb-2">
            <p className="text-sm font-bold text-white truncate tracking-wide">
              {profile?.full_name || profile?.email || session.user.email}
            </p>
            {role && (
              <p className="text-xs text-slate-400 mt-0.5">{role.label}</p>
            )}
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-medium text-slate-300 hover:bg-primary-900 hover:text-white transition-colors w-full"
          >
            <LucideIcons.LogOut size={20} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <LucideIcons.Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <LucideIcons.Vote size={18} className="text-primary-900" />
            <span className="font-bold text-sm tracking-widest uppercase">SUES</span>
          </div>
          <div className="w-10" />
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
