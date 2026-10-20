import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeChromeI18n } from "@/testing/fakeChromeI18n";
import App from "./App";

let container: HTMLDivElement;
let root: Root | null = null;
let openOptionsPage: ReturnType<typeof vi.fn>;

function stubChrome(language: "en" | "ja") {
  vi.stubGlobal("chrome", {
    ...createFakeChromeI18n(language).chrome,
    runtime: { openOptionsPage },
  });
}

async function renderPage() {
  root = createRoot(container);
  await act(async () => {
    root?.render(<App />);
  });
}

function textsOf(selector: string): string[] {
  return Array.from(container.querySelectorAll(selector), (node) => node.textContent ?? "");
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  openOptionsPage = vi.fn();
  stubChrome("en");
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the welcome page", () => {
  it("walks through making a note, naming the button the toolbar shows", async () => {
    await renderPage();

    expect(textsOf(".fk-step__title")).toEqual([
      "Select text",
      "Pick a color, or write a note",
      "Hover to read",
    ]);
    expect(textsOf(".fk-step__body")[1]).toContain("“Add note”");
  });

  it("warns that tabs open before the install need a reload", async () => {
    await renderPage();

    expect(container.querySelector(".fk-welcome__tips")?.textContent).toContain("one reload");
  });

  it("leaves that out in Firefox, which puts the script into open tabs itself", async () => {
    vi.stubEnv("FIREFOX", "true");
    await renderPage();

    expect(container.querySelector(".fk-welcome__tips")?.textContent).not.toContain("reload");
  });

  it("leads to the settings, where syncing is", async () => {
    await renderPage();

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".fk-welcome__button")?.click();
    });

    expect(openOptionsPage).toHaveBeenCalled();
  });

  it("speaks Japanese in a Japanese browser", async () => {
    stubChrome("ja");
    await renderPage();

    expect(container.querySelector(".fk-welcome__title")?.textContent).toBe("Fukidashi へようこそ");
    expect(textsOf(".fk-step__body")[1]).toContain("「メモを追加」");
  });
});
