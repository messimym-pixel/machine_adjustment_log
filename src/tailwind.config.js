/** @type {import('tailwindcss').Config} */
export default {
  // machine-adjustment-log.jsx lives one level above this config, so it must be scanned too.
  content: ["./index.html", "./main.jsx", "../machine-adjustment-log.jsx"],
  theme: {
    extend: {},
  },
  plugins: [],
};
