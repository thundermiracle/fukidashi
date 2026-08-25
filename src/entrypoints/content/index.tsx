import { createRoot } from "react-dom/client";
import { keepUntranslated, UI_ATTRIBUTE } from "@/core";
import { ContentApp } from "./ContentApp";
import "./ui.css";

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

    ui.shadowHost.setAttribute(UI_ATTRIBUTE, "");
    // Page translators reach into the shadow root and would rewrite the memos
    // themselves — a note read on a translated page must stay what was typed.
    keepUntranslated(ui.shadowHost);
    // The host itself is laid out by the `:host` rule in ui.css — WXT resets it
    // with `all: initial !important`, which an inline style cannot outrank.
  },
});
