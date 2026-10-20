const REVIEW_KEY = "fukidashi:review";

/**
 * How many notes a user keeps before being asked to rate the extension:
 * enough to know whether it earns its place.
 */
export const REVIEW_AFTER_NOTES = 10;

/** Whether the user has already answered the ask, either way. Kept per device. */
export async function loadReviewAnswered(): Promise<boolean> {
  const stored = await chrome.storage.local.get(REVIEW_KEY);
  const answer = stored[REVIEW_KEY] as { answeredAt?: unknown } | undefined;
  return typeof answer?.answeredAt === "number";
}

/** Rated or turned down, the ask is not made again. */
export async function answerReview(now: number = Date.now()): Promise<void> {
  await chrome.storage.local.set({ [REVIEW_KEY]: { answeredAt: now } });
}

/**
 * Where this copy's reviews are written: the store it was installed from,
 * found by its own id, which is the store's id for a store build.
 */
export function reviewUrl(): string {
  const id = encodeURIComponent(chrome.runtime.id);
  return import.meta.env.FIREFOX
    ? `https://addons.mozilla.org/firefox/addon/${id}/reviews/`
    : `https://chromewebstore.google.com/detail/${id}/reviews`;
}
