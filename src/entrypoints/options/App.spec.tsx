import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "@/core";
import { loadNotes } from "@/services/notes";
import { createFakeChromeStorage } from "@/testing/fakeChromeStorage";
import App from "./App";

const CURRENT_PAGE = "https://example.com/docs";
const OTHER_PAGE = "https://other.test/guide";

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

async function renderPage() {
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

function buttonLabelled(label: string): HTMLElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === label,
  );
  if (!found) throw new Error(`no button labelled "${label}"`);
  return found;
}

function outcome(): string {
  return container.querySelector(".fk-outcome")?.textContent ?? "";
}

/** jsdom has neither object URLs nor readable blobs, so the export is caught
 *  as the text it was built from. */
function captureDownload() {
  const saved: { name?: string; text?: string } = {};

  vi.stubGlobal(
    "Blob",
    class {
      constructor(readonly parts: string[]) {}
    },
  );
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: (blob: { parts: string[] }) => {
      saved.text = blob.parts.join("");
      return "blob:export";
    },
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.name = this.download;
  });

  return saved;
}

async function pickFile(text: string) {
  const input = container.querySelector(".fk-button__file") as HTMLInputElement;
  // jsdom cannot fill a file input, so the file arrives on the event.
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [{ text: async () => text } as File],
  });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  storage = createFakeChromeStorage();
  vi.stubGlobal("chrome", storage.chrome);

  await storage.chrome.storage.local.set({
    [`fukidashi:notes:${CURRENT_PAGE}`]: [makeNote("a", "on this page", 10)],
    [`fukidashi:notes:${OTHER_PAGE}`]: [makeNote("b", "elsewhere", 20)],
  });

  container = document.createElement("div");
  document.body.append(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the backup page", () => {
  it("says how much there is to back up", async () => {
    await renderPage();

    expect(container.querySelector(".fk-page__subtitle")?.textContent).toBe("2 notes on 2 pages");
  });

  it("writes every annotated page out to a file", async () => {
    const saved = captureDownload();
    await renderPage();
    await click(buttonLabelled("Export"));

    expect(saved.name).toMatch(/^fukidashi-notes-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(saved.text ?? "").pages.map((page: { url: string }) => page.url)).toEqual([
      CURRENT_PAGE,
      OTHER_PAGE,
    ]);
    expect(outcome()).toBe("Saved 2 pages.");
  });

  it("merges an imported file into the notes already stored", async () => {
    await renderPage();
    await pickFile(
      JSON.stringify({
        version: 1,
        exportedAt: 0,
        pages: [{ url: CURRENT_PAGE, notes: [makeNote("imported", "from the laptop", 40)] }],
      }),
    );

    await expect(loadNotes(CURRENT_PAGE)).resolves.toMatchObject([
      { comment: "on this page" },
      { comment: "from the laptop" },
    ]);
    expect(outcome()).toBe("Merged 1 page from the file.");
  });

  it("counts the notes it took in", async () => {
    await renderPage();
    await pickFile(
      JSON.stringify({
        version: 1,
        exportedAt: 0,
        pages: [{ url: CURRENT_PAGE, notes: [makeNote("imported", "new", 40)] }],
      }),
    );

    expect(container.querySelector(".fk-page__subtitle")?.textContent).toBe("3 notes on 2 pages");
  });

  it("says so when the file cannot be read, and changes nothing", async () => {
    await renderPage();
    await pickFile("not an export");

    await expect(loadNotes(CURRENT_PAGE)).resolves.toHaveLength(1);
    expect(outcome()).toBe("This file is not readable JSON.");
    expect(container.querySelector(".fk-outcome--failed")).not.toBeNull();
  });

  it("refuses an export written by a newer version", async () => {
    await renderPage();
    await pickFile(JSON.stringify({ version: 99, exportedAt: 0, pages: [] }));

    expect(outcome()).toBe("This file was written by a newer version of Fukidashi.");
  });
});
