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
    <div className="min-h-screen flex items-center justify-center px-4" style={{background:"#080E1A"}}>
      <div className="w-full max-w-md rounded-xl p-8" style={{background:"#0F1A2E",border:"1px solid rgba(255,255,255,0.08)"}}>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-5 flex flex-col items-center gap-3">
            <img src="/s-mark-dark.svg" style={{width:"72px",height:"72px",objectFit:"contain"}} />
          </div>
          <h1 className="text-2xl font-semibold" style={{color:"#E8F0FF"}}>Request an account</h1>
          <p className="text-sm mt-1" style={{color:"#4D8FFF"}}>For associations new to Sideline Star</p>
        </div>

        {submitted ? (
          <div className="space-y-5">
            <div className="p-4 rounded-lg flex items-start gap-3" style={{background:"rgba(34,211,160,0.1)",border:"1px solid rgba(34,211,160,0.25)"}}>
              <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{color:"#22d3a0"}} />
              <p className="text-sm" style={{color:"#A0B4D0"}}>
                Request received — we&apos;ll review it and email you when your account is ready.
              </p>
            </div>
            <a
              href="/account/signin"
              className="block w-full text-center rounded-lg px-4 py-3 text-white font-medium transition-colors"
              style={{background:"#1A6BFF"}}
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
                <label className="block text-sm font-medium mb-1" style={{color:"#A0B4D0"}}>Association name</label>
                <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#1A6BFF] focus-within:border-transparent">
                  <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={associationName}
                    onChange={(e) => setAssociationName(e.target.value)}
                    className="w-full outline-none text-sm bg-transparent" style={{color:"#E8F0FF"}}
                    placeholder="Your association"
                    required
                    disabled={loading}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{color:"#A0B4D0"}}>Your name</label>
                <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#1A6BFF] focus-within:border-transparent">
                  <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full outline-none text-sm bg-transparent" style={{color:"#E8F0FF"}}
                    placeholder="Jane Doe"
                    disabled={loading}
                  />
                </div>
              </div>
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
                <label className="block text-sm font-medium mb-1" style={{color:"#A0B4D0"}}>Phone <span style={{color:"#4a4a6a"}}>(optional)</span></label>
                <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#1A6BFF] focus-within:border-transparent">
                  <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full outline-none text-sm bg-transparent" style={{color:"#E8F0FF"}}
                    placeholder="(555) 555-5555"
                    disabled={loading}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{color:"#A0B4D0"}}>Message <span style={{color:"#4a4a6a"}}>(optional)</span></label>
                <div className="flex items-start gap-2 border border-gray-300 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#1A6BFF] focus-within:border-transparent">
                  <MessageSquare className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    className="w-full outline-none text-sm bg-transparent resize-none" style={{color:"#E8F0FF"}}
                    placeholder="Tell us a bit about your association"
                    disabled={loading}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-white disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors" style={{background:"#1A6BFF"}}
              >
                <Send className="w-4 h-4" />
                {loading ? "Sending…" : "Request account"}
              </button>
            </form>
          </>
        )}

        <div className="mt-6 text-center">
          <a href="/account/signin" className="text-sm hover:underline" style={{color:"#4D8FFF"}}>
            ← Back to sign in
          </a>
        </div>
      </div>
    </div>
  );
}
