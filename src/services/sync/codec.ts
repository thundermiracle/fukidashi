import { parseSyncPayload, type SyncPayload, SyncPayloadError, SyncVersionError } from "@/core";
import type { SyncKey } from "./key";

/** What a codec read, and whether it would have written it that way. */
export interface DecodedPayload {
  payload: SyncPayload;
  /**
   * True when `encode` would write these notes in another form than the
   * text came in — as plaintext where this codec encrypts, or the other way
   * round. The remote copy is then worth writing back as it stands, so that
   * a passphrase set on this device takes effect without waiting for an edit.
   */
  rewrite: boolean;
}

/**
 * How a payload is written to a backend and read back. The default is the
 * JSON an export writes. End-to-end encryption is another codec rather than
 * another backend (docs/sync-design.md, 3.4): the backend never needs to
 * know what it is carrying.
 */
export interface PayloadCodec {
  encode(payload: SyncPayload): Promise<string>;
  decode(text: string): Promise<DecodedPayload>;
}

/**
 * Thrown when the remote copy is encrypted and this device cannot read it:
 * no passphrase has been entered here, or not the one the copy was written
 * with. The scheduler then waits for the settings page, as it does for a
 * sign-in.
 */
export class SyncPassphraseError extends Error {
  constructor(message = "The copy is encrypted with a passphrase this browser does not have.") {
    super(message);
  }
}

/**
 * The encrypted form: AES-256-GCM over the JSON payload, the key derived
 * from the passphrase with PBKDF2-SHA256. The salt travels with the
 * ciphertext, so a browser given the same passphrase derives the same key
 * (docs/sync-design.md, 3.4). Base64 keeps the file JSON, at the cost of a
 * third more bytes; `MAX_UPLOAD_BYTES` bites earlier as a result.
 */
export interface Envelope {
  version: number;
  cipher: string;
  kdf: { name: string; iterations: number; salt: string };
  iv: string;
  ciphertext: string;
}

export const ENVELOPE_VERSION = 1;
const CIPHER = "AES-256-GCM";
const KDF = "PBKDF2-SHA256";
/** OWASP's 2023 figure for PBKDF2-HMAC-SHA256; about half a second on a laptop. */
export const PBKDF2_ITERATIONS = 600_000;
/**
 * The most an envelope may ask for. The count is read from the copy when a
 * passphrase is set, and a copy that asked for billions would keep the
 * settings page busy for hours.
 */
const MAX_PBKDF2_ITERATIONS = 10_000_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    throw new SyncPayloadError("The remote copy is not readable.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new SyncPayloadError("The remote copy is not readable JSON.");
  }
}

/** Whether `value` is an envelope at all — of any version, readable or not. */
export function isEnvelope(value: unknown): boolean {
  return (
    isRecord(value) && typeof value.cipher === "string" && typeof value.ciphertext === "string"
  );
}

/** Reads an envelope back, refusing one this version cannot open. */
export function readEnvelope(value: unknown): Envelope {
  if (!isEnvelope(value) || !isRecord(value) || typeof value.version !== "number") {
    throw new SyncPayloadError("The remote copy is not readable.");
  }
  if (value.version > ENVELOPE_VERSION) {
    throw new SyncVersionError("The remote copy was encrypted by a newer version of Fukidashi.");
  }

  const { cipher, kdf, iv, ciphertext } = value;
  if (
    cipher !== CIPHER ||
    !isRecord(kdf) ||
    kdf.name !== KDF ||
    typeof kdf.iterations !== "number" ||
    !Number.isInteger(kdf.iterations) ||
    kdf.iterations < 1 ||
    kdf.iterations > MAX_PBKDF2_ITERATIONS ||
    typeof kdf.salt !== "string" ||
    typeof iv !== "string" ||
    typeof ciphertext !== "string"
  ) {
    throw new SyncPayloadError("The remote copy is not readable.");
  }

  return {
    version: value.version,
    cipher,
    kdf: { name: kdf.name, iterations: kdf.iterations, salt: kdf.salt },
    iv,
    ciphertext,
  };
}

/** Reads `text` as an envelope, or returns null when it is something else. */
export function readEnvelopeIfAny(text: string): Envelope | null {
  const value = parseJson(text);
  return isEnvelope(value) ? readEnvelope(value) : null;
}

export function randomSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

/**
 * Turns a passphrase into a key. The passphrase is NFKC-normalized first,
 * so that the same characters typed through different keyboards come out
 * as the same key. Slow by design: `iterations` is only lowered by tests.
 */
export async function deriveSyncKey(
  passphrase: string,
  salt: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<SyncKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromBase64(salt), iterations },
    material,
    256,
  );
  return { salt, iterations, key: toBase64(new Uint8Array(bits)) };
}

function importAesKey(key: SyncKey): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", fromBase64(key.key), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptPayload(payload: SyncPayload, key: SyncKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await importAesKey(key),
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const envelope: Envelope = {
    version: ENVELOPE_VERSION,
    cipher: CIPHER,
    kdf: { name: KDF, iterations: key.iterations, salt: key.salt },
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(envelope);
}

/**
 * Opens an envelope with `key`. A key derived with another salt or another
 * number of rounds cannot have come from the same passphrase, and one that
 * fails to decrypt did not either — all read as the wrong passphrase.
 */
export async function decryptEnvelope(envelope: Envelope, key: SyncKey): Promise<SyncPayload> {
  const mismatch = new SyncPassphraseError(
    "The passphrase on this browser is not the one the copy was encrypted with.",
  );
  if (envelope.kdf.salt !== key.salt || envelope.kdf.iterations !== key.iterations) {
    throw mismatch;
  }

  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(envelope.iv) },
      await importAesKey(key),
      fromBase64(envelope.ciphertext),
    );
  } catch {
    throw mismatch;
  }
  return parseSyncPayload(parseJson(new TextDecoder().decode(plain)));
}

/**
 * Where a codec's keys come from — looked up on every call rather than
 * captured, so a passphrase set on the settings page reaches a backend the
 * scheduler already holds, the way a fresh sign-in does. `read` opens
 * envelopes; `write` is what new copies are encrypted with, or null for
 * plaintext. They differ only while a passphrase is being removed.
 */
export interface CodecKeys {
  read(): Promise<SyncKey | null>;
  write(): Promise<SyncKey | null>;
}

/**
 * The one codec, plain or encrypting by its keys. It reads both forms
 * whenever it can: a plaintext copy is what a device without a passphrase
 * wrote, and is taken in and written back encrypted (docs/sync-design.md,
 * 3.4). An envelope with no key to open it is reported as such, distinct
 * from a copy that is broken.
 */
export function createSyncCodec(keys: CodecKeys): PayloadCodec {
  return {
    async encode(payload) {
      const key = await keys.write();
      return key ? encryptPayload(payload, key) : JSON.stringify(payload);
    },

    async decode(text) {
      const value = parseJson(text);
      const encrypts = (await keys.write()) !== null;
      if (!isEnvelope(value)) return { payload: parseSyncPayload(value), rewrite: encrypts };

      const envelope = readEnvelope(value);
      const key = await keys.read();
      if (!key) throw new SyncPassphraseError();
      return { payload: await decryptEnvelope(envelope, key), rewrite: !encrypts };
    },
  };
}

const noKey = async () => null;

/** Plain JSON in and out; an encrypted copy is reported, not read. */
export const jsonCodec: PayloadCodec = createSyncCodec({ read: noKey, write: noKey });
