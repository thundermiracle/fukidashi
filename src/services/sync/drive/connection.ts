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
 * What leaves the device once syncing is on, in Firefox's words: the URLs of
 * annotated pages and the text quoted from them. Declared as optional in the
 * manifest, and asked for here, at the moment it starts to apply.
 */
const DATA_COLLECTION = ["browsingActivity", "websiteContent"];

/** Thrown when the user would not let the notes leave the device. */
export class DataCollectionRefusedError extends Error {
  constructor() {
    super("Without that permission the notes cannot leave this device.");
  }
}

/**
 * Firefox asks the user before an extension may send data anywhere, through
 * a prompt of its own. It has to be asked from the click that starts the
 * connection, before anything else is awaited, or the browser no longer
 * counts it as the user's doing.
 */
async function ensureDataCollectionAllowed(): Promise<void> {
  if (!import.meta.env.FIREFOX) return;

  let granted: boolean;
  try {
    granted = await chrome.permissions.request({
      data_collection: DATA_COLLECTION,
    } as chrome.permissions.Permissions);
  } catch {
    // A Firefox from before data collection permissions existed does not
    // know the request, and does not require it either.
    return;
  }
  if (!granted) throw new DataCollectionRefusedError();
}

/**
 * Signs in and switches syncing on. Writing the config makes the background
 * run a sync at once, but signing in again while already connected writes
 * nothing new — so a run is asked for outright either way, which is what
 * brings the scheduler back from `signedOut`.
 */
export async function connectDrive(): Promise<DriveToken> {
  const options = driveAuthOptions();
  await ensureDataCollectionAllowed();
  const token = await signInToDrive(options);
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
