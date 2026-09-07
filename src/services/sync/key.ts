/**
 * How a key was derived, in enough detail for another browser holding the
 * same secret to derive it again. Every envelope carries it with the
 * ciphertext (see codec.ts).
 */
export type SyncKdf =
  /** From a passphrase: the salt and the round count, both public. */
  | { name: "PBKDF2-SHA256"; salt: string; iterations: number }
  /** From a sync code, the way relay/code.ts does it; nothing to carry. */
  | { name: "HKDF-SHA256" };

/**
 * The key the notes are encrypted with before they leave this device. It is
 * derived from a secret the user holds — a passphrase, or a sync code — and
 * kept per device, never synced: every browser is given the secret on its
 * own. The passphrase itself is not kept; the key stands in for it here,
 * and cannot be turned back into it.
 */
export interface SyncKey {
  kdf: SyncKdf;
  /** The 256-bit AES key, base64. */
  key: string;
}

/** OWASP's 2023 figure for PBKDF2-HMAC-SHA256; about half a second on a laptop. */
export const PBKDF2_ITERATIONS = 600_000;
/**
 * The most an envelope may ask for. The count is read from the copy when a
 * passphrase is set, and a copy that asked for billions would keep the
 * settings page busy for hours.
 */
export const MAX_PBKDF2_ITERATIONS = 10_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Reads a derivation description back, or null for one this version cannot use. */
export function readSyncKdf(value: unknown): SyncKdf | null {
  if (!isRecord(value)) return null;
  if (value.name === "HKDF-SHA256") return { name: "HKDF-SHA256" };
  if (value.name !== "PBKDF2-SHA256") return null;

  const { salt, iterations } = value;
  if (typeof salt !== "string" || salt === "") return null;
  if (
    typeof iterations !== "number" ||
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    iterations > MAX_PBKDF2_ITERATIONS
  ) {
    return null;
  }
  return { name: "PBKDF2-SHA256", salt, iterations };
}

export function sameSyncKdf(a: SyncKdf, b: SyncKdf): boolean {
  if (a.name === "PBKDF2-SHA256") {
    return b.name === "PBKDF2-SHA256" && a.salt === b.salt && a.iterations === b.iterations;
  }
  return b.name === a.name;
}

export const SYNC_KEY_KEY = "fukidashi:sync:key";

export function isSyncKeyKey(key: string): boolean {
  return key === SYNC_KEY_KEY;
}

/**
 * Before a key could come from a sync code, the salt and the round count sat
 * on the key itself rather than under `kdf`. Nothing released wrote that
 * shape, but a browser that ran a build from between the two did — and the
 * key is the only thing standing in for a passphrase already entered, so
 * dropping it would leave that browser unable to read its own copy, or to
 * take the encryption off again, without the passphrase.
 */
function toSyncKdf(value: Record<string, unknown>): SyncKdf | null {
  if (value.kdf !== undefined) return readSyncKdf(value.kdf);
  return readSyncKdf({ name: "PBKDF2-SHA256", salt: value.salt, iterations: value.iterations });
}

function toSyncKey(value: unknown): SyncKey | null {
  if (!isRecord(value)) return null;
  const kdf = toSyncKdf(value);
  const { key } = value;
  return kdf && typeof key === "string" && key !== "" ? { kdf, key } : null;
}

export async function loadSyncKey(): Promise<SyncKey | null> {
  const stored = await chrome.storage.local.get(SYNC_KEY_KEY);
  return toSyncKey(stored[SYNC_KEY_KEY]);
}

/** Writes the key, or removes it when given null — after which the notes leave as they are. */
export async function saveSyncKey(key: SyncKey | null): Promise<void> {
  if (key) {
    await chrome.storage.local.set({ [SYNC_KEY_KEY]: key });
  } else {
    await chrome.storage.local.remove(SYNC_KEY_KEY);
  }
}

/** Calls `listener` whenever the key is set or forgotten. Returns an unsubscribe function. */
export function watchSyncKey(listener: (key: SyncKey | null) => void): () => void {
  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local" || !(SYNC_KEY_KEY in changes)) return;
    listener(toSyncKey(changes[SYNC_KEY_KEY].newValue));
  };

  chrome.storage.onChanged.addListener(handleChange);
  return () => chrome.storage.onChanged.removeListener(handleChange);
}
