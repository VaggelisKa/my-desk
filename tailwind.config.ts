import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

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
        moss: {
          DEFAULT: "var(--moss)",
          edge: "var(--moss-edge)",
          soft: "var(--moss-soft)",
        },
        taken: "var(--taken)",
        mist: { DEFAULT: "var(--mist)", edge: "var(--mist-edge)" },
        dim: "var(--dim)",
        danger: "var(--danger)",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [animate],
  future: {
    hoverOnlyWhenSupported: true,
  },
} satisfies Config;

export default config;
