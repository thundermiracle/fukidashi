import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSyncPayload,
  mergeSyncPages,
  type Note,
  type SyncPage,
  type SyncPayload,
  TOMBSTONE_TTL_MS,
} from "@/core";
import { createFakeChromeStorage } from "@/testing/fakeChromeStorage";
import { createFakeDrive } from "@/testing/fakeDrive";
import { createFakeSyncBackend } from "@/testing/fakeSyncBackend";
import { deleteNote, loadNotes, notesKey, saveNote, savePageTitle } from "../notes";
import { type SyncBackend, SyncConflictError, SyncSignedOutError } from "./backend";
import { createDriveApi } from "./drive/api";
import { createDriveBackend, DRIVE_FILE_NAME } from "./drive/backend";
import { syncOnce } from "./engine";
import { collectSyncPages } from "./storage";

const PAGE = "https://example.com/docs";
const OTHER = "https://other.test/guide";

function makeNote(id: string, createdAt: number, comment = ""): Note {
  return {
    id,
    comment,
    color: "yellow",
    anchor: { exact: `quote ${id}`, prefix: "", suffix: "", start: 0 },
    createdAt,
    updatedAt: createdAt,
  };
}

/** A remote two devices share, and a way for a test to read what it holds. */
interface Remote {
  /** The backend one device talks through; each device gets its own. */
  backendFor(device: string): SyncBackend;
  /** The pages the remote copy holds, or undefined while there is none. */
  pages(): SyncPage[] | undefined;
}

function fakeBackendRemote(): Remote {
  const backend = createFakeSyncBackend();
  return { backendFor: () => backend, pages: () => backend.snapshot()?.payload.pages };
}

/** Google Drive as the fake stands in for it, with a client per device. */
function driveRemote(): Remote & { drive: ReturnType<typeof createFakeDrive> } {
  const drive = createFakeDrive();
  const backends = new Map<string, SyncBackend>();
  return {
    drive,
    backendFor: (device) => {
      let backend = backends.get(device);
      if (!backend) {
        drive.accept(`token-${device}`);
        const bearer = {
          current: async () => `token-${device}`,
          renewed: async () => {
            throw new SyncSignedOutError();
          },
        };
        backend = createDriveBackend(createDriveApi(bearer, drive.fetch));
        backends.set(device, backend);
      }
      return backend;
    },
    pages: () => {
      const text = drive.content(DRIVE_FILE_NAME);
      return text === undefined ? undefined : (JSON.parse(text) as SyncPayload).pages;
    },
  };
}

/**
 * Two devices, each with their own storage, sharing one remote — the setup
 * the engine actually has to work in.
 */
function createDevices(remote: Remote) {
  const devices = {
    desktop: createFakeChromeStorage(),
    laptop: createFakeChromeStorage(),
  };

  /** Runs `work` as if it happened on that device. */
  const on = async <T>(name: keyof typeof devices, work: () => Promise<T>): Promise<T> => {
    vi.stubGlobal("chrome", devices[name].chrome);
    return work();
  };

  return {
    remote,
    devices,
    on,
    sync: (name: keyof typeof devices, now?: number) =>
      on(name, () => syncOnce(remote.backendFor(name), now)),
  };
}

let single: ReturnType<typeof createFakeChromeStorage>;

beforeEach(() => {
  single = createFakeChromeStorage();
  vi.stubGlobal("chrome", single.chrome);
});

describe("syncOnce", () => {
  it("pushes what this device has when the remote is empty", async () => {
    const backend = createFakeSyncBackend();
    await saveNote(PAGE, makeNote("a", 100));

    const result = await syncOnce(backend);

    expect(result).toEqual({ changedLocally: false, pushed: true });
    expect(backend.snapshot()?.payload.pages).toMatchObject([{ url: PAGE, notes: [{ id: "a" }] }]);
  });

  it("takes in what the remote has and this device does not", async () => {
    const backend = createFakeSyncBackend();
    backend.put(createSyncPayload([{ url: OTHER, notes: [makeNote("b", 100, "elsewhere")] }], 0));

    const result = await syncOnce(backend);

    expect(result.changedLocally).toBe(true);
    await expect(loadNotes(OTHER)).resolves.toMatchObject([{ comment: "elsewhere" }]);
  });

  it("writes nothing on either side when the two already agree", async () => {
    const backend = createFakeSyncBackend();
    await saveNote(PAGE, makeNote("a", 100));
    await syncOnce(backend);

    const listener = vi.fn();
    single.listeners.add(listener);
    const result = await syncOnce(backend);

    expect(result).toEqual({ changedLocally: false, pushed: false });
    expect(listener).not.toHaveBeenCalled();
    expect(backend.snapshot()?.version).toBe("v1");
  });

  it("keeps an edit made while the merge was being applied", async () => {
    const backend = createFakeSyncBackend();
    backend.put(createSyncPayload([{ url: OTHER, notes: [makeNote("b", 100)] }], 0));
    await saveNote(PAGE, makeNote("a", 100, "first"));

    // The user edits the note after the sync has read local storage and
    // before it writes the merge back.
    const realPull = backend.pull.bind(backend);
    backend.pull = async () => {
      const snapshot = await realPull();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await saveNote(PAGE, { ...makeNote("a", 100, "edited meanwhile"), updatedAt: 200 });
      return snapshot;
    };
    await syncOnce(backend);

    await expect(loadNotes(PAGE)).resolves.toMatchObject([{ comment: "edited meanwhile" }]);
    // The push carried what was merged; the edit follows with the next sync.
    const pushed = (comment: string) =>
      expect(
        backend.snapshot()?.payload.pages.find((page) => page.url === PAGE)?.notes,
      ).toMatchObject([{ comment }]);
    pushed("first");

    backend.pull = realPull;
    await syncOnce(backend);
    pushed("edited meanwhile");
  });

  it("does not read the remote when nothing moved since the last round", async () => {
    const backend = createFakeSyncBackend();
    await saveNote(PAGE, makeNote("a", 100));
    await syncOnce(backend);
    const pulls = backend.pulls();

    await expect(syncOnce(backend)).resolves.toEqual({ changedLocally: false, pushed: false });

    expect(backend.pulls()).toBe(pulls);
    expect(backend.peeks()).toBe(1);
  });

  it("pushes without reading when only this device changed", async () => {
    const backend = createFakeSyncBackend();
    await saveNote(PAGE, makeNote("a", 100));
    await syncOnce(backend);
    const pulls = backend.pulls();

    await saveNote(PAGE, makeNote("b", 200));
    await expect(syncOnce(backend)).resolves.toEqual({ changedLocally: false, pushed: true });

    expect(backend.pulls()).toBe(pulls);
    expect(backend.snapshot()?.payload.pages[0].notes).toHaveLength(2);
  });

  it("reads the remote once it moved", async () => {
    const backend = createFakeSyncBackend();
    await saveNote(PAGE, makeNote("a", 100));
    await syncOnce(backend);
    const pulls = backend.pulls();

    // Another device pushed in the meantime.
    backend.put(createSyncPayload([{ url: OTHER, notes: [makeNote("b", 100)] }], 0));
    const result = await syncOnce(backend);

    expect(result.changedLocally).toBe(true);
    expect(backend.pulls()).toBe(pulls + 1);
    await expect(loadNotes(OTHER)).resolves.toMatchObject([{ id: "b" }]);
  });

  it("reads the remote back after a push that took in another device's notes", async () => {
    const backend = createFakeSyncBackend();
    await saveNote(PAGE, makeNote("a", 100));
    await syncOnce(backend);
    await saveNote(PAGE, makeNote("c", 300));

    // The backend found another device's write under its own, wrote the
    // union, and reported a conflict — the way the Drive backend does.
    const realPush = backend.push.bind(backend);
    let repaired = false;
    backend.push = async (payload, baseVersion) => {
      if (repaired) return realPush(payload, baseVersion);
      repaired = true;
      const theirs = [{ url: PAGE, notes: [makeNote("b", 200)] }];
      backend.put(createSyncPayload(mergeSyncPages(payload.pages, theirs), 0));
      throw new SyncConflictError();
    };

    await expect(syncOnce(backend)).resolves.toEqual({ changedLocally: true, pushed: false });

    await expect(loadNotes(PAGE)).resolves.toMatchObject([{ id: "a" }, { id: "b" }, { id: "c" }]);
    // With the union read back, the next round has nothing to do.
    await expect(syncOnce(backend)).resolves.toEqual({ changedLocally: false, pushed: false });
  });

  it("merges again and retries when another device pushed in between", async () => {
    const backend = createFakeSyncBackend();
    await saveNote(PAGE, makeNote("a", 100));

    // The first push lands on a remote that moved on a moment earlier.
    const realPush = backend.push.bind(backend);
    let firstTry = true;
    backend.push = async (payload, baseVersion) => {
      if (firstTry) {
        firstTry = false;
        backend.put(createSyncPayload([{ url: OTHER, notes: [makeNote("b", 100)] }], 0));
        throw new SyncConflictError();
      }
      return realPush(payload, baseVersion);
    };

    const result = await syncOnce(backend);

    expect(result.pushed).toBe(true);
    expect(backend.snapshot()?.payload.pages.map((page) => page.url)).toEqual([PAGE, OTHER]);
    await expect(loadNotes(OTHER)).resolves.toMatchObject([{ id: "b" }]);
  });

  it("gives up when the remote keeps moving", async () => {
    const backend = createFakeSyncBackend();
    backend.push = async () => {
      throw new SyncConflictError();
    };
    await saveNote(PAGE, makeNote("a", 100));

    await expect(syncOnce(backend)).rejects.toThrow(SyncConflictError);
  });
});

describe.each([
  ["a fake backend", fakeBackendRemote],
  ["Google Drive", driveRemote],
])("two devices through %s", (_name, createRemote) => {
  it("end up with the same notes", async () => {
    const { remote, on, sync } = createDevices(createRemote());

    await on("desktop", () => saveNote(PAGE, makeNote("a", 100, "from the desktop")));
    await on("laptop", () => saveNote(OTHER, makeNote("b", 100, "from the laptop")));

    await sync("desktop");
    await sync("laptop");
    await sync("desktop");

    const desktop = await on("desktop", collectSyncPages);
    const laptop = await on("laptop", collectSyncPages);
    expect(desktop).toEqual(laptop);
    expect(desktop.map((page) => page.url)).toEqual([PAGE, OTHER]);
    expect(remote.pages()).toEqual(desktop);
  });

  it("carries a deletion across instead of undoing it", async () => {
    const { on, sync } = createDevices(createRemote());

    await on("desktop", () => saveNote(PAGE, makeNote("a", 100)));
    await sync("desktop");
    await sync("laptop");
    await expect(on("laptop", () => loadNotes(PAGE))).resolves.toHaveLength(1);

    await on("desktop", () => deleteNote(PAGE, "a"));
    await sync("desktop");
    await sync("laptop");

    await expect(on("laptop", () => loadNotes(PAGE))).resolves.toEqual([]);
    // The device that deleted it does not get it back on the next round either.
    await sync("desktop");
    await expect(on("desktop", () => loadNotes(PAGE))).resolves.toEqual([]);
  });

  it("lets a deletion go from both sides once its tombstone has done its job", async () => {
    const { remote, devices, on, sync } = createDevices(createRemote());

    await on("desktop", async () => {
      await saveNote(PAGE, makeNote("a", 100));
      await deleteNote(PAGE, "a");
    });
    await sync("desktop");
    await sync("laptop");
    expect(devices.laptop.data[notesKey(PAGE)]).toMatchObject([{ deletedAt: expect.any(Number) }]);

    const later = Date.now() + TOMBSTONE_TTL_MS;
    await sync("desktop", later);
    await sync("laptop", later);

    expect(devices.desktop.data[notesKey(PAGE)]).toBeUndefined();
    expect(devices.laptop.data[notesKey(PAGE)]).toBeUndefined();
    expect(remote.pages()).toEqual([]);
  });

  it("keeps the edit written last when both changed one note", async () => {
    const { on, sync } = createDevices(createRemote());

    await on("desktop", () => saveNote(PAGE, makeNote("a", 100)));
    await sync("desktop");
    await sync("laptop");

    await on("desktop", () =>
      saveNote(PAGE, { ...makeNote("a", 100, "desktop edit"), updatedAt: 500 }),
    );
    await on("laptop", () =>
      saveNote(PAGE, { ...makeNote("a", 100, "laptop edit"), updatedAt: 900 }),
    );

    await sync("desktop");
    await sync("laptop");
    await sync("desktop");

    await expect(on("desktop", () => loadNotes(PAGE))).resolves.toMatchObject([
      { comment: "laptop edit" },
    ]);
  });

  it("settles after one round, with nothing left to write", async () => {
    const { remote, on, sync } = createDevices(createRemote());

    await on("desktop", async () => {
      await saveNote(PAGE, makeNote("a", 100));
      await savePageTitle(PAGE, "Docs");
    });

    await sync("desktop");
    await sync("laptop");
    await sync("desktop");

    expect(await sync("laptop")).toEqual({ changedLocally: false, pushed: false });
    expect(await sync("desktop")).toEqual({ changedLocally: false, pushed: false });
    expect(remote.pages()?.[0].title).toMatchObject({ text: "Docs" });
  });
});

describe("an idle round on Google Drive", () => {
  it("costs one request, the one that asks for the version", async () => {
    const remote = driveRemote();
    const { on, sync } = createDevices(remote);
    await on("desktop", () => saveNote(PAGE, makeNote("a", 100)));
    await sync("desktop");
    await sync("laptop");
    await sync("desktop");
    const before = remote.drive.requests.length;

    await expect(sync("desktop")).resolves.toEqual({ changedLocally: false, pushed: false });

    const added = remote.drive.requests.slice(before);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ method: "GET" });
    expect(new URL(added[0].url).pathname).toBe("/drive/v3/files");
  });
});
