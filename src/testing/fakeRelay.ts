import {
  BLOB_KEY,
  BlobService,
  type BlobStorage,
  BODY_KEY,
  blobIdOf,
  preflight,
  problem,
  type StoredBlob,
} from "../../relay/src/worker";

export interface FakeRelayOptions {
  baseUrl?: string;
  /** The clock the rate limit and the retention alarm go by. */
  now?: () => number;
}

/**
 * The relay behind a `fetch` of its own: the Worker's blob logic over
 * in-memory storage, one object per id, the way Cloudflare runs it. The
 * extension's tests and the Worker's therefore exercise the same code.
 */
export function createFakeRelay(options: FakeRelayOptions = {}) {
  const baseUrl = options.baseUrl ?? "https://relay.test";
  const now = options.now ?? Date.now;
  const stores = new Map<string, Map<string, unknown>>();
  const services = new Map<string, BlobService>();
  const alarms = new Map<string, number>();
  const requests: { method: string; url: string }[] = [];

  const storeFor = (id: string): Map<string, unknown> => {
    let store = stores.get(id);
    if (!store) {
      store = new Map();
      stores.set(id, store);
    }
    return store;
  };

  const storageFor = (id: string): BlobStorage => {
    const store = storeFor(id);
    return {
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
        alarms.set(id, at);
      },
    };
  };

  const serviceFor = (id: string): BlobService => {
    let service = services.get(id);
    if (!service) {
      service = new BlobService(storageFor(id), now);
      services.set(id, service);
    }
    return service;
  };

  const fetchImpl: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push({ method: request.method, url: request.url });
    if (!request.url.startsWith(`${baseUrl}/`)) {
      return problem(404, "Nothing here answers this address.");
    }
    const id = blobIdOf(new URL(request.url));
    if (id === null) return problem(404, "Nothing here.");
    if (request.method === "OPTIONS") return preflight();
    return serviceFor(id).handle(request);
  };

  return {
    baseUrl,
    fetch: fetchImpl,
    requests,
    /** When each blob's retention alarm is set for. */
    alarms,
    /** What the relay holds under that id, for a test to read. */
    content: (id: string) =>
      storeFor(id).has(BLOB_KEY) ? (storeFor(id).get(BODY_KEY) as string) : undefined,
    /** Plants a blob, the way another browser would have left it. */
    plant: (id: string, body: string) => {
      const blob: StoredBlob = {
        version: 1,
        bytes: new TextEncoder().encode(body).length,
        updatedAt: now(),
      };
      storeFor(id).set(BLOB_KEY, blob);
      storeFor(id).set(BODY_KEY, body);
    },
    /** Runs a blob's retention alarm, as Cloudflare would at the time it was set for. */
    fireAlarm: (id: string) => serviceFor(id).alarm(),
  };
}
