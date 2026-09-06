import { beforeEach, describe, expect, it } from "vitest";
import {
  createSyncPayload,
  type Note,
  type SyncPayload,
  SyncPayloadError,
  SyncVersionError,
} from "@/core";
import { createFakeDrive } from "@/testing/fakeDrive";
import { type SyncBackend, SyncConflictError, SyncSignedOutError } from "../backend";
import { createDriveApi, type DriveApi } from "./api";
import { createDriveBackend, DRIVE_FILE_NAME } from "./backend";

const PAGE = "https://example.com/docs";

function makeNote(id: string, comment: string): Note {
  return {
    id,
    comment,
    color: "yellow",
    anchor: { exact: `quote ${id}`, prefix: "", suffix: "", start: 0 },
    createdAt: 100,
    updatedAt: 100,
  };
}

/** A payload that reads as `comment`, so tests can tell copies apart. */
function payload(comment: string) {
  return createSyncPayload([{ url: PAGE, notes: [makeNote("a", comment)] }], 500);
}

/** A payload holding the notes with these ids, to see which ones survive a race. */
function payloadWith(...ids: string[]) {
  return createSyncPayload(
    [{ url: PAGE, notes: ids.map((id) => makeNote(id, `note ${id}`)) }],
    500,
  );
}

function idsOn(remote: string | undefined): string[] {
  const parsed = JSON.parse(remote ?? "") as SyncPayload;
  return parsed.pages[0].notes.map((note) => note.id);
}

let drive: ReturnType<typeof createFakeDrive>;

/** One device's client to the shared fake Drive. */
function createApi(): DriveApi {
  return createDriveApi(
    {
      current: async () => "tok",
      renewed: async () => {
        throw new SyncSignedOutError();
      },
    },
    drive.fetch,
  );
}

beforeEach(() => {
  drive = createFakeDrive();
  drive.accept("tok");
});

describe("createDriveBackend", () => {
  it("finds nothing in an empty app folder", async () => {
    const backend = createDriveBackend(createApi());

    await expect(backend.pull()).resolves.toBeNull();
    await expect(backend.peek?.()).resolves.toBeNull();
  });

  it("creates the file on the first push and reads it back", async () => {
    const backend = createDriveBackend(createApi());

    await expect(backend.push(payload("one"), null)).resolves.toBe("file-1:1");

    await expect(backend.pull()).resolves.toEqual({ payload: payload("one"), version: "file-1:1" });
    expect(drive.content(DRIVE_FILE_NAME)).toBe(JSON.stringify(payload("one")));
  });

  it("names the file in the version, from a peek as much as from a pull", async () => {
    const backend = createDriveBackend(createApi());
    await backend.push(payload("one"), null);
    const before = drive.requests.length;

    await expect(backend.peek?.()).resolves.toBe("file-1:1");

    // One request, the list — the content is never read.
    expect(drive.requests.slice(before)).toEqual([
      { method: "GET", url: expect.stringContaining("/drive/v3/files?") },
    ]);
  });

  it("writes over the file it read, and the version moves on", async () => {
    const backend = createDriveBackend(createApi());
    await backend.push(payload("one"), null);
    await backend.pull();

    await expect(backend.push(payload("two"), "file-1:1")).resolves.toBe("file-1:2");

    await expect(backend.pull()).resolves.toMatchObject({
      payload: payload("two"),
      version: "file-1:2",
    });
  });

  it("writes without a pull before it, given the version", async () => {
    await createDriveBackend(createApi()).push(payload("one"), null);

    // A new worker, with nothing remembered: the version says which file.
    await expect(createDriveBackend(createApi()).push(payload("two"), "file-1:1")).resolves.toBe(
      "file-1:2",
    );
  });

  it("refuses to write over a version it did not read", async () => {
    const desktop = createDriveBackend(createApi());
    const laptop = createDriveBackend(createApi());
    await desktop.push(payload("one"), null);
    await desktop.pull();
    await laptop.pull();
    await laptop.push(payload("laptop"), "file-1:1");

    await expect(desktop.push(payload("desktop"), "file-1:1")).rejects.toThrow(SyncConflictError);

    expect(drive.content(DRIVE_FILE_NAME)).toBe(JSON.stringify(payload("laptop")));
  });

  it("refuses to write when the file went away since it was read", async () => {
    const backend = createDriveBackend(createApi());
    await backend.push(payload("one"), null);
    await backend.pull();
    drive.files.clear();

    await expect(backend.push(payload("two"), "file-1:1")).rejects.toThrow(SyncConflictError);
  });

  it("takes in what another device wrote in the same moment, and says so", async () => {
    const laptop = createDriveBackend(createApi());
    const desktopApi = createApi();
    // The laptop's write lands between the desktop's check and its write —
    // the moment the version check cannot see.
    const racing: DriveApi = {
      ...desktopApi,
      async get(id) {
        const current = await desktopApi.get(id);
        await laptop.push(payloadWith("a", "b"), "file-1:1");
        return current;
      },
    };
    const desktop: SyncBackend = createDriveBackend(racing);
    await desktop.push(payloadWith("a"), null);

    await expect(desktop.push(payloadWith("a", "c"), "file-1:1")).rejects.toThrow(
      SyncConflictError,
    );

    // Nothing was lost: the remote holds both sides, and the next pull reads it.
    expect(idsOn(drive.content(DRIVE_FILE_NAME))).toEqual(["a", "b", "c"]);
    const read = await desktop.pull();
    expect(read?.payload.pages[0].notes.map((note) => note.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps one file when two devices created it at once, the same one everywhere", async () => {
    drive.plant(DRIVE_FILE_NAME, JSON.stringify(payload("first")));
    drive.plant(DRIVE_FILE_NAME, JSON.stringify(payload("second")));

    const desktop = await createDriveBackend(createApi()).pull();
    const laptop = await createDriveBackend(createApi()).pull();

    expect(desktop).toEqual({ payload: payload("first"), version: "file-1:1" });
    expect(laptop).toEqual(desktop);
    expect(drive.files.size).toBe(1);
  });

  it("reports a create that raced another device's as a conflict", async () => {
    const api = createApi();
    const racing: DriveApi = {
      ...api,
      async create(name, content) {
        const created = await api.create(name, content);
        drive.plant(name, JSON.stringify(payload("theirs")));
        return created;
      },
    };
    const backend: SyncBackend = createDriveBackend(racing);

    await expect(backend.push(payload("ours"), null)).rejects.toThrow(SyncConflictError);
    // The next pull settles on one of the two.
    await expect(backend.pull()).resolves.toMatchObject({ version: "file-1:1" });
    expect(drive.files.size).toBe(1);
  });

  it("hands on a copy it cannot read", async () => {
    drive.plant(DRIVE_FILE_NAME, "not json");

    await expect(createDriveBackend(createApi()).pull()).rejects.toThrow(SyncPayloadError);
  });

  it("hands on a copy written by a newer version", async () => {
    drive.plant(DRIVE_FILE_NAME, JSON.stringify({ version: 99, pages: [] }));

    await expect(createDriveBackend(createApi()).pull()).rejects.toThrow(SyncVersionError);
  });
});
