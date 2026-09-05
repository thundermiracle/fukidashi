import type { BearerSource } from "./auth";

const FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/drive/v3/files";
/** What a simple or multipart upload may carry; beyond it Drive wants a resumable one. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const FILE_FIELDS = "id,version,md5Checksum,size";
const MULTIPART_BOUNDARY = "fukidashi-metadata-and-content";

/** The little Drive says about a file that the backend needs. */
export interface DriveFile {
  id: string;
  /** Moves on with every change made on the server; stands in for the ETag v3 lacks. */
  version: string;
  md5Checksum?: string;
  size?: string;
}

/** A response Drive answered with something other than success. */
export class DriveApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Thrown before an upload Drive would refuse for its size. */
export class PayloadTooLargeError extends Error {
  constructor() {
    super("The notes are too large to sync (over 5 MB).");
  }
}

export interface DriveApi {
  /** Every file of that name in the app folder: more than one after a concurrent create. */
  find(name: string): Promise<DriveFile[]>;
  get(id: string): Promise<DriveFile>;
  read(id: string): Promise<string>;
  create(name: string, content: string): Promise<DriveFile>;
  update(id: string, content: string): Promise<DriveFile>;
  delete(id: string): Promise<void>;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Metadata and content in one request, the way a file is created in the app folder. */
function multipart(metadata: unknown, content: string): string {
  return [
    `--${MULTIPART_BOUNDARY}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${MULTIPART_BOUNDARY}`,
    "Content-Type: application/json",
    "",
    content,
    `--${MULTIPART_BOUNDARY}--`,
    "",
  ].join("\r\n");
}

/** What went wrong, in Drive's words when it gave any. */
async function describe(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: unknown } };
    if (typeof body.error?.message === "string") return body.error.message;
  } catch {
    // Not JSON; the status line will have to do.
  }
  return `Google Drive answered ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.`;
}

function checkSize(content: string): void {
  if (byteLength(content) > MAX_UPLOAD_BYTES) throw new PayloadTooLargeError();
}

/**
 * The few Drive calls the backend needs, each sent with a bearer token and
 * sent once more with a renewed one if Google refused the first. Nothing
 * here knows what the files hold.
 */
export function createDriveApi(bearer: BearerSource, fetchImpl: typeof fetch = fetch): DriveApi {
  const send = async (
    url: string,
    init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  ): Promise<Response> => {
    const attempt = (token: string) =>
      fetchImpl(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });

    let response = await attempt(await bearer.current());
    if (response.status === 401) response = await attempt(await bearer.renewed());
    if (!response.ok) throw new DriveApiError(response.status, await describe(response));
    return response;
  };

  const file = async (response: Response): Promise<DriveFile> =>
    (await response.json()) as DriveFile;

  return {
    async find(name) {
      const query = `name = '${name.replaceAll("'", "\\'")}' and trashed = false`;
      const url = `${FILES_ENDPOINT}?spaces=appDataFolder&q=${encodeURIComponent(query)}&fields=${encodeURIComponent(`files(${FILE_FIELDS})`)}`;
      const body = (await (await send(url)).json()) as { files?: DriveFile[] };
      return body.files ?? [];
    },

    async get(id) {
      return file(await send(`${FILES_ENDPOINT}/${id}?fields=${FILE_FIELDS}`));
    },

    async read(id) {
      return (await send(`${FILES_ENDPOINT}/${id}?alt=media`)).text();
    },

    async create(name, content) {
      checkSize(content);
      const metadata = { name, parents: ["appDataFolder"], mimeType: "application/json" };
      return file(
        await send(`${UPLOAD_ENDPOINT}?uploadType=multipart&fields=${FILE_FIELDS}`, {
          method: "POST",
          headers: { "Content-Type": `multipart/related; boundary=${MULTIPART_BOUNDARY}` },
          body: multipart(metadata, content),
        }),
      );
    },

    async update(id, content) {
      checkSize(content);
      return file(
        await send(`${UPLOAD_ENDPOINT}/${id}?uploadType=media&fields=${FILE_FIELDS}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: content,
        }),
      );
    },

    async delete(id) {
      await send(`${FILES_ENDPOINT}/${id}`, { method: "DELETE" });
    },
  };
}
