import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#080810",
        surface: "#0e0e1a",
        card: "#12121f",
        border: "#1e1e30",
        accent: "#ff3b3b",
        gold: "#f5c518",
        muted: "#4a4a6a",
        text: "#e8e8f0",
        sub: "#8888aa",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.6s ease forwards",
        "slide-up": "slideUp 0.5s ease forwards",
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
        "scan": "scan 3s linear infinite",
        "spin-slow": "spin 8s linear infinite",
      },
      keyframes: {
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp: { from: { opacity: "0", transform: "translateY(20px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        glowPulse: {
          "0%,100%": { boxShadow: "0 0 20px rgba(255,59,59,0.15)" },
          "50%": { boxShadow: "0 0 40px rgba(255,59,59,0.35), 0 0 80px rgba(255,59,59,0.1)" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
