// No-op stub for `virtual:pwa-register`, used in Tauri desktop builds
// where the VitePWA plugin is disabled (see vite.config.mts).
// The app never runs this in the desktop shell (index.tsx gates it).
export const registerSW = () => {};
