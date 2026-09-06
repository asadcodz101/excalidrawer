import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../excalidraw-app/sentry";

import ExcalidrawApp from "./App";

window.__EXCALIDRAW_SHA__ = import.meta.env.VITE_APP_GIT_SHA;
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
