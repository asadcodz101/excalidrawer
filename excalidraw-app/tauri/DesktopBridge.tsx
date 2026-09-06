import { useEffect } from "react";
import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { exportToBlob, exportToSvg } from "@excalidraw/excalidraw";
import { loadFromBlob } from "@excalidraw/excalidraw/data/blob";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import { getViewportForZoomWithScrollConstraints } from "@excalidraw/excalidraw/viewport";
import { getNormalizedZoom } from "@excalidraw/excalidraw/scene/normalize";
import {
  CANVAS_SEARCH_TAB,
  LIBRARY_SIDEBAR_TAB,
  MAX_ZOOM,
  MIME_TYPES,
  MIN_ZOOM,
  ZOOM_STEP,
} from "@excalidraw/common";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import {
  readTextFile,
  writeFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const FILE_FILTERS = [{ name: "Excalidraw", extensions: ["excalidraw"] }];

// Currently opened file. Used by File → Save so it doesn't prompt again.
// Set on open / double-click, cleared on New.
let currentFilePath: string | null = null;

export const saveSceneToFile = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
  opts?: { saveAs?: boolean },
) => {
  let filePath = opts?.saveAs ? null : currentFilePath;
  if (!filePath) {
    const picked = await save({
      defaultPath: `${excalidrawAPI.getName() || "drawing"}.excalidraw`,
      filters: FILE_FILTERS,
    });
    if (!picked) {
      return;
    }
    filePath = picked;
  }
  const json = serializeAsJSON(
    excalidrawAPI.getSceneElements(),
    excalidrawAPI.getAppState(),
    excalidrawAPI.getFiles(),
    "local",
  );
  await writeTextFile(filePath, json);
  currentFilePath = filePath;
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
  currentFilePath = filePath;
};

const newScene = async (excalidrawAPI: ExcalidrawImperativeAPI) => {
  const ok = await confirm(
    "Start a new drawing? Any unsaved changes will be lost.",
    { title: "New drawing", kind: "warning" },
  );
  if (!ok) {
    return;
  }
  excalidrawAPI.resetScene();
  currentFilePath = null;
};

const clearCanvas = async (excalidrawAPI: ExcalidrawImperativeAPI) => {
  const ok = await confirm(
    "Clear everything on the canvas? This cannot be undone via menu.",
    { title: "Clear canvas", kind: "warning" },
  );
  if (!ok) {
    return;
  }
  excalidrawAPI.updateScene({ elements: [] });
};

const nonDeletedElements = (excalidrawAPI: ExcalidrawImperativeAPI) =>
  excalidrawAPI.getSceneElements() as unknown as readonly NonDeletedExcalidrawElement[];

const exportSceneAsPng = async (excalidrawAPI: ExcalidrawImperativeAPI) => {
  const elements = nonDeletedElements(excalidrawAPI);
  if (!elements.length) {
    excalidrawAPI.setToast({ message: "Nothing to export" });
    return;
  }
  const appState = excalidrawAPI.getAppState();
  const scale = appState.exportScale ?? 2;
  const blob = await exportToBlob({
    elements,
    appState,
    files: excalidrawAPI.getFiles(),
    mimeType: MIME_TYPES.png,
    getDimensions: (width, height) => ({
      width: width * scale,
      height: height * scale,
      scale,
    }),
  });
  const filePath = await save({
    defaultPath: `${excalidrawAPI.getName() || "drawing"}.png`,
    filters: [{ name: "PNG image", extensions: ["png"] }],
  });
  if (!filePath) {
    return;
  }
  await writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
  excalidrawAPI.setToast({ message: `Exported to ${filePath}` });
};

const exportSceneAsSvg = async (excalidrawAPI: ExcalidrawImperativeAPI) => {
  const elements = nonDeletedElements(excalidrawAPI);
  if (!elements.length) {
    excalidrawAPI.setToast({ message: "Nothing to export" });
    return;
  }
  const appState = excalidrawAPI.getAppState();
  const svg = await exportToSvg({
    elements,
    // embed the scene so the SVG re-opens as editable in Excalidraw
    appState: { ...appState, exportEmbedScene: true },
    files: excalidrawAPI.getFiles(),
  });
  const filePath = await save({
    defaultPath: `${excalidrawAPI.getName() || "drawing"}.svg`,
    filters: [{ name: "SVG image", extensions: ["svg"] }],
  });
  if (!filePath) {
    return;
  }
  await writeTextFile(filePath, new XMLSerializer().serializeToString(svg));
  excalidrawAPI.setToast({ message: `Exported to ${filePath}` });
};

/** Dispatch a synthetic keydown so Excalidraw runs its own action
 *  (undo/redo/zoom-to-fit/find use internal keybindings). */
const pressKeys = (init: KeyboardEventInit) => {
  (document.activeElement ?? document.body).dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ...init,
    }),
  );
};

const zoomBy = (
  excalidrawAPI: ExcalidrawImperativeAPI,
  delta: number,
) => {
  const appState = excalidrawAPI.getAppState();
  const nextZoom = getNormalizedZoom(
    Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, appState.zoom.value + delta)),
  );
  excalidrawAPI.updateScene({
    appState: {
      ...appState,
      ...getViewportForZoomWithScrollConstraints(
        {
          viewportX: appState.width / 2 + appState.offsetLeft,
          viewportY: appState.height / 2 + appState.offsetTop,
          nextZoom,
        },
        appState,
      ),
    },
  });
};

const resetZoom = (excalidrawAPI: ExcalidrawImperativeAPI) => {
  const appState = excalidrawAPI.getAppState();
  const nextZoom = getNormalizedZoom(
    appState.scrollConstraints?.lockZoom
      ? appState.scrollConstraints.zoom
      : 1,
  );
  excalidrawAPI.updateScene({
    appState: {
      ...appState,
      ...getViewportForZoomWithScrollConstraints(
        {
          viewportX: appState.width / 2 + appState.offsetLeft,
          viewportY: appState.height / 2 + appState.offsetTop,
          nextZoom,
        },
        appState,
      ),
    },
  });
};

const openSidebarTab = (
  excalidrawAPI: ExcalidrawImperativeAPI,
  tab: string,
) => {
  excalidrawAPI.updateScene({
    appState: {
      openSidebar: { name: "default", tab } as any,
    } as any,
  });
};

const openShortcutsDialog = (excalidrawAPI: ExcalidrawImperativeAPI) => {
  excalidrawAPI.updateScene({
    appState: {
      openDialog: { name: "help" },
      openMenu: null,
      openPopup: null,
    } as any,
  });
};

const handleMenuEvent = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
  id: string,
) => {
  switch (id) {
    case "file-new":
      await newScene(excalidrawAPI);
      break;
    case "file-open":
      await openSceneFromFile(excalidrawAPI);
      break;
    case "file-save":
      await saveSceneToFile(excalidrawAPI);
      break;
    case "file-save-as":
      await saveSceneToFile(excalidrawAPI, { saveAs: true });
      break;
    case "file-export-png":
      await exportSceneAsPng(excalidrawAPI);
      break;
    case "file-export-svg":
      await exportSceneAsSvg(excalidrawAPI);
      break;
    case "edit-undo":
      pressKeys({ key: "z", code: "KeyZ", ctrlKey: true });
      break;
    case "edit-redo":
      pressKeys({ key: "Z", code: "KeyZ", ctrlKey: true, shiftKey: true });
      break;
    case "edit-clear":
      await clearCanvas(excalidrawAPI);
      break;
    case "view-library":
      openSidebarTab(excalidrawAPI, LIBRARY_SIDEBAR_TAB);
      break;
    case "view-search":
      openSidebarTab(excalidrawAPI, CANVAS_SEARCH_TAB);
      break;
    case "view-zoom-in":
      zoomBy(excalidrawAPI, ZOOM_STEP);
      break;
    case "view-zoom-out":
      zoomBy(excalidrawAPI, -ZOOM_STEP);
      break;
    case "view-zoom-reset":
      resetZoom(excalidrawAPI);
      break;
    case "view-zoom-fit":
      // Shift+1, same as Excalidraw's built-in "zoom to fit"
      pressKeys({ code: "Digit1", shiftKey: true });
      break;
    case "view-theme":
      window.dispatchEvent(new CustomEvent("desktop:toggle-theme"));
      break;
    case "help-shortcuts":
      openShortcutsDialog(excalidrawAPI);
      break;
    default:
      break;
  }
};

/**
 * Mounted only in the Tauri desktop shell (see App.tsx). Wires up:
 * - native Ctrl+S / Ctrl+O (system file dialogs, no browser download),
 * - `.excalidraw` files opened from the OS (double-click / Open with),
 * - native menu bar events (File/Edit/View/Help).
 * Renders nothing.
 */
const DesktopBridge = () => {
  const excalidrawAPI = useExcalidrawAPI();

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

  // native menu bar events from Rust (File/Edit/View/Help)
  useEffect(() => {
    const api = excalidrawAPI;
    if (!api) {
      return;
    }
    let unlisten: (() => void) | undefined;
    listen<string>("menu-event", (event) => {
      handleMenuEvent(api, event.payload).catch((error) => {
        console.error(`Desktop menu action failed (${event.payload})`, error);
        api.setToast({
          message: `Action failed: ${error?.message || error}`,
        });
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

  return null;
};

export default DesktopBridge;
