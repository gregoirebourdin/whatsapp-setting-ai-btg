"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Lock, Loader2, ShieldCheck, AlertCircle, Eye, EyeOff } from "lucide-react";

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remainingTime, setRemainingTime] = useState<number | null>(null);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch("/api/auth/verify");
        if (res.ok) {
          const data = await res.json();
          setAuthenticated(true);
          setRemainingTime(data.remainingMs);
        }
      } catch {
        // Not authenticated
      } finally {
        setChecking(false);
      }
    };
    checkSession();
  }, []);

  // Countdown timer for session expiry
  useEffect(() => {
    if (!authenticated || remainingTime === null) return;

    timerRef.current = setInterval(() => {
      setRemainingTime((prev) => {
        if (prev === null || prev <= 1000) {
          // Session expired
          setAuthenticated(false);
          setPassword("");
          setError(null);
          if (timerRef.current) clearInterval(timerRef.current);
          return null;
        }
        return prev - 1000;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [authenticated, remainingTime !== null]);

  // Focus input when modal is shown
  useEffect(() => {
    if (!checking && !authenticated && inputRef.current) {
      inputRef.current.focus();
    }
  }, [checking, authenticated]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!password.trim() || submitting) return;

      setSubmitting(true);
      setError(null);

      try {
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: password.trim() }),
        });

        const data = await res.json();

        if (res.ok && data.success) {
          setAuthenticated(true);
          setRemainingTime(data.expiresAt - Date.now());
          setPassword("");
        } else {
          setError(data.error || "Mot de passe incorrect");
          setShake(true);
          setTimeout(() => setShake(false), 600);
          setPassword("");
          inputRef.current?.focus();
        }
      } catch {
        setError("Erreur de connexion. Reessayez.");
      } finally {
        setSubmitting(false);
      }
    },
    [password, submitting]
  );

  const formatTime = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // Loading state
  if (checking) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Authenticated - show content with session timer
  if (authenticated) {
    return (
      <div className="relative">
        {/* Session timer badge */}
        {remainingTime !== null && (
          <div className="fixed bottom-4 right-4 z-40">
            <div
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur-sm transition-colors ${
                remainingTime < 5 * 60 * 1000
                  ? "border-red-500/30 bg-red-500/10 text-red-600"
                  : "border-border bg-card/80 text-muted-foreground"
              }`}
            >
              <ShieldCheck className="h-3 w-3" />
              <span>{formatTime(remainingTime)}</span>
            </div>
          </div>
        )}
        {children}
      </div>
    );
  }

  // Not authenticated - show password modal
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
        backgroundSize: "32px 32px",
      }} />

      <div className="relative w-full max-w-sm px-4">
        <Card className="border-border/50 shadow-2xl shadow-black/5">
          <CardContent className="p-8">
            {/* Lock icon */}
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
              <Lock className="h-6 w-6 text-foreground" />
            </div>

            {/* Title */}
            <div className="mb-8 text-center">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Acces protege
              </h2>
              <p className="mt-2 text-sm text-muted-foreground text-balance">
                Entrez le mot de passe pour acceder au dashboard.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <div className={`relative ${shake ? "animate-shake" : ""}`}>
                  <Input
                    ref={inputRef}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="Mot de passe"
                    className={`h-11 pr-10 text-center text-lg tracking-[0.3em] font-mono ${
                      error
                        ? "border-red-500 focus-visible:ring-red-500/20"
                        : ""
                    }`}
                    autoComplete="off"
                    autoFocus
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {/* Error message */}
                {error && (
                  <div className="flex items-center gap-1.5 text-sm text-red-600">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                className="h-11 w-full text-sm font-medium"
                disabled={submitting || !password.trim()}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Deverrouiller"
                )}
              </Button>
            </form>

            {/* Footer */}
            <p className="mt-6 text-center text-[11px] text-muted-foreground/60">
              Session valide 30 minutes
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
