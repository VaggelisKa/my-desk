import type { Config } from "tailwindcss";

const config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Archivo", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: { DEFAULT: "var(--ink)", muted: "var(--ink-muted)" },
        paper: { DEFAULT: "var(--paper)", muted: "var(--paper-muted)" },
        line: "var(--line)",
        field: "var(--field)",
        moss: {
          DEFAULT: "var(--moss)",
          edge: "var(--moss-edge)",
          soft: "var(--moss-soft)",
        },
        taken: "var(--taken)",
        mist: { DEFAULT: "var(--mist)", edge: "var(--mist-edge)" },
        dim: "var(--dim)",
        danger: "var(--danger)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  future: {
    hoverOnlyWhenSupported: true,
  },
} satisfies Config;

export default config;
