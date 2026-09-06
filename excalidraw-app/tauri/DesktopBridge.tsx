import { useEffect } from "react";
import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { loadFromBlob } from "@excalidraw/excalidraw/data/blob";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import { MIME_TYPES } from "@excalidraw/common";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const FILE_FILTERS = [
  { name: "Excalidraw", extensions: ["excalidraw"] },
];

export const saveSceneToFile = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
) => {
  const filePath = await save({
    defaultPath: `${excalidrawAPI.getName() || "drawing"}.excalidraw`,
    filters: FILE_FILTERS,
  });
  if (!filePath) {
    return;
  }
  const json = serializeAsJSON(
    excalidrawAPI.getSceneElements(),
    excalidrawAPI.getAppState(),
    excalidrawAPI.getFiles(),
    "local",
  );
  await writeTextFile(filePath, json);
  excalidrawAPI.setToast({ message: `Saved to ${filePath}` });
};

export const openSceneFromFile = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
) => {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: FILE_FILTERS,
  });
  if (!selected || Array.isArray(selected)) {
    return;
  }
  await openSceneFromPath(excalidrawAPI, selected);
};

export const openSceneFromPath = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
  filePath: string,
) => {
  const text = await readTextFile(filePath);
  const data = await loadFromBlob(
    new Blob([text], { type: MIME_TYPES.excalidraw }),
    null,
    null,
  );
  excalidrawAPI.updateScene({
    elements: data.elements,
    appState: data.appState,
  });
  if (data.files) {
    excalidrawAPI.addFiles(Object.values(data.files));
  }
};

/**
 * Mounted only in the Tauri desktop shell (see App.tsx). Registers
 * native Ctrl+S / Ctrl+O handlers that use system file dialogs instead
 * of the browser download flow, and handles `.excalidraw` files opened
 * from the OS (double-click / Open with). Renders nothing.
 */
const DesktopBridge = () => {
  const excalidrawAPI = useExcalidrawAPI();

  // file opened from the OS: pending launch file + later open events
  useEffect(() => {
    const api = excalidrawAPI;
    if (!api) {
      return;
    }
    let unlisten: (() => void) | undefined;
    // file passed on app launch (double-clicked before frontend mounted)
    invoke<string | null>("get_launch_file")
      .then((filePath) => {
        if (filePath) {
          openSceneFromPath(api, filePath).catch((error) => {
            console.error("Desktop open failed", error);
          });
        }
      })
      .catch(() => {
        // not running inside Tauri, ignore
      });
    // files opened while the app is already running (single instance)
    listen<string>("open-file", (event) => {
      openSceneFromPath(api, event.payload).catch((error) => {
        console.error("Desktop open failed", error);
      });
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        // not running inside Tauri, ignore
      });
    return () => {
      unlisten?.();
    };
  }, [excalidrawAPI]);

  useEffect(() => {
    const api = excalidrawAPI;
    if (!api) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        saveSceneToFile(api).catch((error) => {
          console.error("Desktop save failed", error);
          api.setToast({
            message: `Save failed: ${error?.message || error}`,
          });
        });
      } else if (key === "o") {
        event.preventDefault();
        openSceneFromFile(api).catch((error) => {
          console.error("Desktop open failed", error);
          api.setToast({
            message: `Open failed: ${error?.message || error}`,
          });
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [excalidrawAPI]);

  return null;
};

export default DesktopBridge;
