import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../excalidraw-app/sentry";

import ExcalidrawApp from "./App";

window.__EXCALIDRAW_SHA__ = import.meta.env.VITE_APP_GIT_SHA;
if (import.meta.env.VITE_APP_DESKTOP === "true") {
  // hook for desktop-only styling (native menu bar replaces canvas chrome)
  document.body.classList.add("tauri-desktop");
  // force desktop UI paradigm (never tablet/phone layouts) in the shell
  (window as any).__EXCALIDRAW_DESKTOP_SHELL__ = true;
}
const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);
// Service worker only makes sense in the browser build. In the Tauri
// desktop shell `virtual:pwa-register` is aliased to a no-op stub.
if (import.meta.env.VITE_APP_DESKTOP !== "true") {
  import("virtual:pwa-register").then(({ registerSW }) => registerSW());
}
root.render(
  <StrictMode>
    <ExcalidrawApp />
  </StrictMode>,
);
