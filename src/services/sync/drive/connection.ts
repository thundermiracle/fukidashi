import { requestSyncNow } from "../../messages";
import { saveSyncConfig } from "../config";
import { createDriveApi } from "./api";
import {
  createDriveBearerSource,
  type DriveToken,
  driveAuthOptions,
  signInToDrive,
  signOutOfDrive,
} from "./auth";
import { DRIVE_FILE_NAME } from "./backend";

/**
 * Signs in and switches syncing on. Writing the config makes the background
 * run a sync at once, but signing in again while already connected writes
 * nothing new — so a run is asked for outright either way, which is what
 * brings the scheduler back from `signedOut`.
 */
export async function connectDrive(): Promise<DriveToken> {
  const token = await signInToDrive(driveAuthOptions());
  await saveSyncConfig({ backend: "drive" });
  await requestSyncNow();
  return token;
}

async function deleteRemoteCopy(): Promise<void> {
  const api = createDriveApi(createDriveBearerSource(driveAuthOptions()));
  for (const file of await api.find(DRIVE_FILE_NAME)) await api.delete(file.id);
}

/**
 * Switches syncing off and forgets the token; the notes on this device stay
 * as they are. Deleting the copy in Drive, when asked for, comes in between:
 * after the config is gone, so no new run starts and writes the file back,
 * and before the token is revoked, which the delete still needs. If the
 * delete fails, nothing is given up — syncing is switched back on and the
 * failure handed back.
 */
export async function disconnectDrive(options: { deleteRemoteCopy: boolean }): Promise<void> {
  await saveSyncConfig(null);
  if (options.deleteRemoteCopy) {
    try {
      await deleteRemoteCopy();
    } catch (error) {
      await saveSyncConfig({ backend: "drive" });
      throw error;
    }
  }
  await signOutOfDrive();
}
