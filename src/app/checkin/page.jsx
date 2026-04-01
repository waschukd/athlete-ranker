"use client";

import { useState } from "react";
import { Zap, ClipboardList, AlertCircle } from "lucide-react";

export default function CheckinEntryPage() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/checkin/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          volunteer_name: name.trim(),
          volunteer_email: email.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid code");
        setLoading(false);
        return;
      }

      // Store volunteer info in session storage for the checkin page
      sessionStorage.setItem("volunteer_name", name.trim());
      sessionStorage.setItem("volunteer_email", email.trim());
      sessionStorage.setItem("checkin_schedule_id", data.schedule_id);

      window.location.href = `/checkin/${data.schedule_id}`;
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/s-mark-dark.svg" style={{width:"56px",height:"56px",objectFit:"contain"}} />
          <h1 className="text-2xl font-bold text-gray-900 mt-4">Player Check-in</h1>
          <p className="text-gray-500 text-sm mt-1">Enter your session code to begin</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
          {error && (
            <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Session Code
              </label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. S1G2-XKJ"
                required
                autoFocus
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-center text-2xl font-mono font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-[#1A6BFF] focus:border-transparent uppercase"
                maxLength={10}
              />
              <p className="text-xs text-gray-400 mt-1.5 text-center">
                Get this code from your director or association
              </p>
            </div>

            <div className="pt-1 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-3 text-center">Your info is logged for check-in tracking</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="First and last name"
                    required
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Your Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6BFF]"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !code || !name || !email}
              className="w-full py-3 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-xl font-semibold text-base disabled:opacity-50 hover:shadow-lg transition-shadow"
            >
              {loading ? "Verifying..." : "Enter Check-in"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Sideline Star · Check-in Portal · No account required
        </p>
      </div>
    </div>
  );
}
