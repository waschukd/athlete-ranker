"use client";

import { useEffect } from "react";

export default function ScoringError({ error, reset }) {
  useEffect(() => {
    console.error("Scoring error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl">🏒</span>
        </div>
        <h2 className="text-xl font-bold text-white mb-3">Scoring interrupted</h2>
        <p className="text-gray-400 text-sm mb-4 leading-relaxed">
          Don&apos;t worry — your scores are saved locally on this device. They&apos;ll sync to the server when the connection is restored.
        </p>
        <p className="text-xs text-gray-600 mb-8 font-mono bg-gray-900 rounded-lg px-4 py-2 inline-block">
          {error?.message || "Unknown error"}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="px-6 py-3 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-xl font-semibold text-sm"
          >
            Resume Scoring
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 border border-gray-700 text-gray-300 rounded-xl font-semibold text-sm"
          >
            Reload Page
          </button>
        </div>
      </div>
    </div>
  );
}
