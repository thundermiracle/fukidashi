import React from "react";
import ReactDOM from "react-dom/client";
import { t } from "@/services/i18n";
import App from "./App.tsx";
import "@/assets/theme.css";
import "./style.css";

const container = document.getElementById("root");
if (!container) throw new Error("Fukidashi: #root element not found");

// The page is written in whichever language the messages came in.
document.documentElement.lang = t("lang");

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
