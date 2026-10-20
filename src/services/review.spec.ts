import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeChromeStorage } from "@/testing/fakeChromeStorage";
import { answerReview, loadReviewAnswered, reviewUrl } from "./review";

let storage: ReturnType<typeof createFakeChromeStorage>;

beforeEach(() => {
  storage = createFakeChromeStorage();
  vi.stubGlobal("chrome", {
    ...storage.chrome,
    runtime: { id: "fnlmnompnmmkobkoooilpkeddbfdgdfd" },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the ask for a review", () => {
  it("is open until the user answers it", async () => {
    await expect(loadReviewAnswered()).resolves.toBe(false);

    await answerReview(1000);

    await expect(loadReviewAnswered()).resolves.toBe(true);
    expect(storage.data["fukidashi:review"]).toEqual({ answeredAt: 1000 });
  });

  it("sends a Chrome user to the Chrome Web Store", () => {
    expect(reviewUrl()).toBe(
      "https://chromewebstore.google.com/detail/fnlmnompnmmkobkoooilpkeddbfdgdfd/reviews",
    );
  });

  it("sends a Firefox user to Firefox Add-ons", () => {
    vi.stubEnv("FIREFOX", "true");
    vi.stubGlobal("chrome", { runtime: { id: "fukidashi@thundermiracle.com" } });

    expect(reviewUrl()).toBe(
      "https://addons.mozilla.org/firefox/addon/fukidashi%40thundermiracle.com/reviews/",
    );
  });
});
