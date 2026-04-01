"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";

function ResetPasswordInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setDone(true);
    } else {
      setError(data.error || "Something went wrong");
    }
  };

  if (!token) return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="text-center">
        <p className="text-gray-600">Invalid reset link.</p>
        <a href="/account/forgot-password" className="text-[#1A6BFF] text-sm hover:underline mt-2 inline-block">Request a new one →</a>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="w-full max-w-md">
        <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
          <div className="mb-6 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-[#1A6BFF] flex items-center justify-center mb-3">
              <Lock className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900">Set new password</h1>
            <p className="text-sm text-gray-500 mt-1">Choose a strong password</p>
          </div>

          {done ? (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-gray-700 font-medium">Password updated!</p>
              <a href="/account/signin"
                className="inline-block w-full py-3 bg-[#1A6BFF] text-white rounded-lg font-medium text-sm text-center hover:bg-[#0F4FCC] transition-colors">
                Sign In →
              </a>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
                <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#1A6BFF] focus-within:border-transparent">
                  <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full outline-none text-gray-900 placeholder-gray-400 text-sm bg-transparent"
                    placeholder="Min 8 characters" required minLength={8} disabled={loading} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
                <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#1A6BFF] focus-within:border-transparent">
                  <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                    className="w-full outline-none text-gray-900 placeholder-gray-400 text-sm bg-transparent"
                    placeholder="Repeat password" required disabled={loading} />
                </div>
              </div>
              <button type="submit" disabled={loading || !password || !confirm}
                className="w-full py-3 bg-[#1A6BFF] hover:bg-[#0F4FCC] text-white rounded-lg font-medium text-sm disabled:opacity-50 transition-colors">
                {loading ? "Updating..." : "Update Password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50" />}>
      <ResetPasswordInner />
    </Suspense>
  );
}
