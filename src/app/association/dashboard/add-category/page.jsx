"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ArrowLeft, Plus, Zap } from "lucide-react";
import { OrgBrandIcon } from "@/components/OrgBrandIcon";

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
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="min-w-0">
            <a
              href={`/association/dashboard?org=${orgId}`}
              className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.2em] uppercase text-accent hover:opacity-70 transition-opacity mb-2"
            >
              <ArrowLeft size={13} /> Back to dashboard
            </a>
            <div className="flex items-end gap-4 flex-wrap">
              <h1 className="font-display font-black tracking-tight text-ink text-4xl sm:text-5xl leading-none">Add Age Category</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">

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
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0b5cd6] focus:border-transparent"
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
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#0b5cd6] to-[#3b82f6] text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:shadow-lg transition-shadow"
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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0b5cd6]" />
          </div>
        }
      >
        <AddCategoryForm />
      </Suspense>
    </QueryClientProvider>
  );
}
