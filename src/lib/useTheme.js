"use client";
import { useState, useEffect } from "react";

// App-wide premium skin preference, shared across every themed screen via a
// single localStorage key. "premium" = dark/gold, "premium-light" = light/gold.
// Each page reads this and sets data-theme={theme} on its root; the scoped
// layer in globals.css does the rest. The landing page is intentionally NOT
// wired to this — it stays dark always.
export function useTheme(defaultTheme = "premium") {
  const [theme, setTheme] = useState(defaultTheme);
  useEffect(() => {
    try {
      const t = localStorage.getItem("ss_theme");
      if (t === "premium" || t === "premium-light") setTheme(t);
      else if (t === "light") setTheme("premium-light"); // migrate older value
    } catch {}
  }, []);
  const toggle = () => setTheme(prev => {
    const next = prev === "premium" ? "premium-light" : "premium";
    try { localStorage.setItem("ss_theme", next); } catch {}
    return next;
  });
  return [theme, toggle];
}
