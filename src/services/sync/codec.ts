import { parseSyncPayload, type SyncPayload, SyncPayloadError, SyncVersionError } from "@/core";
import { fromBase64, toBase64, utf8 } from "./bytes";
import { PBKDF2_ITERATIONS, readSyncKdf, type SyncKdf, type SyncKey, sameSyncKdf } from "./key";

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
 * from a passphrase with PBKDF2-SHA256 or from a sync code with HKDF. How
 * it was derived travels with the ciphertext, so a browser given the same
 * secret derives the same key (docs/sync-design.md, 3.4). Base64 keeps the
 * file JSON, at the cost of a third more bytes; the backends' size caps
 * bite earlier as a result.
 */
export interface Envelope {
  version: number;
  cipher: string;
  kdf: SyncKdf;
  iv: string;
  ciphertext: string;
}

export const ENVELOPE_VERSION = 1;
const CIPHER = "AES-256-GCM";
const SALT_BYTES = 16;
const IV_BYTES = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

  const { cipher, iv, ciphertext } = value;
  const kdf = readSyncKdf(value.kdf);
  if (cipher !== CIPHER || !kdf || typeof iv !== "string" || typeof ciphertext !== "string") {
    throw new SyncPayloadError("The remote copy is not readable.");
  }

  return { version: value.version, cipher, kdf, iv, ciphertext };
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
    utf8(passphrase.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromBase64(salt), iterations },
    material,
    256,
  );
  return { kdf: { name: "PBKDF2-SHA256", salt, iterations }, key: toBase64(new Uint8Array(bits)) };
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
    utf8(JSON.stringify(payload)),
  );
  const envelope: Envelope = {
    version: ENVELOPE_VERSION,
    cipher: CIPHER,
    kdf: key.kdf,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(envelope);
}

/**
 * Opens an envelope with `key`. A key derived another way — from another
 * salt, another number of rounds, or another kind of secret — cannot have
 * come from the same secret, and one that fails to decrypt did not either:
 * all read as the wrong passphrase.
 */
export async function decryptEnvelope(envelope: Envelope, key: SyncKey): Promise<SyncPayload> {
  const mismatch = new SyncPassphraseError(
    "The passphrase on this browser is not the one the copy was encrypted with.",
  );
  if (!sameSyncKdf(envelope.kdf, key.kdf)) throw mismatch;

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

export interface CodecOptions {
  /**
   * Whether the notes may be plain at all, read or written. On Drive they
   * may: a plaintext copy is what a device without a passphrase wrote, and
   * is taken in and written back encrypted. On the relay they may not:
   * nothing there was ever plain, and the blob id is the only access
   * control, so unauthenticated JSON is not to be trusted with the notes —
   * and with no key to write with, nothing is written at all.
   */
  allowPlaintext?: boolean;
}

/**
 * The one codec, plain or encrypting by its keys. It reads both forms
 * whenever it can (docs/sync-design.md, 3.4). An envelope with no key to
 * open it is reported as such, distinct from a copy that is broken.
 */
export function createSyncCodec(keys: CodecKeys, options: CodecOptions = {}): PayloadCodec {
  const allowPlaintext = options.allowPlaintext ?? true;

  return {
    async encode(payload) {
      const key = await keys.write();
      if (key) return encryptPayload(payload, key);
      if (!allowPlaintext) {
        throw new SyncPassphraseError("There is no key to encrypt the notes with.");
      }
      return JSON.stringify(payload);
    },

    async decode(text) {
      const value = parseJson(text);
      const encrypts = (await keys.write()) !== null;
      if (!isEnvelope(value)) {
        if (!allowPlaintext) throw new SyncPayloadError("The remote copy is not encrypted.");
        return { payload: parseSyncPayload(value), rewrite: encrypts };
      }

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
