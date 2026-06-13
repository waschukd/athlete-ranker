"use client";

import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";

// Client wrapper that applies the premium light/dark skin (data-theme) plus a
// floating theme toggle to otherwise-static / server-rendered pages (e.g. the
// legal pages). Children keep their own markup; this just supplies the theme
// context the scoped CSS in globals.css keys off of.
export default function ThemedShell({ children, className = "" }) {
  const [theme, toggleTheme] = useTheme();
  return (
    <div data-theme={theme} className={className}>
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>
      {children}
    </div>
  );
}
