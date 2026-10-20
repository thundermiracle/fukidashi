import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeChromeRuntime } from "@/testing/fakeChromeRuntime";
import { greetOnInstall } from "./welcome";

let runtime: ReturnType<typeof createFakeChromeRuntime>;
let createTab: ReturnType<typeof vi.fn>;

beforeEach(() => {
  runtime = createFakeChromeRuntime();
  createTab = vi.fn();
  vi.stubGlobal("chrome", {
    runtime: {
      ...runtime.chrome.runtime,
      getURL: (path: string) => `chrome-extension://fukidashi${path}`,
    },
    tabs: { create: createTab },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("greetOnInstall", () => {
  it("opens the welcome page when the extension is first installed", () => {
    greetOnInstall();
    runtime.installed("install");

    expect(createTab).toHaveBeenCalledWith({ url: "chrome-extension://fukidashi/welcome.html" });
  });

  it("says nothing when the extension or the browser is updated", () => {
    greetOnInstall();
    runtime.installed("update");
    runtime.installed("chrome_update");

    expect(createTab).not.toHaveBeenCalled();
  });

  it("stops listening once told to", () => {
    const stop = greetOnInstall();
    stop();
    runtime.installed("install");

    expect(createTab).not.toHaveBeenCalled();
  });
});
