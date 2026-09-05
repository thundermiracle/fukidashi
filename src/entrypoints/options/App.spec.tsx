import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "@/core";
import { SYNC_NOW } from "@/services/messages";
import { loadNotes } from "@/services/notes";
import {
  DRIVE_FILE_NAME,
  loadDriveToken,
  loadSyncConfig,
  type SyncStatus,
  saveDriveToken,
  saveSyncConfig,
  saveSyncStatus,
} from "@/services/sync";
import { createFakeChromeIdentity } from "@/testing/fakeChromeIdentity";
import { createFakeChromeStorage } from "@/testing/fakeChromeStorage";
import { createFakeDrive } from "@/testing/fakeDrive";
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
let identity: ReturnType<typeof createFakeChromeIdentity>;
let drive: ReturnType<typeof createFakeDrive>;
let sendMessage: ReturnType<typeof vi.fn>;
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

/** The sync card comes first on the page. */
function syncCard(): HTMLElement {
  const card = container.querySelector(".fk-card");
  if (!(card instanceof HTMLElement)) throw new Error("the sync card is missing");
  return card;
}

function syncOutcome(): string {
  return syncCard().querySelector(".fk-card__outcome")?.textContent ?? "";
}

/** A device that signed in earlier, with a token Drive still takes. */
async function connectedEarlier(status: Partial<SyncStatus> = {}) {
  await saveDriveToken({
    accessToken: "tok-1",
    expiresAt: Date.now() + 3_600_000,
    email: "me@example.com",
  });
  await saveSyncConfig({ backend: "drive" });
  await saveSyncStatus({ state: "idle", lastSyncedAt: Date.now() - 120_000, ...status });
  drive.accept("tok-1", "me@example.com");
  drive.plant(DRIVE_FILE_NAME, "{}");
}

async function tick(checkbox: Element | null) {
  if (!(checkbox instanceof HTMLInputElement)) throw new Error("checkbox is missing");
  await act(async () => {
    checkbox.click();
  });
}

/** jsdom has no readable blobs, so the export is caught as the text it was
 *  built from. Only the object-URL calls are taken over: the URL constructor
 *  itself has to keep working, because the export names pages through it. */
function captureDownload() {
  const saved: { name?: string; text?: string } = {};

  vi.stubGlobal(
    "Blob",
    class {
      constructor(readonly parts: string[]) {}
    },
  );
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    saved.text = (blob as unknown as { parts: string[] }).parts.join("");
    return "blob:export";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.name = this.download;
  });

  return saved;
}

async function pickFormat(value: string) {
  const select = container.querySelector(".fk-select") as HTMLSelectElement;
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
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
  identity = createFakeChromeIdentity();
  drive = createFakeDrive();
  sendMessage = vi.fn(async () => undefined);
  vi.stubGlobal("chrome", { ...storage.chrome, ...identity.chrome, runtime: { sendMessage } });
  vi.stubGlobal("fetch", drive.fetch);
  vi.stubEnv("WXT_GOOGLE_CLIENT_ID", "client-1");

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
  vi.unstubAllEnvs();
});

describe("the settings page", () => {
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

  it("writes plain Markdown for Notion", async () => {
    const saved = captureDownload();
    await renderPage();
    await click(buttonLabelled("Export Markdown"));

    expect(saved.name).toMatch(/^fukidashi-notes-notion-\d{4}-\d{2}-\d{2}\.md$/);
    expect(saved.text).toContain("## example.com/docs");
    expect(saved.text).toContain("> quote a");
    expect(saved.text).toContain("on this page");
    expect(saved.text).not.toContain("==");
    expect(outcome()).toBe("Saved 2 notes for Notion.");
  });

  it("writes Obsidian's own Markdown when that is the format picked", async () => {
    const saved = captureDownload();
    await renderPage();
    await pickFormat("obsidian");
    await click(buttonLabelled("Export Markdown"));

    expect(saved.name).toMatch(/^fukidashi-notes-obsidian-\d{4}-\d{2}-\d{2}\.md$/);
    expect(saved.text?.startsWith("---\n")).toBe(true);
    expect(saved.text).toContain("> [!quote] Yellow");
    expect(saved.text).toContain("> ==quote a==");
    expect(outcome()).toBe("Saved 2 notes for Obsidian.");
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

describe("syncing with Google Drive", () => {
  it("offers to connect while nothing syncs", async () => {
    await renderPage();

    expect(syncCard().textContent).toContain("Keep your notes on every browser");
    expect(buttonLabelled("Connect Google Drive")).toBeDefined();
  });

  it("connects, says which account, and asks the background for the first sync", async () => {
    identity.answerWith((state) => `access_token=tok-1&expires_in=3600&state=${state}`);
    drive.accept("tok-1", "me@example.com");
    await renderPage();

    await click(buttonLabelled("Connect Google Drive"));

    expect(syncCard().textContent).toContain("Connected as me@example.com.");
    expect(syncCard().textContent).toContain("Not synced yet.");
    await expect(loadSyncConfig()).resolves.toEqual({ backend: "drive" });
    expect(sendMessage).toHaveBeenCalledWith({ type: SYNC_NOW });
  });

  it("says why when the sign-in did not go through", async () => {
    identity.answerWith((state) => `error=access_denied&state=${state}`);
    await renderPage();

    await click(buttonLabelled("Connect Google Drive"));

    expect(syncOutcome()).toBe("The sign-in was cancelled.");
    expect(syncCard().querySelector(".fk-card__outcome--failed")).not.toBeNull();
    await expect(loadSyncConfig()).resolves.toBeNull();
  });

  it("cannot connect from a build without a client id", async () => {
    vi.stubEnv("WXT_GOOGLE_CLIENT_ID", "");
    await renderPage();

    await click(buttonLabelled("Connect Google Drive"));

    expect(syncOutcome()).toContain("client id");
    expect(identity.calls).toHaveLength(0);
  });

  it("shows when the notes last synced, and asks for a sync on request", async () => {
    await connectedEarlier();
    await renderPage();

    expect(syncCard().textContent).toContain("Connected as me@example.com. Last synced 2m ago.");
    await click(buttonLabelled("Sync now"));

    expect(sendMessage).toHaveBeenCalledWith({ type: SYNC_NOW });
  });

  it("follows the background as it syncs", async () => {
    await connectedEarlier();
    await renderPage();

    await act(async () => {
      await saveSyncStatus({ state: "syncing", lastSyncedAt: 0 });
    });
    expect(syncCard().textContent).toContain("Syncing…");
    expect(buttonLabelled("Sync now")).toHaveProperty("disabled", true);

    await act(async () => {
      await saveSyncStatus({
        state: "error",
        lastSyncedAt: 0,
        error: "Google Drive answered 502 Bad Gateway.",
      });
    });
    expect(syncCard().textContent).toContain(
      "Could not sync: Google Drive answered 502 Bad Gateway. Fukidashi keeps trying.",
    );
  });

  it("offers a sign-in when Google needs one", async () => {
    await connectedEarlier({ state: "signedOut" });
    identity.answerWith((state) => `access_token=tok-2&expires_in=3600&state=${state}`);
    drive.accept("tok-2", "me@example.com");
    await renderPage();

    expect(syncCard().textContent).toContain("sign in again");
    await click(buttonLabelled("Sign in"));

    await expect(loadDriveToken()).resolves.toMatchObject({ accessToken: "tok-2" });
    expect(sendMessage).toHaveBeenCalledWith({ type: SYNC_NOW });
  });

  it("says to update when the copy in Drive needs a newer version", async () => {
    await connectedEarlier({ state: "outdated" });
    await renderPage();

    expect(syncCard().textContent).toContain("Update the extension to keep syncing.");
  });

  it("disconnects, leaving the copy in Drive", async () => {
    await connectedEarlier();
    await renderPage();

    await click(buttonLabelled("Disconnect"));

    expect(buttonLabelled("Connect Google Drive")).toBeDefined();
    expect(syncOutcome()).toContain("The copy in Google Drive stays where it is");
    await expect(loadSyncConfig()).resolves.toBeNull();
    await expect(loadDriveToken()).resolves.toBeNull();
    expect(drive.content(DRIVE_FILE_NAME)).toBe("{}");
  });

  it("deletes the copy in Drive on the way out when asked", async () => {
    await connectedEarlier();
    await renderPage();

    await tick(syncCard().querySelector('input[type="checkbox"]'));
    await click(buttonLabelled("Disconnect"));

    expect(syncOutcome()).toContain("The copy in Google Drive is gone");
    expect(drive.content(DRIVE_FILE_NAME)).toBeUndefined();
    await expect(loadSyncConfig()).resolves.toBeNull();
  });

  it("stays connected when the copy could not be deleted", async () => {
    await connectedEarlier();
    drive.revoke("tok-1");
    identity.refuse(new Error("User interaction required."));
    await renderPage();

    await tick(syncCard().querySelector('input[type="checkbox"]'));
    await click(buttonLabelled("Disconnect"));

    expect(syncOutcome()).toBe(
      "Sign in first to delete the copy, or disconnect without deleting it.",
    );
    expect(syncCard().textContent).toContain("Connected as me@example.com.");
    await expect(loadSyncConfig()).resolves.toEqual({ backend: "drive" });
    expect(drive.content(DRIVE_FILE_NAME)).toBe("{}");
  });
});
