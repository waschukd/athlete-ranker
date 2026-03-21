"use client";
import { useState } from "react";
import { Mail, ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setDone(true);
    } else {
      setError(data.error || "Something went wrong");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="w-full max-w-md">
        <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
          <div className="mb-6 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-[#FF6B35] flex items-center justify-center mb-3">
              <Mail className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900">Forgot password?</h1>
            <p className="text-sm text-gray-500 mt-1">Enter your email and we'll send a reset link</p>
          </div>

          {done ? (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-gray-700 font-medium">Check your inbox</p>
              <p className="text-sm text-gray-500">If an account exists for <strong>{email}</strong>, you'll receive a reset link shortly. Check your spam folder too.</p>
              <a href="/account/signin" className="inline-flex items-center gap-2 text-sm text-[#FF6B35] hover:underline mt-2">
                <ArrowLeft size={14} /> Back to sign in
              </a>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#FF6B35] focus-within:border-transparent">
                  <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    className="w-full outline-none text-gray-900 placeholder-gray-400 text-sm bg-transparent"
                    placeholder="your@email.com" required disabled={loading}
                  />
                </div>
              </div>
              <button type="submit" disabled={loading || !email}
                className="w-full py-3 bg-[#FF6B35] hover:bg-[#E55A2E] text-white rounded-lg font-medium text-sm disabled:opacity-50 transition-colors">
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
              <div className="text-center">
                <a href="/account/signin" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
                  <ArrowLeft size={13} /> Back to sign in
                </a>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
