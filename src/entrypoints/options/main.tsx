import React from "react";
import ReactDOM from "react-dom/client";
import { t } from "@/services/i18n";
import App from "./App.tsx";
import "@/assets/theme.css";
import "./style.css";

const container = document.getElementById("root");
if (!container) throw new Error("Fukidashi: #root element not found");

// The page is written in whichever language the messages came in, and its
// tab is named in it too: the <title> in the HTML can only be one language.
document.documentElement.lang = t("lang");
document.title = t("settingsTitle");

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
