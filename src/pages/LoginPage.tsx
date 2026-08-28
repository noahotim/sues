import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService, MAINTENANCE_ERR_MARKER, MAINTENANCE_DEFAULT_MESSAGE, type MaintenanceMode } from "../services";
import { Button, Spinner } from "../components/ui";

export default function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [maintenance, setMaintenance] = useState<MaintenanceMode>({ enabled: false, message: MAINTENANCE_DEFAULT_MESSAGE });

  // Live maintenance kill-switch. When the chairperson locks the system the
  // login screen immediately shows the CONTACT NOAH lockout and refuses entry;
  // it recovers automatically once the lock is lifted.
  useEffect(() => {
    const unsub = authService.subscribeToMaintenance(setMaintenance);
    return () => unsub();
  }, []);

  // Handle the return trip when sign-in used the full-page redirect flow.
  useEffect(() => {
    (async () => {
      const res = await authService.resolveRedirectSignIn();
      if (res.user) {
        navigate("/admin/dashboard", { replace: true });
      } else if (res.error) {
        if (res.error.startsWith(MAINTENANCE_ERR_MARKER)) {
          setMaintenance({ enabled: true, message: res.error.replace(MAINTENANCE_ERR_MARKER, "") });
        } else {
          setError(res.error);
        }
      }
    })();
  }, [navigate]);

  async function handleGoogleSignIn() {
    setError("");
    setSubmitting(true);

    try {
      const { user, error, redirecting } = await authService.signInWithGoogle();
      if (redirecting) {
        setRedirecting(true);
        return;
      }
      if (error || !user) {
        if (error && error.startsWith(MAINTENANCE_ERR_MARKER)) {
          setMaintenance({ enabled: true, message: error.replace(MAINTENANCE_ERR_MARKER, "") });
        } else {
          setError(error || "Authentication failed");
        }
        return;
      }
      navigate("/admin/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  }

  // Maintenance lockout: a firm full-screen block on every sign-in attempt.
  if (maintenance.enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary-900 p-6 relative overflow-hidden">
        {/* hard block pattern for a DDoS-style lockdown feel */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, #fff 0 2px, transparent 2px 14px)",
          }}
        />
        <div className="w-full max-w-lg bg-white border-l-4 border-red-600 shadow-2xl p-8 text-center relative z-10">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-red-600 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-9 h-9 text-white fill-current" aria-hidden>
              <path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4Zm0 2.18 7 3.11v5.7c0 4.5-2.92 8.67-7 10-4.08-1.33-7-5.5-7-10v-5.7l7-3.11ZM11 7v6h2V7h-2Zm0 8v2h2v-2h-2Z" />
            </svg>
          </div>
          <p className="text-xs font-bold tracking-[0.3em] text-red-600 uppercase mb-2">
            Access Denied — System Locked
          </p>
          <h1 className="text-2xl font-extrabold text-primary-900 tracking-tight mb-3">
            CONTACT NOAH
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
            {maintenance.message}
          </p>
          <p className="mt-4 text-xs text-slate-400">
            Sign-in is temporarily disabled for all users. This screen will unlock
            automatically once the administrator reopens the system.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-10 text-center">
          <img
            src="/sues-logo.jpg"
            alt="SUES logo"
            className="w-20 h-20 object-contain mb-6 rounded-sm"
          />
          <h2 className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-2">Soroti University Engineering Society</h2>
          <h1 className="text-3xl font-extrabold text-primary-900 tracking-tight">Elections Portal</h1>
        </div>

        <div className="bg-white border-t-2 border-primary-900 p-8 flex flex-col gap-6 shadow-sm rounded-sm bg-slate-50">
          {error && (
            <div className="text-sm text-error-700 bg-error-50 border border-error-200 rounded-sm px-4 py-3">
              {error}
            </div>
          )}

          {redirecting && (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
              <Spinner size={16} />
              Redirecting to Google sign-in…
            </div>
          )}

          <Button onClick={handleGoogleSignIn} disabled={submitting || redirecting} className="w-full" size="lg">
            {submitting || redirecting ? "Signing in..." : "Sign in with Google"}
          </Button>

          <details className="text-sm text-slate-600 border-t border-slate-200 pt-4">
            <summary className="cursor-pointer font-medium text-slate-700 select-none">
              Who can sign in?
            </summary>
            <ul className="mt-3 space-y-2 text-slate-600">
              <li>
                <span className="font-medium text-primary-900">Voters</span> —
                students uploaded onto this election's <strong>voter roster</strong> (by the
                Electoral Commission via CSV import). Sign in with the exact Google email on that
                roster.
              </li>
              <li>
                <span className="font-medium text-primary-900">Election officials</span> —
                members of the Electoral Commission (Chairperson, Secretary, Assistant) are also
                added to the register and sign in with the Google email registered for them.
              </li>
              <li className="text-slate-500">
                Only emails found on the voter roster or the officials' register are allowed;
                everyone else is signed out automatically. If your email is not recognized,
                contact the Electoral Commission (see below).
              </li>
            </ul>
          </details>

          {/* Technical support */}
          <div className="border-t border-slate-200 pt-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
              Technical difficulties?
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">
              Contact us on WhatsApp before the polls close:
            </p>
            <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
              <li className="flex items-start gap-2">
                <span className="font-medium text-primary-900 shrink-0">Arikod Charles</span>
                <span className="text-slate-500">— Chairperson, Electoral Commission · +256 700 837339</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-primary-900 shrink-0">Abel Ea</span>
                <span className="text-slate-500">— Outgoing President · +256 784 014317</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
