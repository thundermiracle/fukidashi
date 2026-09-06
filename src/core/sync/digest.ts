import type { SyncPage } from "./types";

/** FNV-1a over the code units, 32 bits at a time; `seed` is the offset basis. */
function fnv1a(text: string, seed: number): string {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * A short fingerprint of a set of pages, for telling "nothing changed since
 * the last sync" from "something did" without keeping a copy of it all. Two
 * FNV-1a lanes with different seeds make 64 bits, which is plenty for a
 * comparison that is only ever made against this device's own record.
 */
export function digestSyncPages(pages: SyncPage[]): string {
  const text = JSON.stringify(pages);
  return fnv1a(text, 0x811c9dc5) + fnv1a(text, 0x050c5d1f);
}
