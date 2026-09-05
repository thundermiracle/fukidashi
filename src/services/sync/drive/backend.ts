import { type SyncBackend, SyncConflictError } from "../backend";
import { jsonCodec, type PayloadCodec } from "../codec";
import { type DriveApi, DriveApiError, type DriveFile } from "./api";

/** The one file the notes live in, inside the app folder nothing else can see. */
export const DRIVE_FILE_NAME = "fukidashi-notes.json";

/**
 * Drive's `version` is a number in a string. The highest is the copy that
 * has lived longest; ids break a tie the same way on every device.
 */
function byVersionDesc(a: DriveFile, b: DriveFile): number {
  return Number(b.version) - Number(a.version) || (a.id < b.id ? -1 : 1);
}

/**
 * The notes kept as one file in Google Drive's app folder. Drive has no
 * If-Match, so `push` checks the version right before writing — the closest
 * it can get to the optimistic locking the engine expects. What slips
 * through that gap is repaired on the losing device's next sync, because
 * the merge is last-write-wins and idempotent (docs/sync-design.md, 3.3).
 */
export function createDriveBackend(api: DriveApi, codec: PayloadCodec = jsonCodec): SyncBackend {
  /** The file the last pull found, which is the one a push writes to. */
  let fileId: string | null = null;

  return {
    async pull() {
      const [file, ...duplicates] = (await api.find(DRIVE_FILE_NAME)).sort(byVersionDesc);
      if (!file) {
        fileId = null;
        return null;
      }

      // Two devices creating the file in the same moment leave two. Every
      // device keeps the same one, so the others can go: whatever they held
      // is still on the device that wrote it, and comes back with its next push.
      for (const duplicate of duplicates) await api.delete(duplicate.id);

      fileId = file.id;
      return { payload: await codec.decode(await api.read(file.id)), version: file.version };
    },

    async push(payload, baseVersion) {
      const content = await codec.encode(payload);

      if (baseVersion === null) {
        const created = await api.create(DRIVE_FILE_NAME, content);
        // Another device may have created one in the same moment. Whichever
        // the next pull keeps, both devices will agree on.
        if ((await api.find(DRIVE_FILE_NAME)).length > 1) throw new SyncConflictError();
        fileId = created.id;
        return created.version;
      }

      // A push against a version comes after a pull that found the file.
      if (fileId === null) throw new SyncConflictError();

      let current: DriveFile;
      try {
        current = await api.get(fileId);
      } catch (error) {
        // The file went away since the pull — deleted from another device,
        // or by the user through Drive. The next pull starts over.
        if (error instanceof DriveApiError && error.status === 404) throw new SyncConflictError();
        throw error;
      }
      if (current.version !== baseVersion) throw new SyncConflictError();

      return (await api.update(fileId, content)).version;
    },
  };
}
