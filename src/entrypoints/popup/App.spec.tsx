import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "@/core";
import { createFakeChromeStorage } from "@/testing/fakeChromeStorage";
import App from "./App";

const CURRENT_PAGE = "https://example.com/docs";
const OTHER_PAGE = "https://other.test/guide";
const TAB_ID = 7;

function makeNote(id: string, comment: string, start = 0): Note {
  return {
    id,
    comment,
    color: "yellow",
    anchor: { exact: `quote ${id}`, prefix: "", suffix: "", start },
    createdAt: start,
    updatedAt: start,
  };
}

let storage: ReturnType<typeof createFakeChromeStorage>;
let container: HTMLDivElement;
let root: Root | null = null;
let createTab: ReturnType<typeof vi.fn>;
let sendMessage: ReturnType<typeof vi.fn>;
let reloadTab: ReturnType<typeof vi.fn>;
let openOptionsPage: ReturnType<typeof vi.fn>;

async function renderPopup() {
  root = createRoot(container);
  await act(async () => {
    root?.render(<App />);
  });
  await act(async () => {
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

function textsOf(selector: string): string[] {
  return Array.from(container.querySelectorAll(selector), (node) => node.textContent ?? "");
}

function buttonLabelled(label: string): HTMLElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === label,
  );
  if (!found) throw new Error(`no button labelled "${label}"`);
  return found;
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  storage = createFakeChromeStorage();
  createTab = vi.fn();
  sendMessage = vi.fn(async () => undefined);
  reloadTab = vi.fn();
  openOptionsPage = vi.fn();

  vi.stubGlobal("chrome", {
    ...storage.chrome,
    runtime: { openOptionsPage },
    tabs: {
      query: vi.fn(async () => [{ id: TAB_ID, url: CURRENT_PAGE }]),
      create: createTab,
      sendMessage,
      reload: reloadTab,
    },
  });
  vi.stubGlobal("close", vi.fn());

  await storage.chrome.storage.local.set({
    [`fukidashi:notes:${CURRENT_PAGE}`]: [makeNote("a", "on this page", 10)],
    [`fukidashi:notes:${OTHER_PAGE}`]: [
      makeNote("b", "elsewhere", 20),
      makeNote("c", "elsewhere too", 30),
    ],
    [`fukidashi:title:${OTHER_PAGE}`]: "The guide everyone reads",
  });

  container = document.createElement("div");
  document.body.append(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

describe("popup", () => {
  it("opens on the notes of the page in front of the user", async () => {
    await renderPopup();

    expect(textsOf(".fk-list__comment")).toEqual(["on this page"]);
    expect(container.querySelector(".fk-popup__page")?.textContent).toBe("example.com/docs");
  });

  it("gathers every annotated page under the site it belongs to", async () => {
    await renderPopup();
    await click(buttonLabelled("All pages"));

    expect(textsOf(".fk-sites__name")).toEqual(["other.test", "example.com"]);
    expect(textsOf(".fk-page__path")).toEqual(["/guide", "/docs"]);
    expect(textsOf(".fk-list__time")).toEqual([
      expect.stringContaining("2 notes"),
      expect.stringContaining("1 note"),
    ]);
  });

  it("names a page by its own title, above the path", async () => {
    await renderPopup();
    await click(buttonLabelled("All pages"));

    const first = container.querySelector(".fk-list__content");
    expect(Array.from(first?.children ?? [], (node) => node.className)).toEqual([
      "fk-page__title",
      "fk-page__path",
      "fk-list__time",
    ]);
    expect(textsOf(".fk-page__title")).toEqual(["The guide everyone reads"]);
  });

  it("falls back to the path for a page annotated before titles were kept", async () => {
    await renderPopup();
    await click(buttonLabelled("All pages"));

    // Only the other page carries a title, so this one is still named by path.
    expect(textsOf(".fk-page__path")).toEqual(["/guide", "/docs"]);
    expect(textsOf(".fk-page__title")).toHaveLength(1);
  });

  it("drills from a page in the site list into its notes", async () => {
    await renderPopup();
    await click(buttonLabelled("All pages"));
    await click(container.querySelector(".fk-list__button"));

    expect(container.querySelector(".fk-popup__title")?.textContent).toBe("other.test");
    expect(textsOf(".fk-list__comment")).toEqual(["elsewhere", "elsewhere too"]);
  });

  it("goes back from a page to the site list", async () => {
    await renderPopup();
    await click(buttonLabelled("All pages"));
    await click(container.querySelector(".fk-list__button"));
    await click(container.querySelector(".fk-popup__back"));

    expect(textsOf(".fk-sites__name")).toEqual(["other.test", "example.com"]);
  });

  it("opens an annotated page in a browser tab", async () => {
    await renderPopup();
    await click(buttonLabelled("All pages"));
    await click(container.querySelector(".fk-list__open"));

    expect(createTab).toHaveBeenCalledWith({ url: OTHER_PAGE });
  });

  it("asks the page to show a note that was picked from its list", async () => {
    await renderPopup();
    await click(container.querySelector(".fk-list__button"));

    expect(sendMessage).toHaveBeenCalledWith(TAB_ID, expect.objectContaining({ noteId: "a" }));
    expect(createTab).not.toHaveBeenCalled();
  });

  it("reloads the page when it cannot answer, and leaves the jump behind", async () => {
    // sendMessage rejects when the tab has no content script — the page was
    // loaded before the extension was installed or updated.
    sendMessage.mockRejectedValue(new Error("Receiving end does not exist"));
    await renderPopup();
    await click(container.querySelector(".fk-list__button"));

    expect(reloadTab).toHaveBeenCalledWith(TAB_ID);
    expect(storage.data["fukidashi:pending-focus"]).toMatchObject({
      url: CURRENT_PAGE,
      noteId: "a",
    });
    expect(window.close).toHaveBeenCalled();
  });

  it("goes to the page first when the note is on another one", async () => {
    await renderPopup();
    await click(buttonLabelled("All pages"));
    await click(container.querySelector(".fk-list__button"));
    await click(container.querySelector(".fk-list__button"));

    expect(createTab).toHaveBeenCalledWith({ url: OTHER_PAGE });
    expect(sendMessage).not.toHaveBeenCalled();
    // The page cannot be told directly, so the jump waits for it to load.
    expect(storage.data["fukidashi:pending-focus"]).toMatchObject({
      url: OTHER_PAGE,
      noteId: "b",
    });
  });

  it("leaves no jump behind when only the page was asked for", async () => {
    await renderPopup();
    await click(buttonLabelled("All pages"));
    await click(container.querySelector(".fk-list__open"));

    expect(storage.data["fukidashi:pending-focus"]).toBeUndefined();
  });

  it("drops a note from the list when it is deleted", async () => {
    await renderPopup();
    await click(container.querySelector(".fk-list__delete"));

    expect(textsOf(".fk-list__comment")).toEqual([]);
    expect(container.querySelector(".fk-empty__title")?.textContent).toBe(
      "No notes on this page yet",
    );
  });

  it("sends backup and restore to a page of their own", async () => {
    // A file picker would close the popup before it could read what was
    // picked, so the popup only points at the page that can.
    await renderPopup();
    await click(container.querySelector('[aria-label="Settings"]'));

    expect(openOptionsPage).toHaveBeenCalled();
    expect(window.close).toHaveBeenCalled();
  });
});
