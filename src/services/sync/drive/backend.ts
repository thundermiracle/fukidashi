import { createSyncPayload, mergeSyncPages, purgeSyncPages } from "@/core";
import { type SyncBackend, SyncConflictError } from "../backend";
import { jsonCodec, type PayloadCodec } from "../codec";
import { type DriveApi, DriveApiError, type DriveFile } from "./api";

/** The one file the notes live in, inside the app folder nothing else can see. */
export const DRIVE_FILE_NAME = "fukidashi-notes.json";

/**
 * How many times a write that went over another device's is redone with
 * that device's notes taken in, before the engine is left to sort it out.
 */
const MAX_REPAIR_ROUNDS = 3;

/**
 * Drive's `version` is a number in a string. The highest is the copy that
 * has lived longest; ids break a tie the same way on every device.
 */
function byVersionDesc(a: DriveFile, b: DriveFile): number {
  return Number(b.version) - Number(a.version) || (a.id < b.id ? -1 : 1);
}

/**
 * The version token names the file as well as its version: `version` starts
 * over at 1 for every new file, so on its own it could not tell a fresh file
 * from the one a device last saw. Carrying the id also means a push knows
 * which file to write without a pull before it in the same worker.
 */
function tokenOf(file: DriveFile): string {
  return `${file.id}:${file.version}`;
}

function fileIdOf(token: string): string {
  return token.slice(0, token.lastIndexOf(":"));
}

/**
 * The revisions another device wrote between `base` and `head` — none when
 * Drive did not say where the content stood, or no longer lists `base`.
 */
async function revisionsBetween(
  api: DriveApi,
  id: string,
  base: string | undefined,
  head: string | undefined,
): Promise<string[]> {
  if (!base || !head || base === head) return [];
  const ids = (await api.listRevisions(id)).map((revision) => revision.id);
  const from = ids.indexOf(base);
  const to = ids.indexOf(head);
  if (from === -1 || to === -1) return [];
  return ids.slice(from + 1, to);
}

/**
 * The notes kept as one file in Google Drive's app folder. Drive has no
 * If-Match, so `push` checks the version right before writing — the closest
 * it can get to the optimistic locking the engine expects. A write that
 * still went over another device's is caught afterwards through the file's
 * revisions, and redone with that device's notes taken in
 * (docs/sync-design.md, 3.3).
 */
export function createDriveBackend(api: DriveApi, codec: PayloadCodec = jsonCodec): SyncBackend {
  const newest = async (): Promise<[DriveFile | undefined, DriveFile[]]> => {
    const [file, ...duplicates] = (await api.find(DRIVE_FILE_NAME)).sort(byVersionDesc);
    return [file, duplicates];
  };

  return {
    async peek() {
      const [file] = await newest();
      return file ? tokenOf(file) : null;
    },

    async pull() {
      const [file, duplicates] = await newest();
      if (!file) return null;

      // Two devices creating the file in the same moment leave two. Every
      // device keeps the same one, so the others can go: whatever they held
      // is still on the device that wrote it, and comes back with its next push.
      for (const duplicate of duplicates) await api.delete(duplicate.id);

      return { payload: await codec.decode(await api.read(file.id)), version: tokenOf(file) };
    },

    async push(payload, baseVersion) {
      if (baseVersion === null) {
        const created = await api.create(DRIVE_FILE_NAME, await codec.encode(payload));
        // Another device may have created one in the same moment. Whichever
        // the next pull keeps, both devices will agree on.
        if ((await api.find(DRIVE_FILE_NAME)).length > 1) throw new SyncConflictError();
        return tokenOf(created);
      }

      const id = fileIdOf(baseVersion);
      let current: DriveFile;
      try {
        current = await api.get(id);
      } catch (error) {
        // The file went away since it was read — deleted from another device,
        // or by the user through Drive. The next pull starts over.
        if (error instanceof DriveApiError && error.status === 404) throw new SyncConflictError();
        throw error;
      }
      if (tokenOf(current) !== baseVersion) throw new SyncConflictError();

      let pages = payload.pages;
      for (let round = 0; round < MAX_REPAIR_ROUNDS; round++) {
        const written = await api.update(
          id,
          await codec.encode(createSyncPayload(pages, payload.exportedAt)),
        );
        const missed = await revisionsBetween(
          api,
          id,
          current.headRevisionId,
          written.headRevisionId,
        );
        if (missed.length === 0) {
          if (round === 0) return tokenOf(written);
          // The union is on the remote now, but not on this device. A conflict
          // makes the engine read it back before it records anything.
          throw new SyncConflictError();
        }

        // Another device wrote between the check and the write, and the write
        // went over its copy. That copy is still there as a revision: take it
        // in, and write the union in its place.
        for (const revisionId of missed) {
          const theirs = await codec.decode(await api.readRevision(id, revisionId));
          pages = mergeSyncPages(pages, theirs.pages);
        }
        pages = purgeSyncPages(pages, payload.exportedAt);
        current = written;
      }
      throw new SyncConflictError();
    },
  };
}
