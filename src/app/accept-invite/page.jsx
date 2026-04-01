"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Lock, CheckCircle, AlertCircle, Zap } from "lucide-react";

function AcceptInviteForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [invite, setInvite] = useState(null);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) { setError("No invite token found."); setLoading(false); return; }
    fetch(`/api/admin/accept-invite?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); }
        else { setInvite(data.invite); }
        setLoading(false);
      })
      .catch(() => { setError("Failed to load invite."); setLoading(false); });
  }, [token]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); setSubmitting(false); return; }
      setSuccess(true);
      setTimeout(() => { window.location.href = data.redirectTo; }, 1500);
    } catch { setError("Something went wrong."); setSubmitting(false); }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1A6BFF]" />
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/s-mark-dark.svg" style={{width:"48px",height:"48px",objectFit:"contain"}} />
        </div>
          <h1 className="text-2xl font-bold text-gray-900">Sideline Star</h1>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
          {error && !invite ? (
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Invalid Invite</h2>
              <p className="text-gray-500 text-sm">{error}</p>
            </div>
          ) : success ? (
            <div className="text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Account Created!</h2>
              <p className="text-gray-500 text-sm">Redirecting to your dashboard...</p>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-1">Accept your invitation</h2>
                <p className="text-gray-500 text-sm">
                  You've been invited to manage <strong>{invite?.org_name}</strong>.
                  Set a password to get started.
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
                  <input
                    type="email"
                    value={invite?.email || ""}
                    disabled
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#1A6BFF] focus-within:border-transparent">
                    <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full outline-none text-sm bg-transparent"
                      placeholder="Min 8 characters"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                  <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#1A6BFF] focus-within:border-transparent">
                    <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <input
                      type="password"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      className="w-full outline-none text-sm bg-transparent"
                      placeholder="Repeat password"
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-lg bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white font-semibold disabled:opacity-50 transition-opacity"
                >
                  {submitting ? "Setting up your account..." : "Create Account & Sign In"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1A6BFF]" /></div>}>
      <AcceptInviteForm />
    </Suspense>
  );
}
