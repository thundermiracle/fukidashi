import { beforeEach, describe, expect, it } from "vitest";
import { createFakeDrive } from "@/testing/fakeDrive";
import { SyncSignedOutError } from "../backend";
import { createDriveApi, DriveApiError, MAX_UPLOAD_BYTES, PayloadTooLargeError } from "./api";

let drive: ReturnType<typeof createFakeDrive>;

/** A client whose bearer is whatever the test says, renewed to `renewed` on demand. */
function createApi(current: string, renewed?: string) {
  return createDriveApi(
    {
      current: async () => current,
      renewed: async () => {
        if (renewed === undefined) throw new SyncSignedOutError();
        return renewed;
      },
    },
    drive.fetch,
  );
}

beforeEach(() => {
  drive = createFakeDrive();
});

describe("createDriveApi", () => {
  it("creates, finds, reads, updates and deletes a file in the app folder", async () => {
    drive.accept("tok");
    const api = createApi("tok");

    const created = await api.create("notes.json", '{"a":1}');
    expect(created.version).toBe("1");
    await expect(api.find("notes.json")).resolves.toEqual([
      expect.objectContaining({ id: created.id }),
    ]);
    await expect(api.find("other.json")).resolves.toEqual([]);
    await expect(api.read(created.id)).resolves.toBe('{"a":1}');

    const updated = await api.update(created.id, '{"a":2}');
    expect(updated.version).toBe("2");
    await expect(api.read(created.id)).resolves.toBe('{"a":2}');
    await expect(api.get(created.id)).resolves.toMatchObject({ id: created.id, version: "2" });

    await api.delete(created.id);
    await expect(api.find("notes.json")).resolves.toEqual([]);
  });

  it("looks in the app folder alone", async () => {
    drive.accept("tok");

    await createApi("tok").find("notes.json");

    const url = new URL(drive.requests[0].url);
    expect(url.searchParams.get("spaces")).toBe("appDataFolder");
    expect(url.searchParams.get("q")).toBe("name = 'notes.json' and trashed = false");
  });

  it("sends the request once more with a renewed token when Google refuses the first", async () => {
    drive.accept("fresh");

    await expect(createApi("stale", "fresh").find("notes.json")).resolves.toEqual([]);

    expect(drive.requests).toHaveLength(2);
  });

  it("gives up after one renewal", async () => {
    await expect(createApi("stale", "also stale").find("notes.json")).rejects.toMatchObject({
      status: 401,
    });
    expect(drive.requests).toHaveLength(2);
  });

  it("passes on that a sign-in is needed when there is nothing to renew with", async () => {
    await expect(createApi("stale").find("notes.json")).rejects.toThrow(SyncSignedOutError);
  });

  it("says what Drive answered when a request fails", async () => {
    drive.accept("tok");

    const failure = await createApi("tok")
      .get("missing")
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(DriveApiError);
    expect(failure).toMatchObject({ status: 404, message: "File not found" });
  });

  it("falls back on the status line when Drive's answer is not JSON", async () => {
    const down: typeof fetch = async () =>
      new Response("boom", { status: 502, statusText: "Bad Gateway" });
    const api = createDriveApi({ current: async () => "tok", renewed: async () => "tok" }, down);

    await expect(api.find("notes.json")).rejects.toMatchObject({
      status: 502,
      message: "Google Drive answered 502 Bad Gateway.",
    });
  });

  it("refuses an upload Drive would not take, without sending it", async () => {
    drive.accept("tok");
    const api = createApi("tok");
    const big = "x".repeat(MAX_UPLOAD_BYTES + 1);

    await expect(api.create("notes.json", big)).rejects.toThrow(PayloadTooLargeError);
    await expect(api.update("file-1", big)).rejects.toThrow(PayloadTooLargeError);
    expect(drive.requests).toEqual([]);
  });
});
