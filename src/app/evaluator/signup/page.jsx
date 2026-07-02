"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, Check, AlertCircle, Loader } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";

function SignupForm() {
  const [theme, toggleTheme] = useTheme();
  const searchParams = useSearchParams();
  const prefillCode = searchParams.get("code") || "";

  const [form, setForm] = useState({ name: "", email: "", password: "", code: prefillCode });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [codeInfo, setCodeInfo] = useState(null);

  // Detect whether this is a tester or evaluator code so the wording matches.
  useEffect(() => {
    const c = form.code.trim();
    if (c.length < 4) { setCodeInfo(null); return; }
    let cancelled = false;
    fetch(`/api/evaluator/register?code=${encodeURIComponent(c)}`)
      .then(r => r.json()).then(d => { if (!cancelled) setCodeInfo(d?.valid ? d : null); }).catch(() => {});
    return () => { cancelled = true; };
  }, [form.code]);

  const isTester = !!(result?.is_tester ?? codeInfo?.is_tester);
  const Noun = isTester ? "Tester" : "Evaluator";
  const noun = isTester ? "tester" : "evaluator";

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
      <div data-theme={theme} className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="fixed top-4 right-4 z-50"><ThemeToggle theme={theme} onToggle={toggleTheme} /></div>
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm w-full max-w-md p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="font-display font-extrabold tracking-tight text-ink text-2xl mb-2">You're in the queue!</h1>
          <p className="text-gray-500 mb-6">{result.message}</p>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
            <p className="text-xs text-gray-400 mb-1">Your {Noun} ID</p>
            <p className="text-2xl font-mono font-bold text-accent tracking-widest">{result.evaluator_id}</p>
            <p className="text-xs text-gray-400 mt-1">Save this — it uniquely identifies you on the platform</p>
          </div>

          <div className="bg-accent-soft border border-accent/20 rounded-xl p-4 mb-6 text-left">
            <p className="text-sm font-semibold text-ink mb-1">What happens next?</p>
            <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
              <li>{result.org_name} will review your application</li>
              <li>You'll receive an email when approved</li>
              <li>Sign in and start picking up sessions</li>
            </ol>
          </div>

          <a href="/account/signin"
            className="block w-full py-3 bg-accent text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity">
            Sign In →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div data-theme={theme} className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="fixed top-4 right-4 z-50"><ThemeToggle theme={theme} onToggle={toggleTheme} /></div>
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm w-full max-w-md p-8">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <img src="/s-mark-dark.svg" style={{width:"40px",height:"40px",objectFit:"contain"}} alt="Sideline Star" />
          <div>
            <h1 className="font-display font-extrabold tracking-tight text-ink text-lg">Sideline Star</h1>
            <p className="text-xs text-gray-400">{Noun} Sign Up</p>
          </div>
        </div>

        <h2 className="font-display font-extrabold tracking-tight text-ink text-2xl mb-1">Create your account</h2>
        <p className="text-sm text-gray-500 mb-6">You'll need a join code from your organization to get started.</p>

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
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-center text-xl font-mono font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent uppercase bg-gray-50"
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
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
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
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
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
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent pr-10"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-3 bg-accent text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2 mt-2">
            {loading ? <><Loader size={16} className="animate-spin" /> Creating account...</> : "Create Account"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-5">
          Already have an account?{" "}
          <a href="/account/signin" className="text-accent font-medium hover:underline">Sign in</a>
        </p>
      </div>
    </div>
  );
}

export default function EvaluatorSignupPage() {
  return (
    <Suspense fallback={<div data-theme="premium" className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent" /></div>}>
      <SignupForm />
    </Suspense>
  );
}
