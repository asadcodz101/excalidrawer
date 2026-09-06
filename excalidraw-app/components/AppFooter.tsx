import { Footer } from "@excalidraw/excalidraw/index";
import React from "react";

import { isExcalidrawPlusSignedUser } from "../app_constants";

import { DebugFooter, isVisualDebuggerEnabled } from "./DebugCanvas";
import { EncryptedIcon } from "./EncryptedIcon";

// `true` inside the Tauri desktop shell (pure offline: no external links).
const isDesktop = import.meta.env.VITE_APP_DESKTOP === "true";

export const AppFooter = React.memo(
  ({ onChange }: { onChange: () => void }) => {
    return (
      <Footer>
        <div
          style={{
            display: "flex",
            gap: ".5rem",
            alignItems: "center",
          }}
        >
          {isVisualDebuggerEnabled() && <DebugFooter onChange={onChange} />}
          {!isDesktop && !isExcalidrawPlusSignedUser && <EncryptedIcon />}
        </div>
      </Footer>
    );
  },
);
