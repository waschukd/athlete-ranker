"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ArrowLeft, Plus, Zap } from "lucide-react";

const qc = new QueryClient();

function AddCategoryForm() {
  const searchParams = useSearchParams();
  const orgId = searchParams.get("org");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/organizations/${orgId}/age-categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create");
        setLoading(false);
        return;
      }
      window.location.href = `/association/dashboard/category/${data.category.id}/setup?cat=${data.category.id}&org=${orgId}`;
    } catch {
      setError("Something went wrong.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <a
          href={`/association/dashboard?org=${orgId}`}
          className="inline-flex items-center gap-1.5 text-gray-500 hover:text-[#FF6B35] mb-8 text-sm font-medium transition-colors"
        >
          <ArrowLeft size={15} /> Back to Dashboard
        </a>

        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF6B35] to-[#F7931E] flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Add Age Category</h1>
              <p className="text-sm text-gray-500">Create a new age group for this association</p>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Category Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. U11 AAA, U15 AA"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B35] focus:border-transparent"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <a
                href={`/association/dashboard?org=${orgId}`}
                className="flex-1 flex items-center justify-center px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
              >
                Cancel
              </a>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#FF6B35] to-[#F7931E] text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:shadow-lg transition-shadow"
              >
                <Plus size={15} />
                {loading ? "Creating..." : "Create Category"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function AddCategoryPage() {
  return (
    <QueryClientProvider client={qc}>
      <Suspense
        fallback={
          <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF6B35]" />
          </div>
        }
      >
        <AddCategoryForm />
      </Suspense>
    </QueryClientProvider>
  );
}
