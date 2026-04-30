/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Dark dashboard theme (rebrand pilot — currently used by
        // the association dashboard only; everything else still uses
        // the legacy light palette).
        app: "#161A2B",          // global background
        card: "#1E243A",         // cards / containers / surfaces
        "card-hover": "#262C45", // subtle elevation on hover
        "card-border": "#2A3149",
        brand: "#5A99F5",        // primary brand accent (replaces #1A6BFF)
        "brand-strong": "#3F7AD5",
        accent: "#00F0FF",       // high-energy data points (use sparingly)
      },
    },
  },
  plugins: [],
}
