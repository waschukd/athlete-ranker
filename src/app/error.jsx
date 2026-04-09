"use client";

import { useEffect } from "react";

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl">⚠️</span>
        </div>
        <h2 className="text-xl font-bold text-white mb-3">Something went wrong</h2>
        <p className="text-gray-400 text-sm mb-8 leading-relaxed">
          An unexpected error occurred. Your data has been saved locally and will sync when the issue is resolved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="px-6 py-3 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-xl font-semibold text-sm hover:shadow-lg transition-shadow"
          >
            Try Again
          </button>
          <button
            onClick={() => window.location.href = "/"}
            className="px-6 py-3 border border-gray-700 text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    </div>
  );
}
