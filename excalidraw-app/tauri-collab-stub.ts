// Desktop (Tauri) stub for `./collab/Collab` (see tauri-dead-stub.ts).
// Keeps production default atom values; the component never mounts.
import type { FC } from "react";

import { atom } from "./app-jotai";

export type CollabAPI = any;

export const collabAPIAtom = atom<any>(null);
export const isCollaboratingAtom = atom(false);
export const isOfflineAtom = atom(false);
export const activeRoomLinkAtom = atom<string | null>(null);
export const userToFollowAtom = atom<any>(null);

const Collab: FC<any> = () => null;
export default Collab;
