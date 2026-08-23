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
    <div className="min-h-screen flex items-center justify-center bg-white p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="w-12 h-12 bg-primary-900 flex items-center justify-center mb-6 rounded-sm">
            <Vote size={24} className="text-white" />
          </div>
          <h2 className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-2">Soroti University Engineering Society</h2>
          <h1 className="text-3xl font-extrabold text-primary-900 tracking-tight">Elections Portal</h1>
        </div>

        <div className="bg-white border-t-2 border-primary-900 p-8 flex flex-col gap-6 shadow-sm rounded-sm bg-slate-50">
          {error && (
            <div className="text-sm text-error-700 bg-error-50 border border-error-200 rounded-sm px-4 py-3">
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
