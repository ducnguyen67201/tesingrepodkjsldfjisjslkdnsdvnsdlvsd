import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-ibm-plex)", "sans-serif"],
        display: ["var(--font-space-grotesk)", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      colors: {
        marketing: {
          bg: { 0: "#F8FAFC", 1: "#EFF2F6" },
          ink: { 0: "#0F172A", 1: "#475569", 2: "#64748B" },
          accent: {
            yellow: "#F6C453",
            "yellow-strong": "#D97706",
            "yellow-dim": "rgba(246, 196, 83, 0.15)",
          },
          glow: {
            ice: "rgba(56, 189, 248, 0.15)",
            yellow: "rgba(246, 196, 83, 0.35)",
          },
        },
      },
      animation: {
        float: "float 8s ease-in-out infinite",
        "pulse-glow": "pulse-glow 4s infinite",
        ticker: "ticker 60s linear infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" },
        },
        "pulse-glow": {
          "0%, 100%": {
            boxShadow: "0 0 20px -5px rgba(246, 196, 83, 0.35)",
            borderColor: "rgba(246, 196, 83, 0.5)",
          },
          "50%": {
            boxShadow: "0 0 35px -5px rgba(246, 196, 83, 0.35)",
            borderColor: "rgba(246, 196, 83, 0.8)",
          },
        },
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
    },
  },
  plugins: [animate],
};

export default config;
