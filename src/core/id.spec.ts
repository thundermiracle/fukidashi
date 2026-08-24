import { afterEach, describe, expect, it, vi } from "vitest";
import { generateId } from "./id";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generateId", () => {
  it("uses crypto.randomUUID when it is available", () => {
    const randomUUID = vi.fn(() => "11111111-2222-4333-8444-555555555555");
    vi.stubGlobal("crypto", { randomUUID, getRandomValues: globalThis.crypto.getRandomValues });

    expect(generateId()).toBe("11111111-2222-4333-8444-555555555555");
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("falls back to getRandomValues on insecure pages, where randomUUID is undefined", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0xab);
        return bytes;
      },
    });

    expect(generateId()).toMatch(UUID_PATTERN);
  });

  it("still produces a unique id when no web crypto exists at all", () => {
    vi.stubGlobal("crypto", undefined);

    const ids = new Set(Array.from({ length: 50 }, generateId));

    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(UUID_PATTERN);
  });
});
