"use client";

import { useEffect, useState } from "react";
import { Card, Button } from "@/shared/components";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/status", { cache: "no-store" });
        const data = await res.json();
        if (data.authenticated) {
          window.location.assign("/dashboard");
          return;
        }
        setConfigured(data.githubConfigured === true);
      } catch {
        setConfigured(false);
      }
    })();
  }, []);

  const login = () => {
    setLoading(true);
    setError("");
    window.location.href = "/api/auth/github/start";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4 relative overflow-hidden">
      <div className="landing-grid absolute inset-0 pointer-events-none" aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Multiver</h1>
          <p className="text-text-muted">Masuk hanya dengan akun GitHub yang telah diizinkan.</p>
        </div>
        <Card>
          <div className="flex flex-col gap-4">
            {configured === false && (
              <p className="text-sm text-red-500 text-center">
                GitHub OAuth belum dikonfigurasi di Vercel.
              </p>
            )}
            <Button
              type="button"
              variant="primary"
              className="w-full"
              onClick={login}
              loading={loading}
              disabled={configured === false}
            >
              Masuk dengan GitHub
            </Button>
            {error && <p className="text-xs text-red-500 text-center">{error}</p>}
            <p className="text-xs text-center text-text-muted">
              Tidak ada pendaftaran dan tidak ada login password.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
