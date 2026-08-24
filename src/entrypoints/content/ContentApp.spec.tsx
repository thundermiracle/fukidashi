import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "@/core";
import { createFakeChromeStorage } from "@/testing/fakeChromeStorage";
import { ContentApp } from "./ContentApp";

const PAGE_HTML = '<p id="page">The quick brown fox jumps over the lazy dog.</p>';

let storage: ReturnType<typeof createFakeChromeStorage>;
let container: HTMLDivElement;
let root: Root | null = null;

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

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  storage = createFakeChromeStorage();
  vi.stubGlobal("chrome", {
    ...storage.chrome,
    runtime: { onMessage: { addListener: vi.fn(), removeListener: vi.fn() } },
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
      [`fukidashi:notes:${location.origin}${location.pathname}`]: [note],
    });

    await renderApp();

    const mark = document.querySelector("mark");
    expect(mark?.textContent).toBe("lazy dog");
    expect(mark?.className).toContain("fukidashi-highlight--blue");
  });
});
