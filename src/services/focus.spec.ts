import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeChromeStorage } from "@/testing/fakeChromeStorage";
import { setPendingFocus, takePendingFocus } from "./focus";

const PAGE = "https://example.com/docs";
const KEY = "fukidashi:pending-focus";

let storage: ReturnType<typeof createFakeChromeStorage>;

beforeEach(() => {
  storage = createFakeChromeStorage();
  vi.stubGlobal("chrome", storage.chrome);
});

describe("takePendingFocus", () => {
  it("returns nothing when no jump was left", async () => {
    await expect(takePendingFocus(PAGE)).resolves.toBeNull();
  });

  it("hands the page the note it was opened for", async () => {
    await setPendingFocus(PAGE, "abc");

    await expect(takePendingFocus(PAGE)).resolves.toBe("abc");
  });

  it("only gives it away once", async () => {
    await setPendingFocus(PAGE, "abc");
    await takePendingFocus(PAGE);

    await expect(takePendingFocus(PAGE)).resolves.toBeNull();
    expect(storage.data[KEY]).toBeUndefined();
  });

  it("leaves a jump meant for another page alone", async () => {
    await setPendingFocus(PAGE, "abc");

    await expect(takePendingFocus("https://example.com/other")).resolves.toBeNull();
    await expect(takePendingFocus(PAGE)).resolves.toBe("abc");
  });

  it("matches the page a translated URL stands for", async () => {
    await setPendingFocus(PAGE, "abc");

    await expect(
      takePendingFocus("https://example-com.translate.goog/docs?_x_tr_tl=ja"),
    ).resolves.toBe("abc");
  });

  it("drops a jump left for a tab that never arrived", async () => {
    await storage.chrome.storage.local.set({
      [KEY]: { url: PAGE, noteId: "abc", at: Date.now() - 120_000 },
    });

    await expect(takePendingFocus(PAGE)).resolves.toBeNull();
    expect(storage.data[KEY]).toBeUndefined();
  });
});
