import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary action. CTAs, accept, submit — never decorative.
        copper: {
          50: "#FFF7ED",
          100: "#FFEDD5",
          200: "#FED7AA",
          300: "#FDBA74",
          400: "#FB923C",
          500: "#F97316",
          600: "#EA580C",
          700: "#C2410C",
          800: "#9A3412",
          900: "#7C2D12",
          DEFAULT: "#C2410C",
        },
        // Trust, verification, brand marks.
        brand: {
          50: "#ECFDF5",
          100: "#D1FAE5",
          200: "#A7F3D0",
          300: "#6EE7B7",
          400: "#34D399",
          500: "#10B981",
          600: "#059669",
          700: "#047857",
          800: "#065F46",
          900: "#064E3B",
          DEFAULT: "#0F6E56",
        },
        // Text, borders, chrome. Warm gray, so it sits with the paper surface.
        ink: {
          50: "#FAFAF9",
          100: "#F5F5F4",
          200: "#E7E5E4",
          300: "#D6D3D1",
          400: "#A8A29E",
          500: "#78716C",
          600: "#57534E",
          700: "#44403C",
          800: "#292524",
          900: "#1C1917",
          950: "#0C0A09",
          DEFAULT: "#1C1917",
        },
        surface: {
          page: "#F4F2ED",
          card: "#FFFFFF",
          sunken: "#EDEAE3",
        },
        success: {
          subtle: "#ECFDF5",
          border: "#A7F3D0",
          DEFAULT: "#0F6E56",
          strong: "#065F46",
        },
        warning: {
          subtle: "#FFFBEB",
          border: "#FDE68A",
          DEFAULT: "#D97706",
          strong: "#B45309",
        },
        danger: {
          subtle: "#FEF2F2",
          border: "#FECACA",
          DEFAULT: "#DC2626",
          strong: "#B91C1C",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
      },
      borderRadius: {
        control: "8px",
        card: "12px",
      },
      boxShadow: {
        // Restrained elevation: a hairline plus a short shadow, never a glow.
        card: "0 1px 2px 0 rgb(28 25 23 / 0.04)",
        raised: "0 2px 4px -1px rgb(28 25 23 / 0.08)",
        overlay: "0 16px 40px -12px rgb(28 25 23 / 0.24)",
      },
      keyframes: {
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
