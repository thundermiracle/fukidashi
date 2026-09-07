/**
 * The sync-code relay: one encrypted blob per id, kept in a Durable Object,
 * with the compare-and-swap that Google Drive lacks (docs/sync-design.md,
 * Step 6). The relay never sees a sync code or a key — only the blob id
 * HKDF derives from the code, and ciphertext.
 *
 * `GET|HEAD|PUT|DELETE /v1/blob/{id}`, `id` being 32 lowercase hex digits:
 *
 * - GET returns the blob with its `ETag`, 304 when `If-None-Match` names
 *   the version it has, 404 when there is none. HEAD is the same without
 *   a body — the one request an idle round costs.
 * - PUT needs a precondition: `If-None-Match: *` creates and refuses to
 *   write over an existing blob; `If-Match` writes over that version only.
 *   412 when the precondition fails, 428 without one, 413 over the cap
 *   (1.9 MB, just under Cloudflare's limit for one stored value).
 * - DELETE removes the blob, `If-Match` optional; 204 either way.
 *
 * 60 requests per minute per id, 429 beyond. A blob nobody has touched for
 * 90 days is deleted by the object's alarm. Every response carries CORS
 * headers for `*`: the extension's origin varies per browser and install,
 * and the blob id is the only access control there is.
 *
 * Written against the standard Request and Response so the same code runs
 * in the extension's tests (src/testing/fakeRelay.ts); the Durable Object
 * wrapper at the bottom is the only Cloudflare-specific part.
 */

/**
 * Cloudflare allows 2 MB for a key and its value together in a SQLite-backed
 * object; this leaves room for the key and for the value's own framing.
 */
export const MAX_BLOB_BYTES = 1_900_000;
export const RATE_LIMIT_REQUESTS = 60;
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
/** How often a blob's last access is written down: not on every idle round. */
const TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;

const ID_PATTERN = /^[0-9a-f]{32}$/;
const ROUTE = /^\/v1\/blob\/([^/]+)$/;
/** The blob's version and dates; the body sits under a key of its own, so each value stays small. */
export const BLOB_KEY = "blob";
export const BODY_KEY = "body";
const LAST_ACCESS_KEY = "lastAccess";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, If-Match, If-None-Match",
  "Access-Control-Expose-Headers": "ETag, Retry-After",
  "Access-Control-Max-Age": "86400",
};

/** What the object keeps, in the shape Durable Object storage offers. */
export interface BlobStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  setAlarm(scheduledTime: number): Promise<void>;
}

export interface StoredBlob {
  version: number;
  /**
   * How long the body is, kept here so a HEAD never has to read it. Absent
   * on a blob an earlier version of this Worker wrote, which is why every
   * reader has to be ready to measure the body itself.
   */
  bytes?: number;
  updatedAt: number;
}

export function isBlobId(value: string): boolean {
  return ID_PATTERN.test(value);
}

/** The blob id a request names, or null when the path is not a blob's. */
export function blobIdOf(url: URL): string | null {
  const id = ROUTE.exec(url.pathname)?.[1];
  return id !== undefined && isBlobId(id) ? id : null;
}

function etagOf(blob: StoredBlob): string {
  return `"${blob.version}"`;
}

/**
 * An ETag as it comes back, without the `W/` that marks a weak one. A proxy
 * that changes only how a body is carried — Cloudflare compressing this
 * JSON, say — weakens the tag it passes on, and the browser then sends that
 * weakened tag back. The entity it names is the same one, so the version it
 * carries is compared the same way.
 */
function sameTag(a: string | null, b: string): boolean {
  return a !== null && a.replace(/^W\//, "") === b.replace(/^W\//, "");
}

function withCors(headers: Record<string, string> = {}): Headers {
  return new Headers({ ...CORS_HEADERS, "Cache-Control": "no-store", ...headers });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: withCors() });
}

export function problem(status: number, message: string, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: withCors({ "Content-Type": "application/json", ...headers }),
  });
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * One blob's behaviour, apart from where it is stored: the object below
 * hands it Durable Object storage, the extension's tests an in-memory map.
 */
export class BlobService {
  private hits: number[] = [];

  constructor(
    private readonly storage: BlobStorage,
    private readonly now: () => number = Date.now,
  ) {}

  async handle(request: Request): Promise<Response> {
    const method = request.method.toUpperCase();
    if (method === "OPTIONS") return preflight();

    if (this.overLimit()) {
      return problem(429, "Too many requests for this id; try again in a minute.", {
        "Retry-After": String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)),
      });
    }

    switch (method) {
      case "GET":
      case "HEAD":
        return this.read(request, method === "HEAD");
      case "PUT":
        return this.write(request);
      case "DELETE":
        return this.remove(request);
      default:
        return problem(405, "Method not allowed.", {
          Allow: "GET, HEAD, PUT, DELETE, OPTIONS",
        });
    }
  }

  /** Runs when the retention alarm goes off: drops a blob nobody has touched in 90 days. */
  async alarm(): Promise<void> {
    const lastAccess = (await this.storage.get<number>(LAST_ACCESS_KEY)) ?? 0;
    if (this.now() - lastAccess >= RETENTION_MS) {
      await this.storage.delete(BLOB_KEY);
      await this.storage.delete(BODY_KEY);
      await this.storage.delete(LAST_ACCESS_KEY);
      return;
    }
    await this.storage.setAlarm(lastAccess + RETENTION_MS);
  }

  /** A sliding window of the last minute's requests; true when this one is one too many. */
  private overLimit(): boolean {
    const now = this.now();
    this.hits = this.hits.filter((at) => now - at < RATE_LIMIT_WINDOW_MS);
    if (this.hits.length >= RATE_LIMIT_REQUESTS) return true;
    this.hits.push(now);
    return false;
  }

  /**
   * Any use of a blob that exists keeps it another 90 days from then. The
   * date is only written down once a day: an idle round every fifteen
   * minutes would otherwise be a storage write each, and a request for an
   * id nothing is stored under leaves nothing behind at all.
   */
  private async touch(force = false): Promise<void> {
    const now = this.now();
    const lastAccess = await this.storage.get<number>(LAST_ACCESS_KEY);
    if (!force && lastAccess !== undefined && now - lastAccess < TOUCH_INTERVAL_MS) return;
    await this.storage.put(LAST_ACCESS_KEY, now);
    await this.storage.setAlarm(now + RETENTION_MS);
  }

  private async read(request: Request, headOnly: boolean): Promise<Response> {
    const blob = await this.storage.get<StoredBlob>(BLOB_KEY);
    if (!blob) return problem(404, "No blob under this id.");
    await this.touch();

    const headers = withCors({ ETag: etagOf(blob), "Content-Type": "application/json" });
    if (sameTag(request.headers.get("If-None-Match"), etagOf(blob))) {
      return new Response(null, { status: 304, headers });
    }
    // An idle round is a HEAD every fifteen minutes, and answering it costs
    // no more than the version: the body stays where it is.
    if (headOnly && blob.bytes !== undefined) {
      headers.set("Content-Length", String(blob.bytes));
      return new Response(null, { status: 200, headers });
    }

    const body = (await this.storage.get<string>(BODY_KEY)) ?? "";
    if (blob.bytes === undefined) {
      // Written before the length was kept with the version: measure it once
      // and record it, so this blob's next HEAD is as cheap as any other's.
      await this.storage.put(BLOB_KEY, { ...blob, bytes: byteLength(body) });
    }
    headers.set("Content-Length", String(blob.bytes ?? byteLength(body)));
    return new Response(headOnly ? null : body, { status: 200, headers });
  }

  private async write(request: Request): Promise<Response> {
    const tooLarge = problem(413, `The blob may not exceed ${MAX_BLOB_BYTES} bytes.`);
    // What the client declared is refused before the body is read at all;
    // what actually arrived is measured after, since the header may lie.
    if (Number(request.headers.get("Content-Length") ?? 0) > MAX_BLOB_BYTES) return tooLarge;
    const body = await request.text();
    if (byteLength(body) > MAX_BLOB_BYTES) return tooLarge;

    const current = await this.storage.get<StoredBlob>(BLOB_KEY);
    const ifMatch = request.headers.get("If-Match");
    const ifNoneMatch = request.headers.get("If-None-Match");

    if (ifNoneMatch === "*") {
      if (current) return problem(412, "A blob already exists under this id.");
    } else if (ifMatch !== null) {
      if (!current || !sameTag(ifMatch, etagOf(current))) {
        return problem(412, "The blob changed since it was read.");
      }
    } else {
      return problem(428, "PUT needs If-Match, or If-None-Match: * to create.");
    }

    const written: StoredBlob = {
      version: (current?.version ?? 0) + 1,
      bytes: byteLength(body),
      updatedAt: this.now(),
    };
    await this.storage.put(BODY_KEY, body);
    await this.storage.put(BLOB_KEY, written);
    await this.touch(true);
    return new Response(null, {
      status: current ? 200 : 201,
      headers: withCors({ ETag: etagOf(written) }),
    });
  }

  private async remove(request: Request): Promise<Response> {
    const current = await this.storage.get<StoredBlob>(BLOB_KEY);
    const ifMatch = request.headers.get("If-Match");
    if (current && ifMatch !== null && !sameTag(ifMatch, etagOf(current))) {
      return problem(412, "The blob changed since it was read.");
    }
    await this.storage.delete(BLOB_KEY);
    await this.storage.delete(BODY_KEY);
    await this.storage.delete(LAST_ACCESS_KEY);
    return new Response(null, { status: 204, headers: withCors() });
  }
}

// ---- Cloudflare-specific from here on ------------------------------------

/** The slice of the Durable Object namespace API the router uses. */
interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

export interface Env {
  SYNC_BLOB: DurableObjectNamespaceLike;
}

/** Routes each blob's requests to the object named after it. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = blobIdOf(new URL(request.url));
    if (id === null) return problem(404, "Nothing here.");
    if (request.method.toUpperCase() === "OPTIONS") return preflight();
    return env.SYNC_BLOB.get(env.SYNC_BLOB.idFromName(id)).fetch(request);
  },
};

/** One blob, as a Durable Object. */
export class SyncBlob {
  private readonly service: BlobService;

  constructor(state: { storage: BlobStorage }) {
    this.service = new BlobService(state.storage);
  }

  fetch(request: Request): Promise<Response> {
    return this.service.handle(request);
  }

  alarm(): Promise<void> {
    return this.service.alarm();
  }
}
