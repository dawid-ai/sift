import "./styles/globals.css";
import React from "react";
import { createRoot } from "react-dom/client";
import { branding } from "@sift/core";
import { App } from "./App";

// Runtime source of truth for the window title; the static <title> in index.html
// is only the pre-JS loading fallback.
document.title = branding.appName;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
