"use client";

import "./globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";

export default function RootLayout({ children }) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('[SW] registered', reg.scope))
        .catch(err => console.warn('[SW] registration failed', err));
    }
  }, []);

  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30000, retry: 1 } }
  }));

  return (
    <html lang="en">
      <head>
        <title>Sideline Star</title>
        <meta name="description" content="Athlete evaluation and ranking platform" />
        <link rel="icon" href="/icon-light.png" />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </body>
    </html>
  );
}
