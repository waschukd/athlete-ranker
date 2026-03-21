"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Zap, Eye, EyeOff, Check, AlertCircle, Loader } from "lucide-react";

function SignupForm() {
  const searchParams = useSearchParams();
  const prefillCode = searchParams.get("code") || "";

  const [form, setForm] = useState({ name: "", email: "", password: "", code: prefillCode });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/evaluator/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);

    if (data.success) {
      setResult(data);
    } else {
      setError(data.error || "Something went wrong");
    }
  };

  if (result) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">You're in the queue!</h1>
          <p className="text-gray-500 mb-6">{result.message}</p>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
            <p className="text-xs text-gray-400 mb-1">Your Evaluator ID</p>
            <p className="text-2xl font-mono font-bold text-[#FF6B35] tracking-widest">{result.evaluator_id}</p>
            <p className="text-xs text-gray-400 mt-1">Save this — it uniquely identifies you on the platform</p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-left">
            <p className="text-sm font-semibold text-blue-800 mb-1">What happens next?</p>
            <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
              <li>{result.org_name} will review your application</li>
              <li>You'll receive an email when approved</li>
              <li>Sign in and start picking up sessions</li>
            </ol>
          </div>

          <a href="/account/signin"
            className="block w-full py-3 bg-gradient-to-r from-[#FF6B35] to-[#F7931E] text-white rounded-xl font-semibold text-sm hover:shadow-lg transition-shadow">
            Sign In →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF6B35] to-[#F7931E] flex items-center justify-center shadow-md">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Athlete Ranker</h1>
            <p className="text-xs text-gray-400">Evaluator Sign Up</p>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-1">Create your account</h2>
        <p className="text-sm text-gray-400 mb-6">You'll need a join code from your organization to get started.</p>

        {error && (
          <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl mb-5">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Join Code — prominent at top */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Organization Join Code <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.code}
              onChange={e => set("code", e.target.value.toUpperCase())}
              placeholder="e.g. ABC-DEF"
              required
              maxLength={10}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-center text-xl font-mono font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-[#FF6B35] uppercase bg-gray-50"
            />
            <p className="text-xs text-gray-400 mt-1">Ask your service provider or association admin for this code</p>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={form.name}
                onChange={e => set("name", e.target.value)}
                placeholder="Dan Waschuk"
                required
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
              />
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email <span className="text-red-400">*</span></label>
              <input
                type="email"
                value={form.email}
                onChange={e => set("email", e.target.value)}
                placeholder="dan@email.com"
                required
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35]"
              />
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password <span className="text-red-400">*</span></label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={e => set("password", e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  minLength={8}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35] pr-10"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-[#FF6B35] to-[#F7931E] text-white rounded-xl font-semibold text-sm hover:shadow-lg transition-shadow disabled:opacity-60 flex items-center justify-center gap-2 mt-2">
            {loading ? <><Loader size={16} className="animate-spin" /> Creating account...</> : "Create Account"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-5">
          Already have an account?{" "}
          <a href="/account/signin" className="text-[#FF6B35] font-medium hover:underline">Sign in</a>
        </p>
      </div>
    </div>
  );
}

export default function EvaluatorSignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#FF6B35]" /></div>}>
      <SignupForm />
    </Suspense>
  );
}
