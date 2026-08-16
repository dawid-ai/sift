/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/renderer/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      fontFamily: {
        // The variable faces are bundled with the app (main.tsx imports @fontsource-variable),
        // so "Inter Variable" / "JetBrains Mono Variable" always resolve offline. The rest of
        // each stack is a fallback for the (unexpected) case of a missing font asset.
        sans: [
          "Inter Variable",
          "Inter",
          "Segoe UI Variable Text",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono Variable",
          "JetBrains Mono",
          "ui-monospace",
          "SF Mono",
          "Cascadia Mono",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        border: "hsl(var(--border))",
        "border-strong": "hsl(var(--border-strong))",
        ai: "hsl(var(--ai))",
        background: "hsl(var(--background))",
        surface: "hsl(var(--surface))",
        "surface-2": "hsl(var(--surface-2))",
        // The 52px icon rail. Opaque and flat by design: the rail carries the active-nav
        // accent, and an accent sitting on a gradient that peaks right behind it fights its
        // own backdrop. See the surface ladder in globals.css.
        rail: "hsl(var(--rail))",
        foreground: "hsl(var(--foreground))",
        // The text ladder, four rungs, assigned strictly by role — see globals.css.
        // `muted-foreground` keeps its historical name (every route consumes it) and is the
        // body/caption rung; the three around it are the ones that were missing, which is
        // why seven near-identical greys had been hand-mixed at call sites instead.
        "fg-secondary": "hsl(var(--fg-secondary))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        "fg-subtle": "hsl(var(--fg-subtle))",
        // Genuinely dead controls only. A live "Last »" must never render in this.
        "fg-disabled": "hsl(var(--fg-disabled))",
        placeholder: "hsl(var(--placeholder))",
        // Same token as `primary.muted`, spelled the way the design notes refer to it.
        "accent-muted": "hsl(var(--accent-muted))",
        ring: "hsl(var(--ring))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        danger: "hsl(var(--danger))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          // The warm end of the CTA gradient — `from-primary to-primary-lit`.
          lit: "#FF8A4D",
          // Decorative accent: eyebrow icons, card glyphs, ornament. Clears the 3:1 floor
          // for non-text UI without competing with the CTA for attention. Saturated
          // `primary` is reserved for the primary action, the active nav item and the mark.
          muted: "hsl(var(--accent-muted))",
        },
      },
      boxShadow: {
        // Kept: pre-existing name, still used by inputs/toasts.
        glow: "0 0 0 1px hsl(var(--ring) / 0.4), 0 0 16px -2px hsl(var(--ring) / 0.35)",
        // Warm halo for primary CTAs on hover.
        ember: "0 0 22px -6px hsl(var(--primary) / 0.55)",
        // Rim-lit panel glow (matches .panel-lit) for one-off surfaces.
        lit: "0 0 40px -8px hsl(20 90% 54% / 0.13), 0 28px 66px -34px hsl(0 0% 0% / 0.92)",
        // Floating chrome: popovers, dropdowns, dialogs.
        pop: "0 18px 44px -18px hsl(0 0% 0% / 0.85), 0 2px 8px -2px hsl(0 0% 0% / 0.6)",
        // The 1px top highlight that keeps a translucent pill/control from reading flat.
        // Same trick as .panel-lit's rim, scaled to chip size.
        bevel: "inset 0 1px 0 0 hsl(0 0% 100% / 0.07)",
      },
      // Tailwind ships 0–100 in fives. These are the two off-grid steps the tinted-pill
      // recipe leans on: /12 for the older fills, /14 for the current one.
      opacity: {
        12: "0.12",
        14: "0.14",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
