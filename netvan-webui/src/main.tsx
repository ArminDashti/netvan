import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { applyTheme } from "./lib/theme";
import "flag-icons/css/flag-icons.min.css";
import "./index.css";

registerSW({ immediate: true });

applyTheme("midnight");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
