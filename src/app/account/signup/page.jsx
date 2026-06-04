"use client";

import { useState } from "react";
import { Building2, Mail, Phone, User, MessageSquare, Send, AlertCircle, CheckCircle } from "lucide-react";

export default function SignUpPage() {
  const [associationName, setAssociationName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/signup-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          association_name: associationName,
          contact_name: contactName,
          email,
          phone,
          message,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) {
          setError("Too many requests. Please wait a little while and try again.");
        } else if (res.status === 400) {
          setError(data.error || "Please check your details and try again.");
        } else {
          setError(data.error || "Something went wrong. Please try again.");
        }
        setLoading(false);
        return;
      }
      setSubmitted(true);
      setLoading(false);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 w-full max-w-md">
        <div className="mb-6 text-center">
          <img
            src="/s-mark-dark.svg"
            style={{ width: 48, height: 48, objectFit: "contain" }}
            alt="Sideline Star"
            className="mx-auto mb-4"
          />
          <h1 className="font-display font-extrabold tracking-tight text-ink text-2xl text-center">
            Request an account
          </h1>
          <p className="text-sm text-gray-500 text-center mt-1">
            For associations new to Sideline Star
          </p>
        </div>

        {submitted ? (
          <div className="space-y-5">
            <div className="p-4 bg-accent-soft border border-accent/20 rounded-lg flex items-start gap-3">
              <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-accent" />
              <p className="text-sm text-ink">
                Request received — we&apos;ll review it and email you when your account is ready.
              </p>
            </div>
            <a
              href="/account/signin"
              className="block w-full text-center bg-accent text-white font-semibold rounded-lg py-2.5 hover:opacity-90 transition-opacity"
            >
              Back to sign in
            </a>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Association name</label>
                <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-accent/40 focus-within:border-accent">
                  <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={associationName}
                    onChange={(e) => setAssociationName(e.target.value)}
                    className="w-full outline-none text-sm bg-transparent text-ink"
                    placeholder="Your association"
                    required
                    disabled={loading}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
                <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-accent/40 focus-within:border-accent">
                  <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full outline-none text-sm bg-transparent text-ink"
                    placeholder="Jane Doe"
                    disabled={loading}
                  />
                </div>
              </div>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone <span className="text-gray-400">(optional)</span>
                </label>
                <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-accent/40 focus-within:border-accent">
                  <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full outline-none text-sm bg-transparent text-ink"
                    placeholder="(555) 555-5555"
                    disabled={loading}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Message <span className="text-gray-400">(optional)</span>
                </label>
                <div className="flex items-start gap-2 border border-gray-300 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-accent/40 focus-within:border-accent">
                  <MessageSquare className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    className="w-full outline-none text-sm bg-transparent resize-none text-ink"
                    placeholder="Tell us a bit about your association"
                    disabled={loading}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-accent text-white font-semibold rounded-lg py-2.5 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
                {loading ? "Sending…" : "Request account"}
              </button>
            </form>
          </>
        )}

        <div className="mt-6 text-center">
          <a href="/account/signin" className="text-sm text-accent hover:underline">
            ← Back to sign in
          </a>
        </div>
      </div>
    </div>
  );
}
