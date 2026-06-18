"use client";

import { useState } from "react";
import { Mail, Lock, LogIn, AlertCircle } from "lucide-react";

const GOLD = "#d4af37";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid email or password");
        setLoading(false);
        return;
      }
      window.location.href = data.redirectTo || "/evaluator/dashboard";
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const inputWrap = { background: "#0e0e10", border: "1px solid rgba(255,255,255,0.12)" };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "radial-gradient(130% 130% at 80% 0%, #211f17 0%, #121214 42%, #0a0a0c 100%)" }}>
      <div className="w-full max-w-md rounded-2xl p-8" style={{ background: "#121214", border: "1px solid rgba(212,175,55,0.28)", boxShadow: "0 34px 80px -44px rgba(0,0,0,0.9)" }}>
        <div className="mb-7 text-center">
          <img src="/mark-gold.svg" alt="Sideline Star" style={{ width: 52, height: 52, objectFit: "contain", margin: "0 auto 16px" }} />
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: "#ffffff", fontFamily: "'Archivo',-apple-system,sans-serif" }}>Sign in</h1>
          <p className="text-sm mt-1" style={{ color: "#8b8f99" }}>Access your admin and evaluator tools</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg flex items-start gap-2" style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)" }}>
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#f87171" }} />
            <p className="text-sm" style={{ color: "#fca5a5" }}>{error}</p>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "#cfd2d7" }}>Email</label>
            <div className="flex items-center gap-2 rounded-lg px-3 py-2.5" style={inputWrap}>
              <Mail className="w-4 h-4 flex-shrink-0" style={{ color: "#6b7078" }} />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full outline-none text-sm bg-transparent" style={{ color: "#ffffff" }} placeholder="your@email.com" required disabled={loading} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium" style={{ color: "#cfd2d7" }}>Password</label>
              <a href="/account/forgot-password" className="text-xs hover:underline" style={{ color: GOLD }}>Forgot password?</a>
            </div>
            <div className="flex items-center gap-2 rounded-lg px-3 py-2.5" style={inputWrap}>
              <Lock className="w-4 h-4 flex-shrink-0" style={{ color: "#6b7078" }} />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full outline-none text-sm bg-transparent" style={{ color: "#ffffff" }} placeholder="••••••••" required disabled={loading} />
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 font-bold rounded-lg py-2.5 transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed" style={{ background: GOLD, color: "#141414" }}>
            <LogIn className="w-4 h-4" />
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <a href="/account/signup" className="text-sm hover:underline" style={{ color: GOLD }}>New association? Request an account →</a>
        </div>
      </div>
    </div>
  );
}
