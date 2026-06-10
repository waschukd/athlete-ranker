"use client";
import { Sun, Moon } from "lucide-react";

// Shared light/dark switch. `theme` + `onToggle` come from useTheme() in the
// parent page so state stays single-source and persists across screens.
export default function ThemeToggle({ theme, onToggle, className = "" }) {
  const dark = theme === "premium";
  return (
    <button
      type="button"
      onClick={onToggle}
      title={dark ? "Switch to light" : "Switch to dark"}
      aria-label="Toggle light or dark theme"
      className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors ${className}`}
    >
      {dark ? <Sun size={15} /> : <Moon size={15} />}
      <span className="hidden sm:inline">{dark ? "Light" : "Dark"}</span>
    </button>
  );
}
