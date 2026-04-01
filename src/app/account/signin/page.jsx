"use client";

import { useState } from "react";
import { Mail, Lock, LogIn, AlertCircle } from "lucide-react";

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

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{background:"#080E1A"}}>
      <div className="w-full max-w-md rounded-xl p-8" style={{background:"#0F1A2E",border:"1px solid rgba(255,255,255,0.08)"}}>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-5 flex flex-col items-center gap-3">
            <img src="/s-mark-dark.svg" style={{width:"72px",height:"72px",objectFit:"contain"}} />
          </div>
          <h1 className="text-2xl font-semibold" style={{color:"#E8F0FF"}}>Sign in</h1>
          <p className="text-sm mt-1" style={{color:"#4D8FFF"}}>Access your admin and evaluator tools</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{color:"#A0B4D0"}}>Email</label>
            <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#1A6BFF] focus-within:border-transparent">
              <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full outline-none text-sm bg-transparent" style={{color:"#E8F0FF"}}
                placeholder="your@email.com"
                required
                disabled={loading}
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium" style={{color:"#A0B4D0"}}>Password</label>
              <a href="/account/forgot-password" className="text-xs hover:underline" style={{color:"#4D8FFF"}}>Forgot password?</a>
            </div>
            <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#1A6BFF] focus-within:border-transparent">
              <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full outline-none text-sm bg-transparent" style={{color:"#E8F0FF"}}
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-white disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors" style={{background:"#1A6BFF"}}
          >
            <LogIn className="w-4 h-4" />
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
