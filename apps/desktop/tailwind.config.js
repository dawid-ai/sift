/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/renderer/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      fontFamily: {
        // No webfont is bundled (offline-first app), so these are preference stacks:
        // Inter / JetBrains Mono when installed, platform UI font otherwise.
        sans: ["Inter", "Segoe UI Variable Text", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SF Mono", "Cascadia Mono", "Consolas", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        "border-strong": "hsl(var(--border-strong))",
        ai: "hsl(var(--ai))",
        background: "hsl(var(--background))",
        surface: "hsl(var(--surface))",
        "surface-2": "hsl(var(--surface-2))",
        foreground: "hsl(var(--foreground))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        ring: "hsl(var(--ring))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        danger: "hsl(var(--danger))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px hsl(var(--ring) / 0.4), 0 0 16px -2px hsl(var(--ring) / 0.35)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
