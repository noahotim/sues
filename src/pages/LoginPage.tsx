import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services";
import { Button, Spinner } from "../components/ui";

export default function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  // Handle the return trip when sign-in used the full-page redirect flow.
  useEffect(() => {
    (async () => {
      const res = await authService.resolveRedirectSignIn();
      if (res.user) {
        navigate("/admin/dashboard", { replace: true });
      } else if (res.error) {
        setError(res.error);
      }
    })();
  }, [navigate]);

  async function handleGoogleSignIn() {
    setError("");
    setSubmitting(true);

    try {
      const { user, error, redirecting } = await authService.signInWithGoogle();
      if (redirecting) {
        // Browser is navigating away to Google; nothing else to do here.
        setRedirecting(true);
        return;
      }
      if (error || !user) {
        setError(error || "Authentication failed");
        return;
      }
      navigate("/admin/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
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
                <span className="font-medium text-primary-900">Chairperson, Secretary &amp; Assistant</span> —
                university staff listed on the election register. Sign in with your registered
                <code className="text-xs bg-slate-100 px-1 py-0.5 rounded mx-1">@sun.ac.ug</code>
                Google account (e.g. <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">chair.sues@sun.ac.ug</code>).
              </li>
              <li>
                <span className="font-medium text-primary-900">Voters</span> — students imported onto a
                voter roster via CSV. Sign in with the exact email on that roster.
              </li>
              <li className="text-slate-500">
                Only emails found on the register or a roster are allowed; everyone else is signed out
                automatically. In this demo the Firebase Auth emulator is used, so any password is accepted.
              </li>
            </ul>
          </details>
        </div>
      </div>
    </div>
  );
}
