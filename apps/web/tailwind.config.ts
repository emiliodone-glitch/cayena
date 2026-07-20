import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        institucional: {
          50: "#eefbf1",
          100: "#d6f5dd",
          400: "#4cae5c",
          600: "#1f7a34",
          700: "#1a6129",
          800: "#164f22",
          900: "#123f1c",
        },
      },
    },
  },
  plugins: [],
};

export default config;
