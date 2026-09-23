"use client";

import { useState } from "react";

// Invoice download for evaluators/testers: fetches a PDF of their approved
// unpaid hours for this org, which THEY then email to their provider — the
// platform never sends it on their behalf (contractor-issued invoices are
// the paper trail the CRA expects). Rendered on both the evaluator and
// tester dashboards' pay cards.
export default function EmailInvoiceButton({ orgId, orgName }) {
  const [state, setState] = useState({ status: "idle" });
  const download = async () => {
    setState({ status: "working" });
    try {
      const res = await fetch(`/api/evaluator/invoice?org=${orgId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setState({ status: "error", message: data.error || "Download failed" });
        return;
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") || "")?.[1] || "invoice.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
      setState({ status: "done" });
    } catch {
      setState({ status: "error", message: "Download failed — try again." });
    }
  };

  return (
    <div className="mt-3">
      <button
        onClick={download}
        disabled={state.status === "working"}
        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 disabled:opacity-50"
      >
        {state.status === "working" ? "Preparing…" : "Download invoice (PDF)"}
      </button>
      <p className="mt-1.5 text-[11px] text-gray-400">
        {state.status === "done"
          ? `Downloaded — now email it to ${orgName} to get paid.`
          : "Covers your approved unpaid hours. Email it to your provider to get paid."}
      </p>
      {state.status === "error" && <p className="mt-1 text-xs text-red-600">{state.message}</p>}
    </div>
  );
}
