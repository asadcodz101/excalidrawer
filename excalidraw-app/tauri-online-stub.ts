// Desktop (Tauri) stub for online-only dependencies.
//
// In desktop builds (`--mode desktop`) vite aliases
// `firebase/*`, `socket.io-client`, `@sentry/browser` and `callsites`
// to this file, so none of that code (or its transitive deps) ends up
// in the desktop bundle. None of these code paths ever execute in the
// offline desktop shell (collab/Plus/AI UI is gated behind
// `VITE_APP_DESKTOP`), so every export below is just a harmless no-op.
type AnyFn = (...args: any[]) => any;

const noop: AnyFn = () => undefined;
const asyncNoop: AnyFn = async () => undefined;

// --- firebase/app ---
export const initializeApp: AnyFn = () => ({});

// --- firebase/firestore ---
export const getFirestore: AnyFn = () => ({});
export const doc: AnyFn = () => ({});
export const getDoc: AnyFn = async () => ({ exists: () => false, data: () => undefined });
export const runTransaction: AnyFn = async () => undefined;
export const Bytes = {
  fromUint8Array: () => ({}),
};

// --- firebase/storage ---
export const getStorage: AnyFn = () => ({});
export const ref: AnyFn = () => ({});
export const uploadBytes: AnyFn = async () => ({});

// --- socket.io-client ---
// (only `import type` usages exist, so no runtime exports are needed)

// --- @sentry/browser ---
const noopScope = new Proxy({}, { get: () => noop });
export const withScope: AnyFn = (cb) => cb(noopScope);
export const captureException: AnyFn = () => "";
export const init: AnyFn = () => undefined;
export const getClient: AnyFn = () => undefined;
export const captureConsoleIntegration: AnyFn = () => ({});
export const featureFlagsIntegration: AnyFn = () => ({});

// --- callsites ---
const callsites: AnyFn = () => [];
export default callsites;

export { noop as __stubNoop, asyncNoop as __stubAsyncNoop };
