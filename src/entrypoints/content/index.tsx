import { createRoot } from "react-dom/client";
import { keepUntranslated, UI_ATTRIBUTE } from "@/core";
import { ContentApp } from "./ContentApp";
import "./ui.css";

/** Above every reasonable page element, but inside the 32-bit maximum. */
const OVERLAY_Z_INDEX = "2147483646";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_end",
  cssInjectionMode: "ui",

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: "fukidashi-ui",
      position: "inline",
      anchor: "body",
      // Keeps the page from reacting to typing inside the note composer.
      isolateEvents: true,
      onMount: (container) => {
        const root = createRoot(container);
        root.render(<ContentApp />);
        return root;
      },
      onRemove: (root) => root?.unmount(),
    });

    ui.mount();

    // The host covers the viewport so panels can be placed in viewport
    // coordinates, while clicks fall through to the page.
    ui.shadowHost.setAttribute(UI_ATTRIBUTE, "");
    // Page translators reach into the shadow root and would rewrite the memos
    // themselves — a note read on a translated page must stay what was typed.
    keepUntranslated(ui.shadowHost);
    Object.assign(ui.shadowHost.style, {
      position: "fixed",
      inset: "0",
      display: "block",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: OVERLAY_Z_INDEX,
    });
  },
});
