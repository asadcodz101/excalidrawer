// Desktop (Tauri) replacement for the `browser-fs-access` package.
//
// Every built-in Excalidraw dialog (Load from file, Save to disk, Export
// image) funnels through `fileOpen`/`fileSave` from
// `@excalidraw/excalidraw/data/filesystem`, which imports this module.
// In desktop builds (`--mode desktop`) vite aliases `browser-fs-access`
// to this file, so all those dialogs get native system pickers and real
// files on disk instead of browser download fallbacks.
//
// Fake file handles (`{ __tauriPath }`) are returned so the app's
// active-file flow (save-to-current-file) keeps working.

import { open as dialogOpen, save as dialogSave } from "@tauri-apps/plugin-dialog";
import {
  readFile as readBinaryFile,
  writeFile as writeBinaryFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";

export const supported = false;

type TauriFileHandle = {
  name: string;
  kind: "file";
  __tauriPath: string;
};

const abortError = () => {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
};

const basename = (path: string) => path.split(/[/\\]/).pop() || path;

const toFilterExtensions = (extensions?: string[]): string[] => {
  const out = new Set<string>();
  for (const ext of extensions ?? []) {
    const clean = ext.replace(/^\./, "").toLowerCase();
    if (!clean) {
      continue;
    }
    if (clean === "jpg" || clean === "jpeg") {
      out.add("jpg");
      out.add("jpeg");
    } else {
      out.add(clean);
    }
  }
  return [...out];
};

export const fileOpen = async (opts: {
  description: string;
  extensions?: string[];
  mimeTypes?: string[];
  multiple?: boolean;
}): Promise<File | File[]> => {
  const filterExts = toFilterExtensions(opts.extensions);
  const selected = await dialogOpen({
    multiple: !!opts.multiple,
    directory: false,
    filters: filterExts.length
      ? [{ name: opts.description || "Files", extensions: filterExts }]
      : undefined,
  });
  if (!selected) {
    throw abortError();
  }
  const paths = Array.isArray(selected) ? selected : [selected];
  const files = await Promise.all(
    paths.map(async (path) => {
      const data = await readBinaryFile(path);
      const file = new File(
        [data as unknown as BlobPart],
        basename(path),
      );
      (file as any).handle = {
        name: basename(path),
        kind: "file",
        __tauriPath: path,
      } satisfies TauriFileHandle;
      return file;
    }),
  );
  return opts.multiple ? files : files[0];
};

const BINARY_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "ico",
]);

export const fileSave = async (
  blob: Blob | Promise<Blob>,
  opts: {
    fileName: string;
    description: string;
    extensions: string[];
    mimeTypes?: string[];
  },
  fileHandle?: (TauriFileHandle & FileSystemFileHandle) | null,
  saveAs?: boolean,
): Promise<TauriFileHandle> => {
  const resolved = await blob;

  let path: string | null =
    fileHandle?.__tauriPath && !saveAs ? fileHandle.__tauriPath : null;

  if (!path) {
    const picked = await dialogSave({
      defaultPath: opts.fileName,
      filters: [
        {
          name: opts.description || "File",
          extensions: toFilterExtensions(opts.extensions),
        },
      ],
    });
    if (!picked) {
      throw abortError();
    }
    path = picked;
  }

  const ext = (path.split(".").pop() || "").toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) {
    await writeBinaryFile(path, new Uint8Array(await resolved.arrayBuffer()));
  } else {
    await writeTextFile(path, await resolved.text());
  }

  return { name: basename(path), kind: "file", __tauriPath: path };
};
