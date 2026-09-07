import { beforeEach, describe, expect, it } from "vitest";
import { createFakeRelay } from "../../src/testing/fakeRelay";
import worker, {
  BlobService,
  type BlobStorage,
  type Env,
  MAX_BLOB_BYTES,
  RATE_LIMIT_REQUESTS,
  RETENTION_MS,
  SyncBlob,
} from "./worker";

const ID = "0123456789abcdef0123456789abcdef";
const OTHER_ID = "fedcba9876543210fedcba9876543210";
const DAY = 24 * 60 * 60 * 1000;

let clock: number;
let relay: ReturnType<typeof createFakeRelay>;

function url(id = ID): string {
  return `https://relay.test/v1/blob/${id}`;
}

function call(init: RequestInit = {}, id = ID): Promise<Response> {
  return relay.fetch(url(id), init);
}

function create(body: string, id = ID): Promise<Response> {
  return call({ method: "PUT", headers: { "If-None-Match": "*" }, body }, id);
}

beforeEach(() => {
  clock = 1_000_000;
  relay = createFakeRelay({ now: () => clock });
});

describe("a blob on the relay", () => {
  it("is not there until it is created", async () => {
    expect((await call({ method: "GET" })).status).toBe(404);
    expect((await call({ method: "HEAD" })).status).toBe(404);
  });

  it("is created for If-None-Match: *, and read back with its version", async () => {
    const created = await create("one");
    expect(created.status).toBe(201);
    expect(created.headers.get("ETag")).toBe('"1"');

    const read = await call({ method: "GET" });
    expect(read.status).toBe(200);
    expect(read.headers.get("ETag")).toBe('"1"');
    await expect(read.text()).resolves.toBe("one");

    const head = await call({ method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("ETag")).toBe('"1"');
    await expect(head.text()).resolves.toBe("");
  });

  it("answers 304 when the version asked about is the one it has", async () => {
    await create("one");

    const same = await call({ method: "GET", headers: { "If-None-Match": '"1"' } });
    expect(same.status).toBe(304);
    expect(same.headers.get("ETag")).toBe('"1"');

    const other = await call({ method: "GET", headers: { "If-None-Match": '"0"' } });
    expect(other.status).toBe(200);
  });

  it("is written over at the version named, and at no other", async () => {
    await create("one");

    const written = await call({ method: "PUT", headers: { "If-Match": '"1"' }, body: "two" });
    expect(written.status).toBe(200);
    expect(written.headers.get("ETag")).toBe('"2"');

    const stale = await call({ method: "PUT", headers: { "If-Match": '"1"' }, body: "three" });
    expect(stale.status).toBe(412);
    expect(relay.content(ID)).toBe("two");
  });

  it("is not created twice", async () => {
    await create("one");

    expect((await create("two")).status).toBe(412);
    expect(relay.content(ID)).toBe("one");
  });

  it("is not written without a precondition", async () => {
    expect((await call({ method: "PUT", body: "one" })).status).toBe(428);
    expect(relay.content(ID)).toBeUndefined();
  });

  it("is capped just under 2 MB", async () => {
    const tooBig = await create("x".repeat(MAX_BLOB_BYTES + 1));
    expect(tooBig.status).toBe(413);

    const justRight = await create("x".repeat(MAX_BLOB_BYTES));
    expect(justRight.status).toBe(201);
  });

  it("is deleted on request, and deleting again is fine", async () => {
    await create("one");

    expect((await call({ method: "DELETE" })).status).toBe(204);
    expect((await call({ method: "GET" })).status).toBe(404);
    expect((await call({ method: "DELETE" })).status).toBe(204);
  });

  it("is not deleted at a version other than the one named", async () => {
    await create("one");

    expect((await call({ method: "DELETE", headers: { "If-Match": '"0"' } })).status).toBe(412);
    expect(relay.content(ID)).toBe("one");
  });

  it("knows a weakened tag for the version it names", async () => {
    await create("one");

    // A proxy that compressed the answer hands the browser `W/"1"`, and the
    // browser sends that back; it still names the version the relay wrote.
    const unchanged = await call({ method: "GET", headers: { "If-None-Match": 'W/"1"' } });
    expect(unchanged.status).toBe(304);

    const written = await call({ method: "PUT", headers: { "If-Match": 'W/"1"' }, body: "two" });
    expect(written.status).toBe(200);
    expect(relay.content(ID)).toBe("two");

    // Another version is refused, weakened or not.
    const stale = await call({ method: "PUT", headers: { "If-Match": 'W/"1"' }, body: "three" });
    expect(stale.status).toBe(412);
  });

  it("takes sixty requests a minute, then asks for a pause", async () => {
    for (let i = 0; i < RATE_LIMIT_REQUESTS; i++) {
      expect((await call({ method: "HEAD" })).status).toBe(404);
    }

    const refused = await call({ method: "HEAD" });
    expect(refused.status).toBe(429);
    expect(refused.headers.get("Retry-After")).toBe("60");
    // Another id is unaffected …
    expect((await call({ method: "HEAD" }, OTHER_ID)).status).toBe(404);
    // … and a minute later this one is served again.
    clock += 61_000;
    expect((await call({ method: "HEAD" })).status).toBe(404);
  });

  it("is let go after 90 days without a request", async () => {
    await create("one");
    expect(relay.alarms.get(ID)).toBe(clock + RETENTION_MS);

    clock += 10 * DAY;
    await relay.fireAlarm(ID);
    expect(relay.content(ID)).toBe("one");
    // Rescheduled for 90 days after the last request, not after the alarm.
    expect(relay.alarms.get(ID)).toBe(clock - 10 * DAY + RETENTION_MS);

    clock += 80 * DAY;
    await relay.fireAlarm(ID);
    expect(relay.content(ID)).toBeUndefined();
    expect((await call({ method: "GET" })).status).toBe(404);
  });

  it("lives on while it is being used", async () => {
    await create("one");
    clock += 89 * DAY;
    await call({ method: "HEAD" });
    clock += 2 * DAY;

    await relay.fireAlarm(ID);

    expect(relay.content(ID)).toBe("one");
  });

  it("writes its last use down once a day, not on every idle round", async () => {
    await create("one");
    const written = relay.alarms.get(ID);

    clock += 15 * 60_000;
    await call({ method: "HEAD" });
    expect(relay.alarms.get(ID)).toBe(written);

    clock += DAY;
    await call({ method: "HEAD" });
    expect(relay.alarms.get(ID)).toBe(clock + RETENTION_MS);
  });

  it("leaves nothing behind for an id nothing is stored under", async () => {
    await call({ method: "HEAD" });
    await call({ method: "GET" });

    expect(relay.alarms.has(ID)).toBe(false);
  });

  it("refuses a body its sender declared too large before reading it", async () => {
    const answer = await call({
      method: "PUT",
      headers: { "If-None-Match": "*", "Content-Length": String(MAX_BLOB_BYTES + 1) },
      body: "small",
    });

    expect(answer.status).toBe(413);
  });

  it("answers a preflight, and puts CORS headers on every answer", async () => {
    const preflight = await call({ method: "OPTIONS" });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain("If-Match");

    const missing = await call({ method: "GET" });
    expect(missing.headers.get("Access-Control-Allow-Origin")).toBe("*");
    await create("one");
    const conflict = await create("two");
    expect(conflict.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(conflict.headers.get("Access-Control-Expose-Headers")).toContain("ETag");
    expect(conflict.headers.get("Cache-Control")).toBe("no-store");
  });

  it("knows no other method", async () => {
    const answer = await call({ method: "POST", body: "one" });
    expect(answer.status).toBe(405);
    expect(answer.headers.get("Allow")).toContain("PUT");
  });
});

describe("the router", () => {
  /** A namespace whose objects are the fake relay's services. */
  function env(): Env {
    return {
      SYNC_BLOB: {
        idFromName: (name) => name,
        get: (id) => ({
          fetch: (request) => {
            expect(request.url).toContain(String(id));
            return relay.fetch(request);
          },
        }),
      },
    };
  }

  it("sends each id's requests to its own object", async () => {
    await worker.fetch(
      new Request(url(), { method: "PUT", headers: { "If-None-Match": "*" }, body: "one" }),
      env(),
    );

    const read = await worker.fetch(new Request(url(), { method: "GET" }), env());
    await expect(read.text()).resolves.toBe("one");
    expect((await worker.fetch(new Request(url(OTHER_ID)), env())).status).toBe(404);
  });

  it("knows nothing outside /v1/blob/{id}", async () => {
    expect((await worker.fetch(new Request("https://relay.test/"), env())).status).toBe(404);
    expect((await worker.fetch(new Request(url("not-hex")), env())).status).toBe(404);
    expect((await worker.fetch(new Request(url(ID.toUpperCase())), env())).status).toBe(404);
  });

  it("answers preflights at the edge", async () => {
    const answer = await worker.fetch(new Request(url(), { method: "OPTIONS" }), env());

    expect(answer.status).toBe(204);
    expect(answer.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("an idle round's HEAD", () => {
  /** Storage that counts what was read, to see what a HEAD actually costs. */
  function countingStorage() {
    const store = new Map<string, unknown>();
    const reads: string[] = [];
    const storage: BlobStorage = {
      async get<T>(key: string) {
        reads.push(key);
        return store.get(key) as T | undefined;
      },
      async put(key, value) {
        store.set(key, value);
      },
      async delete(key) {
        return store.delete(key);
      },
      async setAlarm() {},
    };
    return { storage, reads };
  }

  it("answers from the version alone, without reading the notes", async () => {
    const { storage, reads } = countingStorage();
    const service = new BlobService(storage, () => clock);
    await service.handle(
      new Request(url(), { method: "PUT", headers: { "If-None-Match": "*" }, body: "the notes" }),
    );
    reads.length = 0;

    const head = await service.handle(new Request(url(), { method: "HEAD" }));

    expect(head.status).toBe(200);
    expect(head.headers.get("ETag")).toBe('"1"');
    expect(head.headers.get("Content-Length")).toBe("9");
    expect(reads).not.toContain("body");
  });

  it("reads them for a GET, as it must", async () => {
    const { storage, reads } = countingStorage();
    const service = new BlobService(storage, () => clock);
    await service.handle(
      new Request(url(), { method: "PUT", headers: { "If-None-Match": "*" }, body: "the notes" }),
    );
    reads.length = 0;

    const read = await service.handle(new Request(url(), { method: "GET" }));

    await expect(read.text()).resolves.toBe("the notes");
    expect(reads).toContain("body");
  });
});

describe("the Durable Object", () => {
  it("hands its requests and its alarm to the blob service", async () => {
    const store = new Map<string, unknown>();
    let alarmAt = 0;
    const storage: BlobStorage = {
      async get<T>(key: string) {
        return store.get(key) as T | undefined;
      },
      async put(key, value) {
        store.set(key, value);
      },
      async delete(key) {
        return store.delete(key);
      },
      async setAlarm(at) {
        alarmAt = at;
      },
    };
    const object = new SyncBlob({ storage });

    const created = await object.fetch(
      new Request(url(), { method: "PUT", headers: { "If-None-Match": "*" }, body: "one" }),
    );
    expect(created.status).toBe(201);
    expect(alarmAt).toBeGreaterThan(Date.now());

    await object.alarm();
    expect(store.has("blob")).toBe(true);
    expect(object).toBeInstanceOf(SyncBlob);
    expect(new BlobService(storage)).toBeInstanceOf(BlobService);
  });
});
