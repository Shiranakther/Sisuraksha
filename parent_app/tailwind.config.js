
/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")], //  THIS WAS MISSING
  theme: {
    extend: {
      colors: {
        primary: '#007AFF',
        secondary: '#5856D6',
        success: '#4CAF50',
        warning: '#FF9800',
        danger: '#F44336',
      }
    },
  },
  plugins: [],
}