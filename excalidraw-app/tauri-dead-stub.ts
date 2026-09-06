// Desktop (Tauri) stub for online-only app modules.
//
// In desktop builds (`--mode desktop`) vite aliases the specifiers below
// to this file, so collab/share/Plus/AI/firebase app code — and everything
// THEY pull in (Portal, socket.io, firebase SDK) — never enters the
// desktop bundle. None of it executes in the offline desktop shell;
// all atoms keep their production default values.
import type { FC } from "react";

import { atom } from "./app-jotai";

const NullComponent: FC<any> = () => null;

// --- ./share/ShareDialog ---
export const shareDialogStateAtom = atom<{ isOpen: false } | { isOpen: true; type: string }>({
  isOpen: false,
});
export const ShareDialog: FC<any> = NullComponent;

// --- ./components/ExportToExcalidrawPlus ---
export const exportToExcalidrawPlus = async () => {};
export const ExportToExcalidrawPlus: FC<any> = NullComponent;

// --- ./ExcalidrawPlusIframeExport ---
export const ExcalidrawPlusIframeExport: FC<any> = NullComponent;

// --- ./components/AI ---
export const AIComponents: FC<any> = NullComponent;

// --- ./data/firebase and ./firebase (only used by online flows) ---
export const loadFilesFromFirebase = async (_prefix: string, _key: string, _fileIds: string[]) => ({
  loadedFiles: [],
  erroredFiles: new Map(),
});

export const saveFilesToFirebase = async (_opts: {
  prefix: string;
  files: Record<string, unknown>;
}) => {};
