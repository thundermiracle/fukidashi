import { MAX_UPLOAD_BYTES } from "@/services/sync/drive/api";

interface StoredFile {
  id: string;
  name: string;
  version: number;
  content: string;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** The two parts of a multipart create: the metadata JSON and the content. */
function readMultipart(body: string, contentType: string): { name: string; content: string } {
  const boundary = contentType.match(/boundary=(.+)$/)?.[1] ?? "";
  const parts = body.split(`--${boundary}`).map((part) => part.slice(part.indexOf("\r\n\r\n") + 4));
  const metadata = JSON.parse(parts[1].trim()) as { name: string };
  return { name: metadata.name, content: parts[2].replace(/\r\n$/, "") };
}

/**
 * An in-memory Google Drive behind a `fetch` of its own: the app folder's
 * files with a version that moves on every write, the tokens it accepts, the
 * 5 MB cap on uploads, and Google's userinfo and revoke endpoints. Enough
 * for the Drive client, the backend and the engine to be run against.
 */
export function createFakeDrive() {
  const files = new Map<string, StoredFile>();
  /** Accepted bearer tokens, and the account each one belongs to. */
  const tokens = new Map<string, string>();
  const requests: { method: string; url: string }[] = [];
  let nextId = 1;

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  const failure = (status: number, message: string) =>
    json(status, { error: { code: status, message } });
  const describe = (file: StoredFile) => ({
    id: file.id,
    version: String(file.version),
    size: String(byteLength(file.content)),
  });
  const add = (name: string, content: string): StoredFile => {
    const file = { id: `file-${nextId++}`, name, version: 1, content };
    files.set(file.id, file);
    return file;
  };

  const fetchImpl = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    const body = typeof init.body === "string" ? init.body : "";
    requests.push({ method, url: url.toString() });

    if (url.host === "oauth2.googleapis.com" && url.pathname === "/revoke") return json(200, {});

    const email = tokens.get((headers.get("Authorization") ?? "").replace(/^Bearer /, ""));
    if (!email) return failure(401, "Invalid Credentials");
    if (url.host === "openidconnect.googleapis.com") return json(200, { email });

    if (url.pathname === "/upload/drive/v3/files" && method === "POST") {
      if (byteLength(body) > MAX_UPLOAD_BYTES) return failure(413, "Request Entity Too Large");
      const { name, content } = readMultipart(body, headers.get("Content-Type") ?? "");
      return json(200, describe(add(name, content)));
    }

    const upload = url.pathname.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/);
    if (upload && method === "PATCH") {
      const file = files.get(upload[1]);
      if (!file) return failure(404, "File not found");
      if (byteLength(body) > MAX_UPLOAD_BYTES) return failure(413, "Request Entity Too Large");
      file.content = body;
      file.version += 1;
      return json(200, describe(file));
    }

    if (url.pathname === "/drive/v3/files" && method === "GET") {
      const name = url.searchParams.get("q")?.match(/name = '([^']*)'/)?.[1];
      const found = [...files.values()].filter((file) => !name || file.name === name);
      return json(200, { files: found.map(describe) });
    }

    const one = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (one) {
      const file = files.get(one[1]);
      if (!file) return failure(404, "File not found");
      if (method === "DELETE") {
        files.delete(file.id);
        return new Response(null, { status: 204 });
      }
      if (url.searchParams.get("alt") === "media")
        return new Response(file.content, { status: 200 });
      return json(200, describe(file));
    }

    return failure(404, `Nothing here answers ${method} ${url}`);
  };

  return {
    files,
    requests,
    fetch: fetchImpl,
    /** Lets a token in, the way a sign-in would. */
    accept: (token: string, email = "someone@example.com") => tokens.set(token, email),
    /** Makes Google refuse the token from now on. */
    revoke: (token: string) => tokens.delete(token),
    /** What the app folder holds under that name, for a test to read. */
    content: (name: string) => [...files.values()].find((file) => file.name === name)?.content,
    /** Plants a file, the way another device (or a newer version) would have left it. */
    plant: (name: string, content: string) => describe(add(name, content)),
  };
}
