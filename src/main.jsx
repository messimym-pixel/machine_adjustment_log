import React from "react";
import { createRoot } from "react-dom/client";
// The whole application lives in this component file (kept at the project root).
import App from "../machine-adjustment-log.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
