import { beforeEach, describe, expect, it } from "vitest";
import { createSyncPayload, type Note, SyncPayloadError, SyncVersionError } from "@/core";
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
    await expect(createDriveBackend(createApi()).pull()).resolves.toBeNull();
  });

  it("creates the file on the first push and reads it back", async () => {
    const backend = createDriveBackend(createApi());

    await expect(backend.push(payload("one"), null)).resolves.toBe("1");

    await expect(backend.pull()).resolves.toEqual({ payload: payload("one"), version: "1" });
    expect(drive.content(DRIVE_FILE_NAME)).toBe(JSON.stringify(payload("one")));
  });

  it("writes over the file it read, and the version moves on", async () => {
    const backend = createDriveBackend(createApi());
    await backend.push(payload("one"), null);
    await backend.pull();

    await expect(backend.push(payload("two"), "1")).resolves.toBe("2");

    await expect(backend.pull()).resolves.toMatchObject({ payload: payload("two"), version: "2" });
  });

  it("refuses to write over a version it did not read", async () => {
    const desktop = createDriveBackend(createApi());
    const laptop = createDriveBackend(createApi());
    await desktop.push(payload("one"), null);
    await desktop.pull();
    await laptop.pull();
    await laptop.push(payload("laptop"), "1");

    await expect(desktop.push(payload("desktop"), "1")).rejects.toThrow(SyncConflictError);

    expect(drive.content(DRIVE_FILE_NAME)).toBe(JSON.stringify(payload("laptop")));
  });

  it("refuses to write when the file went away since it was read", async () => {
    const backend = createDriveBackend(createApi());
    await backend.push(payload("one"), null);
    await backend.pull();
    drive.files.clear();

    await expect(backend.push(payload("two"), "1")).rejects.toThrow(SyncConflictError);
  });

  it("keeps one file when two devices created it at once, the same one everywhere", async () => {
    drive.plant(DRIVE_FILE_NAME, JSON.stringify(payload("first")));
    drive.plant(DRIVE_FILE_NAME, JSON.stringify(payload("second")));

    const desktop = await createDriveBackend(createApi()).pull();
    const laptop = await createDriveBackend(createApi()).pull();

    expect(desktop).toEqual({ payload: payload("first"), version: "1" });
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
    await expect(backend.pull()).resolves.toMatchObject({ version: "1" });
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
