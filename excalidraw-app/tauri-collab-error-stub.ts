// Desktop (Tauri) stub for `./collab/CollabError` (see tauri-dead-stub.ts).
import type { FC } from "react";

import { atom } from "./app-jotai";

export const collabErrorIndicatorAtom = atom<{
  message: string | null;
  nonce: number;
}>({ message: null, nonce: 0 });

const CollabError: FC<any> = () => null;
export default CollabError;
