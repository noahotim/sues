import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService, isConfiguredMaintenanceAdmin, MAINTENANCE_ERR_MARKER, MAINTENANCE_DEFAULT_MESSAGE, type MaintenanceMode } from "../services";
import { Button, Spinner } from "../components/ui";

export default function LoginPage() {  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [maintenance, setMaintenance] = useState<MaintenanceMode>({ enabled: false, message: MAINTENANCE_DEFAULT_MESSAGE });
  const [lockedOut, setLockedOut] = useState(false);
  const [adminError, setAdminError] = useState("");

  // Live maintenance kill-switch.
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
          setLockedOut(true);
        } else {
          setError(res.error);
        }
      }
    })();
  }, [navigate]);

  async function handleGoogleSignIn(email?: string) {
    setError("");
    setSubmitting(true);

    try {
      const { user, error, redirecting } = await authService.signInWithGoogle(email);
      if (redirecting) {
        setRedirecting(true);
        return;
      }
      if (error || !user) {
        if (error && error.startsWith(MAINTENANCE_ERR_MARKER)) {
          setLockedOut(true);
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

  // Administrator sign-in from the maintenance lockout. Errors stay ON the
  // lockout screen so a rejected email is never silently bounced to the normal
  // login form.
  async function handleAdminGoogleSignIn(email: string) {
    setAdminError("");
    setSubmitting(true);
    try {
      const { user, error, redirecting } = await authService.signInWithGoogle(email);
      if (redirecting) {
        setRedirecting(true);
        return;
      }
      if (error || !user) {
        setAdminError(error || "Authentication failed");
        return;
      }
      navigate("/admin/dashboard", { replace: true });
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  }

  // While maintenance is ON and the full-screen lockout hasn't been passed,
  // render the branded CONTACT NOAH lockout (stripe pattern background and the
  // catch-the-dot game) with an email gate: only the configured Administrator
  // email proceeds to Google sign-in; anyone else is blocked here before ever
  // seeing Google's account chooser.
  if (maintenance.enabled && !lockedOut) {
    return (
      <LockoutScreen
        message={maintenance.message}
        submitting={submitting}
        redirecting={redirecting}
        error={adminError}
        onClearError={() => setAdminError("")}
        onAdminSignIn={async (email) => {
          setAdminError("");
          // Format check first.
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setAdminError("Please enter a valid email address (e.g. name@example.com).");
            return;
          }
          // Only a REAL configured Administrator email is accepted - not just any
          // well-formatted address. If it's not on the configured allow-list, it
          // is rejected here and never reaches Google.
          const isAdmin = await isConfiguredMaintenanceAdmin(email);
          if (!isAdmin) {
            setAdminError("This email is not an authorized administrator email. CONTACT NOAH to be authorised.");
            return;
          }
          await handleAdminGoogleSignIn(email);
        }}
      />
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

          <Button onClick={() => handleGoogleSignIn()} disabled={submitting || redirecting} className="w-full" size="lg">
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

/**
 * Full-screen lockout shown when maintenance is ON. Recreates the original
 * first-version look: stripe pattern background, lock icon, CONTACT NOAH,
 * and the Snake game. Signing in is gated behind an email field so
 * ONLY the configured Administrator email proceeds to Google — everyone else
 * is blocked here without ever seeing Google's account chooser.
 */
function LockoutScreen({
  message,
  submitting,
  redirecting,
  error,
  onClearError,
  onAdminSignIn,
}: {
  message: string;
  submitting: boolean;
  redirecting: boolean;
  error: string;
  onClearError: () => void;
  onAdminSignIn: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  // Only a properly formatted email is accepted, even for the Administrator
  // sign-in gate.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const trimmed = email.trim();
  const emailValid = EMAIL_RE.test(trimmed);

  function attemptSignIn() {
    if (!trimmed || !emailValid || submitting || redirecting) return;
    onAdminSignIn(trimmed);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{
        background:
          "repeating-linear-gradient(45deg, #111827 0 28px, #1f2937 28px 56px)",
      }}
    >
      <div className="w-full max-w-md bg-white rounded-lg shadow-2xl p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-red-600 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-9 h-9 text-white fill-current" aria-hidden>
            <path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4Zm0 2.18 7 3.11v5.7c0 4.5-2.92 8.67-7 10-4.08-1.33-7-5.5-7-10v-5.7l7-3.11ZM11 7v6h2V7h-2Zm0 8v2h2v-2h-2Z" />
          </svg>
        </div>
        <h2 className="text-2xl font-extrabold text-primary-900 tracking-tight mb-3">
          CONTACT NOAH
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line mb-4">
          {message.split("\n")[0]}
        </p>

        <div className="mt-2 mb-4 border-t border-slate-200 pt-4">
          <SnakeGame />
        </div>

        <div className="mt-6 border-t border-slate-200 pt-5 text-left">
          <label
            htmlFor="admin-email"
            className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 text-center"
          >
            Administrator sign-in
          </label>
          <input
            id="admin-email"
            type="email"
            autoComplete="email"
            placeholder="Enter your administrator email"
            value={email}
            disabled={submitting || redirecting}
            onChange={(e) => {
              setEmail(e.target.value);
              onClearError();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && emailValid && !submitting && !redirecting) {
                attemptSignIn();
              }
            }}
            className={
              "w-full rounded-sm border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 disabled:opacity-60 " +
              (trimmed && !emailValid
                ? "border-red-400 focus:ring-red-500"
                : "border-slate-300 focus:ring-primary-900")
            }
          />
          {trimmed && !emailValid && (
            <p className="mt-1.5 text-xs text-red-700">
              Please enter a valid email address (e.g. name@example.com).
            </p>
          )}
          <Button
            onClick={attemptSignIn}
            disabled={!emailValid || submitting || redirecting}
            className="w-full mt-3"
            size="lg"
          >
            {submitting || redirecting ? "Signing in…" : "Sign in with Google"}
          </Button>
          {error && (
            <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-sm px-3 py-2">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Self-contained classic Snake game for the maintenance lockout screen. No
 * external dependencies. Control with the arrow keys / WASD or the on-screen
 * d-pad. Eat the food to grow; game ends if you hit a wall or yourself.
 */
function SnakeGame() {
  const SIZE = 15; // 15 x 15 grid

  interface GameState {
    snake: [number, number][];
    food: [number, number];
    running: boolean;
    gameOver: boolean;
    won: boolean;
    score: number;
  }

  // Mutable game state lives in a ref so the interval can read/compute from the
  // latest snapshot without side effects inside state updaters (StrictMode-safe).
  const game = useRef<GameState>({
    snake: [
      [7, 7],
      [6, 7],
      [5, 7],
    ],
    food: [10, 7],
    running: false,
    gameOver: false,
    won: false,
    score: 0,
  });
  const dirRef = useRef<[number, number]>([1, 0]);
  const [, setTick] = useState(0);
  const [best, setBest] = useState(30);
  // Mirror of best used inside the game loop so the "highest score" target can
  // be read synchronously (the interval can't rely on async state updates).
  // The highest score to reach is 30 by default.
  const bestRef = useRef<number>(30);

  // Update the record and reflect it in both the state (for display) and the
  // ref (for the loop's win check).
  function updateBest(value: number) {
    bestRef.current = value;
    setBest(value);
    try { localStorage.setItem("sues_snake_best", String(value)); } catch { /* ignore */ }
  }

  // Speed levels -> tick interval in ms. Persisted so the user's preference
  // survives reloads. Changing speed mid-game restarts the loop immediately.
  const SPEEDS: Record<string, number> = {
    Slow: 260,
    Normal: 160,
    Fast: 90,
  };
  const SPEED_ORDER = ["Slow", "Normal", "Fast"];
  const [speed, setSpeed] = useState<string>(() => {
    try {
      const stored = localStorage.getItem("sues_snake_speed");
      if (stored && stored in SPEEDS) return stored;
    } catch { /* ignore */ }
    return "Normal";
  });

  const render = () => setTick((t) => t + 1);

  // Restrict turns so the snake can't reverse into itself.
  function tryTurn(next: [number, number]) {
    const [dx, dy] = dirRef.current;
    // ignore same direction and 180-degree reversals
    if ((next[0] === dx && next[1] === dy) || (next[0] === -dx && next[1] === -dy)) {
      return;
    }
    dirRef.current = next;
  }

  // Spawn food somewhere not occupied by the snake.
  function spawnFood(s: [number, number][]): [number, number] {
    const occupied = new Set(s.map((c) => c[0] + "," + c[1]));
    if (occupied.size >= SIZE * SIZE) return [-1, -1]; // board full -> win
    let cell: [number, number] = [-1, -1];
    let guard = 0;
    do {
      cell = [Math.floor(Math.random() * SIZE), Math.floor(Math.random() * SIZE)];
      guard++;
    } while (occupied.has(cell[0] + "," + cell[1]) && guard < 200);
    return cell;
  }

  // Keyboard controls.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!game.current.running) return;
      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          e.preventDefault();
          tryTurn([0, -1]);
          break;
        case "ArrowDown":
        case "s":
        case "S":
          e.preventDefault();
          tryTurn([0, 1]);
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          e.preventDefault();
          tryTurn([-1, 0]);
          break;
        case "ArrowRight":
        case "d":
        case "D":
          e.preventDefault();
          tryTurn([1, 0]);
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Game loop.
  useEffect(() => {
    if (!game.current.running) return;
    const id = window.setInterval(() => {
      const g = game.current;
      const [dx, dy] = dirRef.current;
      const head = g.snake[0];
      const nextHead: [number, number] = [head[0] + dx, head[1] + dy];

      // Wall collision -> game over (failure).
      if (nextHead[0] < 0 || nextHead[0] >= SIZE || nextHead[1] < 0 || nextHead[1] >= SIZE) {
        g.running = false;
        g.gameOver = true;
        g.won = false;
        render();
        return;
      }

      const willEat = nextHead[0] === g.food[0] && nextHead[1] === g.food[1];
      const body = willEat ? g.snake : g.snake.slice(0, -1);

      // Self collision -> game over (failure).
      if (body.some((c) => c[0] === nextHead[0] && c[1] === nextHead[1])) {
        g.running = false;
        g.gameOver = true;
        g.won = false;
        render();
        return;
      }

      const next = [nextHead, ...body];
      g.snake = next;
      if (willEat) {
        g.score += 1;

        // Reached the highest score -> congratulations, game over (win).
        if (g.score > 0 && g.score >= bestRef.current) {
          g.running = false;
          g.gameOver = true;
          g.won = true;
          updateBest(g.score);
          g.food = spawnFood(next);
          render();
          return;
        }

        g.food = spawnFood(next);
      }
      render();
    }, SPEEDS[speed]);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.current.running, speed]);

  // Load best score once.
  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem("sues_snake_best") || "0");
      // Keep the win target at least 30 regardless of any previously saved score.
      const target = Math.max(30, stored);
      bestRef.current = target;
      setBest(target);
    } catch { /* ignore */ }
  }, []);

  function start() {
    const g = game.current;
    g.snake = [
      [7, 7],
      [6, 7],
      [5, 7],
    ];
    dirRef.current = [1, 0];
    g.food = spawnFood([
      [7, 7],
      [6, 7],
      [5, 7],
    ]);
    g.score = 0;
    g.gameOver = false;
    g.won = false;
    g.running = true;
    render();
  }

  const { snake, food, running, gameOver, won, score } = game.current;
  const cellPx = 16;
  const boardPx = SIZE * cellPx;

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
        Pass the time — Snake
      </p>
      <div className="flex items-center justify-between w-full mb-2 text-xs text-slate-600">
        <span>
          Score: <span className="font-bold text-primary-900">{score}</span>
        </span>
        <span>
          Best: <span className="font-bold text-primary-900">{best}</span>
        </span>
      </div>
      {/* Speed control */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Speed
        </span>
        <div className="flex rounded-sm border border-slate-300 overflow-hidden" role="group" aria-label="Snake speed">
          {SPEED_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={speed === s}
              onClick={() => {
                setSpeed(s);
                try { localStorage.setItem("sues_snake_speed", s); } catch { /* ignore */ }
              }}
              className={
                "px-2.5 py-1 text-[11px] font-bold transition-colors " +
                (speed === s
                  ? "bg-primary-900 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100")
              }
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div
        className="relative bg-slate-100 rounded-sm border border-slate-200 overflow-hidden"
        style={{ width: boardPx, height: boardPx }}
        onKeyDown={(e) => {
          // allow arrow keys to work even when the board itself doesn't have focus
          if (running) {
            if (e.key === "ArrowUp") tryTurn([0, -1]);
            if (e.key === "ArrowDown") tryTurn([0, 1]);
            if (e.key === "ArrowLeft") tryTurn([-1, 0]);
            if (e.key === "ArrowRight") tryTurn([1, 0]);
          }
        }}
        tabIndex={0}
      >
        {/* Food */}
        <div
          className="absolute rounded-full"
          style={{
            width: cellPx - 2,
            height: cellPx - 2,
            left: food[0] * cellPx + 1,
            top: food[1] * cellPx + 1,
            background: "#dc2626",
            boxShadow: "0 0 6px #dc2626",
          }}
        />
        {/* Snake */}
        {snake.map(([x, y], i) => (
          <div
            key={`${x}-${y}-${i}`}
            className="absolute rounded-sm"
            style={{
              width: cellPx - 2,
              height: cellPx - 2,
              left: x * cellPx + 1,
              top: y * cellPx + 1,
              background: i === 0 ? "#0f172a" : "#C89B2C",
              borderRadius: i === 0 ? 4 : 2,
            }}
          />
        ))}
        {/* Overlay when idle / game over */}
        {(!running || gameOver) && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40">
            <div className="text-center px-4 py-3 bg-white rounded-sm shadow">
              {gameOver ? (
                won ? (
                  <>
                    <p className="text-sm font-bold text-emerald-700">
                      Congratulations!
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      You reached the highest score — {score}!
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-red-700">
                      You failed — Game over!
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      You hit {score}. Try again!
                    </p>
                  </>
                )
              ) : (
                <p className="text-sm font-bold text-primary-900">Ready?</p>
              )}
              <button
                type="button"
                onClick={start}
                className="mt-2 text-xs font-bold text-white bg-primary-900 rounded-sm px-4 py-1.5 hover:bg-primary-800"
              >
                {gameOver ? "Play again" : "Start"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* On-screen d-pad for touch */}
      <div className="mt-3 grid grid-cols-3 gap-1 select-none">
        <div />
        <button type="button" aria-label="Up" onClick={() => tryTurn([0, -1])} disabled={!running}
          className="w-9 h-9 rounded-sm bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold disabled:opacity-40">▲</button>
        <div />
        <button type="button" aria-label="Left" onClick={() => tryTurn([-1, 0])} disabled={!running}
          className="w-9 h-9 rounded-sm bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold disabled:opacity-40">◀</button>
        <button type="button" aria-label="Down" onClick={() => tryTurn([0, 1])} disabled={!running}
          className="w-9 h-9 rounded-sm bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold disabled:opacity-40">▼</button>
        <button type="button" aria-label="Right" onClick={() => tryTurn([1, 0])} disabled={!running}
          className="w-9 h-9 rounded-sm bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold disabled:opacity-40">▶</button>
      </div>
    </div>
  );
}

