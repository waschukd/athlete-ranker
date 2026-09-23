"use client";

import { useState } from "react";

// One-click "invoice my provider" for evaluators/testers: POSTs to
// /api/evaluator/invoice, which itemizes their approved unpaid hours for this
// org and emails it to the provider's admins (copy to the sender). Rendered on
// both the evaluator and tester dashboards' pay cards.
export default function EmailInvoiceButton({ orgId, orgName }) {
  const [state, setState] = useState({ status: "idle" });
  const send = async () => {
    setState({ status: "sending" });
    try {
      const res = await fetch("/api/evaluator/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId }),
      });
      const data = await res.json();
      if (!res.ok) setState({ status: "error", message: data.error || "Send failed" });
      else setState({ status: "sent", message: `Invoice ${data.invoice} ($${Number(data.total).toFixed(2)}) emailed to ${orgName}. A copy is in your inbox.` });
    } catch {
      setState({ status: "error", message: "Send failed — try again." });
    }
  };

  if (state.status === "sent") return <p className="mt-3 text-xs text-green-700 font-medium">{state.message}</p>;
  return (
    <div className="mt-3">
      <button
        onClick={send}
        disabled={state.status === "sending"}
        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 disabled:opacity-50"
      >
        {state.status === "sending" ? "Sending…" : "Email invoice to provider"}
      </button>
      {state.status === "error" && <p className="mt-2 text-xs text-red-600">{state.message}</p>}
    </div>
  );
}
