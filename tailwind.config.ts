import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Deep Space palette (DevVoice design system)
        background: "#0A0A0A",
        surface: "#0A0A0A",
        "surface-dim": "#0A0A0A",
        "surface-bright": "#3a3939",
        "surface-container-lowest": "#0e0e0e",
        "surface-container-low": "#1c1b1b",
        "surface-container": "#141414",
        "surface-container-high": "#2a2a2a",
        "surface-container-highest": "#353534",
        "on-surface": "#e5e2e1",
        "on-surface-variant": "#cbc3d7",
        "on-background": "#e5e2e1",
        outline: "#958ea0",
        "outline-variant": "#494454",
        primary: "#d0bcff",
        "primary-container": "#a078ff",
        "on-primary": "#3c0091",
        "on-primary-container": "#340080",
        secondary: "#adc6ff",
        "secondary-container": "#0566d9",
        "on-secondary": "#002e6a",
        tertiary: "#ffb869",
        "tertiary-container": "#ca801e",
        error: "#ffb4ab",
        "error-container": "#93000a",
        foreground: "#e5e2e1",
      },
      borderRadius: {
        sm: "0.25rem",
        DEFAULT: "0.5rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.5rem",
      },
      spacing: {
        xs: "4px",
        sm: "8px",
        md: "16px",
        lg: "24px",
        xl: "40px",
        gutter: "20px",
        margin: "32px",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "var(--font-geist-mono)", "monospace"],
      },
      fontSize: {
        "display-lg": ["48px", { lineHeight: "1.1", letterSpacing: "-0.04em", fontWeight: "600" }],
        "headline-md": ["24px", { lineHeight: "1.3", letterSpacing: "-0.02em", fontWeight: "500" }],
        "body-base": ["14px", { lineHeight: "1.6", letterSpacing: "0em", fontWeight: "400" }],
        "code-sm": ["12px", { lineHeight: "1.5", letterSpacing: "0em", fontWeight: "400" }],
        "label-caps": ["11px", { lineHeight: "1.0", letterSpacing: "0.05em", fontWeight: "600" }],
      },
    },
  },
  plugins: [],
};
export default config;
