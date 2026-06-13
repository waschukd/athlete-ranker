"use client";

import { useState } from "react";
import { Mail, Lock, LogIn, AlertCircle } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";

export default function SignInPage() {
  const [theme, toggleTheme] = useTheme();
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
    <div data-theme={theme} className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="fixed top-4 right-4 z-50"><ThemeToggle theme={theme} onToggle={toggleTheme} /></div>
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 w-full max-w-md">
        <div className="mb-6 text-center">
          <img
            src="/s-mark-dark.svg"
            style={{ width: 48, height: 48, objectFit: "contain" }}
            alt="Sideline Star"
            className="mx-auto mb-4"
          />
          <h1 className="font-display font-extrabold tracking-tight text-ink text-2xl text-center">
            Sign in
          </h1>
          <p className="text-sm text-gray-500 text-center mt-1">
            Access your admin and evaluator tools
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-accent/40 focus-within:border-accent">
              <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full outline-none text-sm bg-transparent text-ink"
                placeholder="your@email.com"
                required
                disabled={loading}
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <a href="/account/forgot-password" className="text-xs text-accent hover:underline">
                Forgot password?
              </a>
            </div>
            <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-accent/40 focus-within:border-accent">
              <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full outline-none text-sm bg-transparent text-ink"
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-accent text-white font-semibold rounded-lg py-2.5 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <LogIn className="w-4 h-4" />
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <a href="/account/signup" className="text-sm text-accent hover:underline">
            New association? Request an account →
          </a>
        </div>
      </div>
    </div>
  );
}
