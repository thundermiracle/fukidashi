import { describe, expect, it } from "vitest";
import {
  CODE_LENGTH,
  deriveRelayIdentity,
  formatSyncCode,
  generateSyncCode,
  normalizeSyncCode,
  SyncCodeError,
} from "./code";

const SHAPE = /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){5}$/;

describe("a sync code", () => {
  it("is 24 characters in six groups, and never the same twice", () => {
    const code = generateSyncCode();

    expect(code).toMatch(SHAPE);
    expect(normalizeSyncCode(code)).toHaveLength(CODE_LENGTH);
    expect(generateSyncCode()).not.toBe(code);
  });

  it("reads back however it was typed", () => {
    const code = generateSyncCode();
    const raw = normalizeSyncCode(code);

    expect(normalizeSyncCode(code.toLowerCase())).toBe(raw);
    expect(normalizeSyncCode(code.replaceAll("-", " "))).toBe(raw);
    expect(normalizeSyncCode(` ${code.replaceAll("-", "")} `)).toBe(raw);
    expect(formatSyncCode(raw ?? "")).toBe(code);
  });

  it("forgives the letters that look like digits", () => {
    const raw = "0123456789ABCDEFGHJKMNPQ";

    expect(normalizeSyncCode("oi23456789abcdefghjkmnpq")).toBe(raw);
    expect(normalizeSyncCode("Ol23456789ABCDEFGHJKMNPQ")).toBe(raw);
  });

  it("refuses text that is not a code", () => {
    expect(normalizeSyncCode("")).toBeNull();
    expect(normalizeSyncCode("ABCD-EFGH")).toBeNull();
    expect(normalizeSyncCode("0123456789ABCDEFGHJKMNPU")).toBeNull();
    expect(normalizeSyncCode(`${generateSyncCode()}A`)).toBeNull();
  });
});

describe("deriveRelayIdentity", () => {
  it("derives the same blob id and key from the same code, however it was typed", async () => {
    const code = generateSyncCode();

    const identity = await deriveRelayIdentity(code);
    expect(identity.blobId).toMatch(/^[0-9a-f]{32}$/);
    expect(identity.key.kdf).toEqual({ name: "HKDF-SHA256" });
    expect(atob(identity.key.key)).toHaveLength(32);
    await expect(deriveRelayIdentity(code.toLowerCase().replaceAll("-", ""))).resolves.toEqual(
      identity,
    );
  });

  it("derives something else from another code", async () => {
    const one = await deriveRelayIdentity(generateSyncCode());
    const two = await deriveRelayIdentity(generateSyncCode());

    expect(one.blobId).not.toBe(two.blobId);
    expect(one.key.key).not.toBe(two.key.key);
  });

  it("gives the blob id no way to the key", async () => {
    const { blobId, key } = await deriveRelayIdentity(generateSyncCode());

    expect(btoa(blobId)).not.toBe(key.key);
    expect(key.key).not.toContain(blobId);
  });

  it("refuses text that is not a code", async () => {
    await expect(deriveRelayIdentity("not a code")).rejects.toThrow(SyncCodeError);
  });
});
