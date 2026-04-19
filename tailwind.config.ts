import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "#0055FF",
          foreground: "#FFFFFF",
          50: "#E6F0FF",
          100: "#CCE0FF",
          200: "#99C2FF",
          300: "#66A3FF",
          400: "#3385FF",
          500: "#0055FF",
          600: "#0044CC",
          700: "#003399",
          800: "#002266",
          900: "#001133",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Refined neutral palette inspired by Linear / Vercel.
        // Slight cool undertone, deeper darks for proper surface elevation.
        gray: {
          50: "#F7F8FA",
          100: "#EEF0F3",
          200: "#DEE2E7",
          300: "#C2C8D1",
          400: "#8A929E",
          500: "#5F6773",
          600: "#454B55",
          700: "#2A2E36",
          800: "#1A1D23",
          900: "#0F1115",
          950: "#080A0D",
        },
        volina: {
          blue: "#0055FF",
          white: "#FFFFFF",
          gray: {
            50: "#F7F8FA",
            100: "#EEF0F3",
            200: "#DEE2E7",
            300: "#C2C8D1",
            400: "#8A929E",
            500: "#5F6773",
            600: "#454B55",
            700: "#2A2E36",
            800: "#1A1D23",
            900: "#0F1115",
          },
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-left": {
          from: { opacity: "0", transform: "translateX(-20px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(0, 85, 255, 0.3)" },
          "50%": { boxShadow: "0 0 40px rgba(0, 85, 255, 0.6)" },
        },
        spotlight: {
          "0%": { opacity: "0", transform: "translate(-72%, -62%) scale(0.5)" },
          "100%": { opacity: "1", transform: "translate(-50%, -40%) scale(1)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.5s ease-out forwards",
        "slide-in-left": "slide-in-left 0.3s ease-out forwards",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        spotlight: "spotlight 2s ease 0.75s 1 forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;

