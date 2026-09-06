import { useEffect } from "react";
import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { loadFromBlob } from "@excalidraw/excalidraw/data/blob";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import { fileOpen } from "@excalidraw/excalidraw/data/filesystem";
import { openConfirmModal } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirmState";
import Trans from "@excalidraw/excalidraw/components/Trans";
import { t } from "@excalidraw/excalidraw/i18n";
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
import { confirm, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const FILE_FILTERS = [{ name: "Excalidraw", extensions: ["excalidraw"] }];

// Currently opened file. Used by File → Save so it doesn't prompt again.
// Set on open / double-click, cleared on New. Mirrored into
// appState.fileHandle so the built-in flows stay consistent.
let currentFilePath: string | null = null;

const basename = (path: string) => path.split(/[/\\]/).pop() || path;

const getActivePath = (excalidrawAPI: ExcalidrawImperativeAPI) =>
  currentFilePath ??
  (excalidrawAPI.getAppState().fileHandle as any)?.__tauriPath ??
  null;

const setActivePath = (
  excalidrawAPI: ExcalidrawImperativeAPI,
  filePath: string | null,
) => {
  currentFilePath = filePath;
  excalidrawAPI.updateScene({
    appState: {
      fileHandle: filePath
        ? ({ name: basename(filePath), kind: "file", __tauriPath: filePath } as any)
        : null,
    } as any,
  });
};

export const saveSceneToFile = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
  opts?: { saveAs?: boolean },
) => {
  let filePath = opts?.saveAs ? null : getActivePath(excalidrawAPI);
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
  setActivePath(excalidrawAPI, filePath);
  excalidrawAPI.setToast({ message: `Saved to ${filePath}` });
};

/** Menu File → Save: direct save when a file is active, otherwise the
 *  same "Save to..." confirm dialog the flyout used to show. */
export const saveSceneWithDialog = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
  opts?: { saveAs?: boolean },
) => {
  if (!opts?.saveAs && getActivePath(excalidrawAPI)) {
    await saveSceneToFile(excalidrawAPI);
    return;
  }
  const confirmed = await openConfirmModal({
    title: t("buttons.export"),
    actionLabel: t("overwriteConfirm.action.saveToDisk.button"),
    color: "warning",
    description: t("overwriteConfirm.action.saveToDisk.description"),
  });
  if (confirmed) {
    await saveSceneToFile(excalidrawAPI, { saveAs: true });
  }
};

/** Menu File → Open: the same "Load from file" confirm dialog the
 *  flyout used to show (backup actions included, all Tauri-backed). */
export const openSceneWithDialog = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
) => {
  if (excalidrawAPI.getSceneElements().length) {
    const confirmed = await openConfirmModal({
      title: t("overwriteConfirm.modal.loadFromFile.title"),
      actionLabel: t("overwriteConfirm.modal.loadFromFile.button"),
      color: "warning",
      description: (
        <Trans
          i18nKey="overwriteConfirm.modal.loadFromFile.description"
          bold={(text) => <strong>{text}</strong>}
          br={() => <br />}
        />
      ),
    });
    if (!confirmed) {
      return;
    }
  }
  // same as the built-in loadScene action; fileOpen goes through the
  // Tauri shim (native picker) in desktop builds
  const file = await fileOpen({ description: "Excalidraw files" });
  const data = await loadFromBlob(
    file,
    excalidrawAPI.getAppState(),
    excalidrawAPI.getSceneElements(),
    (file as any).handle ?? null,
  );
  excalidrawAPI.updateScene({
    elements: data.elements,
    appState: data.appState,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  if (data.files) {
    excalidrawAPI.addFiles(Object.values(data.files));
  }
  setActivePath(
    excalidrawAPI,
    (file as any).handle?.__tauriPath ?? null,
  );
};

export const openSceneFromFile = openSceneWithDialog;

export const openSceneFromPath = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
  filePath: string,
) => {
  const text = await readTextFile(filePath);
  const data = await loadFromBlob(
    new Blob([text], { type: MIME_TYPES.excalidraw }),
    excalidrawAPI.getAppState(),
    excalidrawAPI.getSceneElements(),
    null,
  );
  excalidrawAPI.updateScene({
    elements: data.elements,
    appState: data.appState,
  });
  if (data.files) {
    excalidrawAPI.addFiles(Object.values(data.files));
  }
  setActivePath(excalidrawAPI, filePath);
};

/** Menu File → Export…: the same built-in Export image dialog
 *  (preview, background, dark mode, scale, PNG/SVG/clipboard). */
export const openExportDialog = (excalidrawAPI: ExcalidrawImperativeAPI) => {
  excalidrawAPI.updateScene({
    appState: { openDialog: { name: "imageExport" } } as any,
  });
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
  setActivePath(excalidrawAPI, null);
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

/** Dispatch a synthetic keydown so Excalidraw runs its own action
 *  (undo/redo/zoom-to-fit use internal keybindings). */
const pressKeys = (init: KeyboardEventInit) => {
  (document.activeElement ?? document.body).dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ...init,
    }),
  );
};

const zoomBy = (excalidrawAPI: ExcalidrawImperativeAPI, delta: number) => {
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
      openSidebar: { name: "default", tab },
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
      await openSceneWithDialog(excalidrawAPI);
      break;
    case "file-save":
      await saveSceneWithDialog(excalidrawAPI);
      break;
    case "file-save-as":
      await saveSceneWithDialog(excalidrawAPI, { saveAs: true });
      break;
    case "file-export":
      openExportDialog(excalidrawAPI);
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
 * - native Ctrl+S / Ctrl+O (captured before Excalidraw's own bindings so
 *   the desktop file flows run exactly once),
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
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "s" || key === "o") {
        // capture phase + stopPropagation: preempt Excalidraw's built-in
        // save/load bindings so only the desktop flow runs
        event.preventDefault();
        event.stopPropagation();
        (key === "s"
          ? saveSceneWithDialog(api)
          : openSceneWithDialog(api)
        ).catch((error) => {
          if (error?.name === "AbortError") {
            return;
          }
          console.error("Desktop file action failed", error);
          api.setToast({
            message: `Action failed: ${error?.message || error}`,
          });
        });
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
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
        if (error?.name === "AbortError") {
          return;
        }
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
