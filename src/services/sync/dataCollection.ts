/**
 * What leaves the device once syncing is on, in Firefox's words: the URLs of
 * annotated pages and the text quoted from them. Declared as optional in the
 * manifest, and asked for here, at the moment it starts to apply — whichever
 * backend the notes are about to go to.
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
export async function ensureDataCollectionAllowed(): Promise<void> {
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
