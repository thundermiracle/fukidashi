import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "@/core";
import { FOCUS_NOTE } from "@/services/messages";
import { createFakeChromeStorage } from "@/testing/fakeChromeStorage";
import { ContentApp } from "./ContentApp";

const PAGE_HTML = '<p id="page">The quick brown fox jumps over the lazy dog.</p>';

let storage: ReturnType<typeof createFakeChromeStorage>;
let container: HTMLDivElement;
let root: Root | null = null;
let messageListeners: Array<(message: unknown) => void>;

/** Lets React flush effects and the fake storage settle. */
async function settle(ms = 5) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function renderApp() {
  root = createRoot(container);
  await act(async () => {
    root?.render(<ContentApp />);
  });
  await settle();
}

function selectOnPage(quote: string) {
  const text = document.getElementById("page")?.firstChild as Text;
  const start = text.data.indexOf(quote);
  const range = document.createRange();
  range.setStart(text, start);
  range.setEnd(text, start + quote.length);

  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

async function selectAndOpenToolbar(quote: string) {
  selectOnPage(quote);
  await act(async () => {
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}

async function click(element: Element | null | undefined) {
  if (!(element instanceof HTMLElement)) throw new Error("element to click is missing");
  await act(async () => {
    element.click();
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}

async function type(textarea: HTMLTextAreaElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  await act(async () => {
    setValue?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function storedNotes(): Note[] {
  const key = Object.keys(storage.data).find((name) => name.startsWith("fukidashi:notes:"));
  return key ? (storage.data[key] as Note[]) : [];
}

/**
 * How the composer panel was styled each time it asked for focus. jsdom has no
 * layout, so it will happily focus a hidden element and `activeElement` alone
 * proves nothing; a browser refuses, which is what this watches for.
 */
function watchComposerFocus(): { calls: string[]; stop: () => void } {
  const calls: string[] = [];
  const real = HTMLTextAreaElement.prototype.focus;

  HTMLTextAreaElement.prototype.focus = function record(this: HTMLTextAreaElement) {
    const panel = this.closest(".fk-composer");
    calls.push(panel instanceof HTMLElement ? panel.style.visibility || "visible" : "no panel");
    return real.call(this);
  };

  return {
    calls,
    stop: () => {
      HTMLTextAreaElement.prototype.focus = real;
    },
  };
}

function storedTitle(): string | undefined {
  const key = Object.keys(storage.data).find((name) => name.startsWith("fukidashi:title:"));
  return key ? (storage.data[key] as string) : undefined;
}

/** The URL notes of this page are stored under, the way the app normalizes it. */
function pageUrl(): string {
  return `${location.origin}${location.pathname}`;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  storage = createFakeChromeStorage();
  messageListeners = [];
  vi.stubGlobal("chrome", {
    ...storage.chrome,
    runtime: {
      onMessage: {
        addListener: (listener: (message: unknown) => void) => messageListeners.push(listener),
        removeListener: (listener: (message: unknown) => void) => {
          messageListeners = messageListeners.filter((known) => known !== listener);
        },
      },
    },
  });

  document.body.innerHTML = PAGE_HTML;
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("ContentApp", () => {
  it("highlights the selection when a color is picked", async () => {
    await renderApp();
    await selectAndOpenToolbar("brown fox");

    expect(container.querySelector(".fk-toolbar")).not.toBeNull();

    await click(container.querySelector(".fk-swatch--green"));

    expect(document.querySelector("mark")?.textContent).toBe("brown fox");
    expect(storedNotes()).toMatchObject([{ color: "green", comment: "" }]);
  });

  it("stores a memo written in the composer", async () => {
    await renderApp();
    await selectAndOpenToolbar("lazy dog");

    await click(container.querySelector(".fk-action"));
    const textarea = container.querySelector("textarea");
    if (!textarea) throw new Error("the composer did not open");
    expect(container.querySelector(".fk-quote")?.textContent).toBe("lazy dog");

    await type(textarea, "check this later");
    await click(container.querySelector(".fk-button--primary"));

    expect(storedNotes()).toMatchObject([{ comment: "check this later" }]);
    expect(document.querySelector("mark")?.textContent).toBe("lazy dog");
    expect(container.querySelector(".fk-composer")).toBeNull();
  });

  it("shows the memo in a bubble when the highlight is hovered", async () => {
    await renderApp();
    await selectAndOpenToolbar("brown fox");
    await click(container.querySelector(".fk-action"));
    const textarea = container.querySelector("textarea");
    if (!textarea) throw new Error("the composer did not open");
    await type(textarea, "a memo to read later");
    await click(container.querySelector(".fk-button--primary"));

    const mark = document.querySelector("mark");
    await act(async () => {
      mark?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    expect(container.querySelector(".fk-bubble")?.textContent).toContain("a memo to read later");
  });

  it("draws the highlight again when the page rewrites the text", async () => {
    await renderApp();
    await selectAndOpenToolbar("brown fox");
    await click(container.querySelector(".fk-swatch--green"));

    const page = document.getElementById("page");
    if (!page) throw new Error("the page paragraph is missing");
    // What translating a page does: the text is replaced, highlights and all.
    await act(async () => {
      page.innerHTML = "The quick brown fox jumps over the lazy dog.";
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    expect(document.querySelector("mark")?.textContent).toBe("brown fox");
  });

  it("opens the bubble of the note the popup picked", async () => {
    await renderApp();
    await selectAndOpenToolbar("brown fox");
    await click(container.querySelector(".fk-action"));
    const textarea = container.querySelector("textarea");
    if (!textarea) throw new Error("the composer did not open");
    await type(textarea, "the note the popup points at");
    await click(container.querySelector(".fk-button--primary"));

    await act(async () => {
      for (const listener of messageListeners) {
        listener({ type: FOCUS_NOTE, noteId: storedNotes()[0].id });
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    });

    expect(container.querySelector(".fk-bubble")?.textContent).toContain(
      "the note the popup points at",
    );
    expect(document.querySelector("mark")?.getAttribute("data-fukidashi-active")).toBe("true");
  });

  it("tells a page translator to leave its own panels alone", async () => {
    await renderApp();
    await selectAndOpenToolbar("brown fox");

    const root = container.querySelector(".fk-root");
    expect(root?.getAttribute("translate")).toBe("no");
    expect(root?.classList.contains("notranslate")).toBe(true);
    // The toolbar is inside it, so the whole UI is covered by the one marker.
    expect(root?.querySelector(".fk-toolbar")).not.toBeNull();
  });

  it("jumps to the note the popup picked before this page was open", async () => {
    const page = pageUrl();
    await storage.chrome.storage.local.set({
      [`fukidashi:notes:${page}`]: [
        {
          id: "stored",
          comment: "waiting to be read",
          color: "blue",
          anchor: { exact: "lazy dog", prefix: "over the ", suffix: ".", start: 35 },
          createdAt: 1,
          updatedAt: 1,
        } satisfies Note,
      ],
      "fukidashi:pending-focus": { url: page, noteId: "stored", at: Date.now() },
    });

    await renderApp();
    await settle(400);

    expect(container.querySelector(".fk-bubble")?.textContent).toContain("waiting to be read");
    expect(storage.data["fukidashi:pending-focus"]).toBeUndefined();
  });

  it("puts the caret in the composer, once the panel is placed", async () => {
    const focusing = watchComposerFocus();
    try {
      await renderApp();
      await selectAndOpenToolbar("lazy dog");
      await click(container.querySelector(".fk-action"));

      const textarea = container.querySelector("textarea");
      expect(document.activeElement).toBe(textarea);
      // Never while the panel is still hidden for its measuring frame, and
      // never again afterwards, which would fight the caret.
      expect(focusing.calls).toEqual(["visible"]);
    } finally {
      focusing.stop();
    }
  });

  it("opens an edited memo with the caret at its end", async () => {
    await renderApp();
    await selectAndOpenToolbar("brown fox");
    await click(container.querySelector(".fk-action"));
    const textarea = container.querySelector("textarea");
    if (!textarea) throw new Error("the composer did not open");
    await type(textarea, "half a thought");
    await click(container.querySelector(".fk-button--primary"));

    const mark = document.querySelector("mark");
    await act(async () => {
      mark?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    await click(container.querySelector('[title="Edit note"]'));

    const editing = container.querySelector("textarea");
    expect(document.activeElement).toBe(editing);
    expect(editing?.selectionStart).toBe("half a thought".length);
  });

  it("remembers what the page calls itself once it carries a note", async () => {
    document.title = "The quick brown fox — Fables";
    await renderApp();
    expect(storedTitle()).toBeUndefined();

    await selectAndOpenToolbar("brown fox");
    await click(container.querySelector(".fk-swatch--green"));
    await settle();

    expect(storedTitle()).toBe("The quick brown fox — Fables");
  });

  it("fills in the title of a page annotated before titles were kept", async () => {
    document.title = "An old favourite";
    await storage.chrome.storage.local.set({
      [`fukidashi:notes:${pageUrl()}`]: [
        {
          id: "stored",
          comment: "from an earlier visit",
          color: "blue",
          anchor: { exact: "lazy dog", prefix: "over the ", suffix: ".", start: 35 },
          createdAt: 1,
          updatedAt: 1,
        } satisfies Note,
      ],
    });

    await renderApp();
    await settle();

    expect(storedTitle()).toBe("An old favourite");
  });

  it("restores the highlights stored for the page", async () => {
    const note: Note = {
      id: "stored",
      comment: "from an earlier visit",
      color: "blue",
      anchor: { exact: "lazy dog", prefix: "over the ", suffix: ".", start: 35 },
      createdAt: 1,
      updatedAt: 1,
    };
    await storage.chrome.storage.local.set({
      [`fukidashi:notes:${pageUrl()}`]: [note],
    });

    await renderApp();

    const mark = document.querySelector("mark");
    expect(mark?.textContent).toBe("lazy dog");
    expect(mark?.className).toContain("fukidashi-highlight--blue");
  });
});
