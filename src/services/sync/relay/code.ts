import { toBase64, toHex, utf8 } from "../bytes";
import type { SyncKey } from "../key";

/**
 * The sync code: the one secret a user carries between browsers when the
 * notes go through the relay. 15 random bytes, written as 24 characters of
 * Crockford's base32 in groups of four — an alphabet without I, L, O and U,
 * so nothing reads as a 1 or a 0, and typing i, l or o still decodes.
 *
 * Nothing about the code itself reaches the relay. HKDF derives two things
 * from it: the blob id, which names the blob on the relay and is all the
 * relay ever sees, and the key the notes are encrypted with. Neither can be
 * turned back into the code, and the id gives no way to the key
 * (docs/sync-design.md, Step 6).
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const SEED_BYTES = 15;
export const CODE_LENGTH = (SEED_BYTES * 8) / 5;
const GROUP = 4;

const BLOB_ID_INFO = "fukidashi-sync/blob-id";
const KEY_INFO = "fukidashi-sync/key";

/** Thrown for text that is not a sync code, or a code that names nothing. */
export class SyncCodeError extends Error {}

function encodeBase32(bytes: Uint8Array): string {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function decodeBase32(text: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(Math.floor((text.length * 5) / 8));
  let bits = 0;
  let value = 0;
  let at = 0;
  for (const char of text) {
    value = (value << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes[at++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return bytes;
}

/** Writes a raw code the way it is shown: `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`. */
export function formatSyncCode(raw: string): string {
  return raw.match(new RegExp(`.{1,${GROUP}}`, "g"))?.join("-") ?? raw;
}

/**
 * Reads a code the way a person typed it — any case, with or without the
 * dashes, with the letters Crockford's alphabet forgives — back to its raw
 * 24 characters, or null when it is not a code at all.
 */
export function normalizeSyncCode(text: string): string | null {
  const raw = text
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
  if (raw.length !== CODE_LENGTH) return null;
  for (const char of raw) if (!ALPHABET.includes(char)) return null;
  return raw;
}

export function generateSyncCode(): string {
  return formatSyncCode(encodeBase32(crypto.getRandomValues(new Uint8Array(SEED_BYTES))));
}

export interface RelayIdentity {
  /** What names the blob on the relay: 32 hex digits, public. */
  blobId: string;
  /** What the notes are encrypted with; the relay never sees it. */
  key: SyncKey;
}

async function hkdf(seed: CryptoKey, info: string, bits: number): Promise<Uint8Array> {
  const derived = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: utf8(info) },
    seed,
    bits,
  );
  return new Uint8Array(derived);
}

/** The blob id and the key a code stands for. Throws `SyncCodeError` for text that is not a code. */
export async function deriveRelayIdentity(code: string): Promise<RelayIdentity> {
  const raw = normalizeSyncCode(code);
  if (raw === null) throw new SyncCodeError("That is not a sync code.");

  const seed = await crypto.subtle.importKey("raw", decodeBase32(raw), "HKDF", false, [
    "deriveBits",
  ]);
  return {
    blobId: toHex(await hkdf(seed, BLOB_ID_INFO, 128)),
    key: { kdf: { name: "HKDF-SHA256" }, key: toBase64(await hkdf(seed, KEY_INFO, 256)) },
  };
}
