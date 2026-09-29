import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuthContext } from "@/context/useAuthContext";
import { authApi } from "@/lib/api/auth";

// Minimal Google Identity Services typings — button flow only.
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }): void;
          renderButton(element: HTMLElement, options: Record<string, unknown>): void;
        };
      };
    };
  }
}

const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

function loadGisScript(): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${GIS_SCRIPT_SRC}"]`
  );
  if (existing) {
    return window.google
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
          existing.addEventListener("load", () => resolve());
          existing.addEventListener("error", () =>
            reject(new Error("Google script failed to load."))
          );
        });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google script failed to load."));
    document.head.appendChild(script);
  });
}

export default function LoginPage() {
  const { login, loginWithGoogle } = useAuthContext();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [googleError, setGoogleError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleRenderedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function renderGoogleButton() {
      try {
        const config = await authApi.googleConfig();
        const clientId = config.data?.google_client_id;
        if (!clientId || cancelled) return;

        await loadGisScript();
        if (cancelled || !window.google || !googleButtonRef.current) return;

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async ({ credential }) => {
            const result = await loginWithGoogle(credential);
            if (!result.success) {
              setGoogleError(result.error || "Google login failed.");
            }
          },
        });

        // StrictMode double-effect guard — renderButton appends, never replaces.
        if (googleRenderedRef.current) return;
        googleRenderedRef.current = true;
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: "filled_black",
          size: "large",
          shape: "pill",
          text: "signin_with",
          width: 320,
        });
      } catch {
        // Google login is optional — config failure just leaves the button hidden.
      }
    }

    renderGoogleButton();
    return () => {
      cancelled = true;
    };
  }, [loginWithGoogle]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const result = await login(password);

    if (!result.success) {
      setError(result.error || "Login failed.");
      setPassword("");
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative">
      {/* Background ambient glow */}
      <div
        className="fixed inset-0 pointer-events-none -z-10"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 0%, oklch(0.3 0.15 160 / 0.15), transparent), radial-gradient(ellipse 40% 50% at 80% 20%, oklch(0.25 0.15 290 / 0.1), transparent)",
        }}
      />

      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">🏋️</div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Frictionless Tracker
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-2">
            Sign in to continue
          </p>
        </div>

        {/* Login Card */}
        <form onSubmit={handleSubmit} className="glass-card p-8 space-y-6">
          {error && (
            <div className="px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm animate-fade-in">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-2"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
              required
              autoComplete="current-password"
              className="glass-input w-full px-4 py-3 rounded-xl text-white placeholder:text-[var(--muted-foreground)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--chart-1)]/50 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !password}
            className="w-full py-3 rounded-xl font-semibold text-white bg-[var(--chart-1)] hover:bg-[var(--chart-1)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98]"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Authenticating...
              </span>
            ) : (
              "Log In"
            )}
          </button>
        </form>

        {googleError && (
          <div className="mt-4 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm animate-fade-in">
            {googleError}
          </div>
        )}

        {/* GIS injects its iframe here; hidden entirely when Google is not configured */}
        <div
          ref={googleButtonRef}
          className="mt-6 flex justify-center [&:empty]:hidden"
        />

        <p className="text-center text-xs text-[var(--muted-foreground)]/60 mt-6">
          Personal workout tracker · Secured access
        </p>
      </div>
    </div>
  );
}
