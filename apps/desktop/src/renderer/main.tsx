// Bundled variable fonts. Sift is offline-first, so the faces ship inside the app bundle
// (@fontsource emits local .woff2 assets that Vite fingerprints and copies into
// out/renderer/assets) instead of being fetched, and instead of the old approach of hoping
// Inter happened to be installed and silently falling back to Segoe UI.
// Imported before globals.css so the @font-face rules land ahead of the Tailwind layers.
import "@fontsource-variable/inter/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
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
