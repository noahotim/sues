import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Vote } from "lucide-react";
import { authService } from "../services";
import { Button } from "../components/ui";

export default function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleGoogleSignIn() {
    setError("");
    setSubmitting(true);

    try {
      const { user, error } = await authService.signInWithGoogle();
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary-600 flex items-center justify-center shadow-lg shadow-primary-600/20 mb-4">
            <Vote size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Election Management System</h1>
          <p className="text-sm text-slate-500 mt-1">
            Sign in with your Google account
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col gap-4">
          {error && (
            <div className="text-sm text-error-600 bg-error-50 border border-error-200 rounded-lg px-3.5 py-2.5">
              {error}
            </div>
          )}

          <Button onClick={handleGoogleSignIn} disabled={submitting} className="w-full" size="lg">
            {submitting ? "Signing in..." : "Sign in with Google"}
          </Button>
        </div>
      </div>
    </div>
  );
}
