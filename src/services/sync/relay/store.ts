import { formatSyncCode, normalizeSyncCode } from "./code";

/**
 * The sync code this device syncs through, kept where the Drive token is
 * kept: on the device, never synced. It is what the settings page shows
 * again when the user wants to connect another browser, and what the key
 * and the blob id are derived from on every call.
 */
export const RELAY_CODE_KEY = "fukidashi:sync:relay";

export function isRelayCodeKey(key: string): boolean {
  return key === RELAY_CODE_KEY;
}

function toRelayCode(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const { code } = value as { code?: unknown };
  if (typeof code !== "string") return null;
  const raw = normalizeSyncCode(code);
  return raw === null ? null : formatSyncCode(raw);
}

export async function loadRelayCode(): Promise<string | null> {
  const stored = await chrome.storage.local.get(RELAY_CODE_KEY);
  return toRelayCode(stored[RELAY_CODE_KEY]);
}

/** Keeps the code, or forgets it when given null. */
export async function saveRelayCode(code: string | null): Promise<void> {
  if (code) {
    await chrome.storage.local.set({ [RELAY_CODE_KEY]: { code } });
  } else {
    await chrome.storage.local.remove(RELAY_CODE_KEY);
  }
}
