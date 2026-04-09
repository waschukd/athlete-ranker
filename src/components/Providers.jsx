"use client";

import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export default function Providers({ children }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js")
        .then(reg => console.log("[SW] registered", reg.scope))
        .catch(err => console.warn("[SW] registration failed", err));
    }
  }, []);

  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30000, retry: 1 } },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
