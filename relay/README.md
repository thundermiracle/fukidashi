# The sync-code relay

The second backend for Fukidashi's sync, for people who would rather not
connect a Google account: one encrypted blob per sync code, kept in a
Cloudflare Durable Object. The design is in
[`docs/sync-design.md`](../docs/sync-design.md), section 3.5.

What the relay holds and sees:

- the blob id (32 hex digits HKDF derives from the sync code — the code
  itself never leaves the browser),
- the encrypted notes, which it cannot read,
- and whatever Cloudflare logs about a request (IP address, timing).

A blob nobody has touched for 90 days is deleted. The size cap is 1.9 MB —
just under the 2 MB Cloudflare allows for one stored value — and the rate 60
requests per minute per id.

## Protocol

`/v1/blob/{id}`, every response with CORS headers for `*` and `Cache-Control:
no-store`:

| Method | Precondition | Answer |
| --- | --- | --- |
| `GET` | `If-None-Match: <etag>` optional | 200 with the blob and its `ETag`; 304 when the version matches; 404 when there is none |
| `HEAD` | as GET | the same without a body — what an idle sync round costs |
| `PUT` | `If-None-Match: *` to create, `If-Match: <etag>` to write over that version | 201 or 200 with the new `ETag`; 412 when the precondition fails; 428 without one; 413 over the cap |
| `DELETE` | `If-Match` optional | 204, whether or not there was a blob |

Beyond the rate: 429 with `Retry-After`.

ETags are version counters. A proxy in front of the Worker may hand the
browser a weakened tag (`W/"3"`) when it compresses an answer, so both sides
compare tags with that marker ignored.

## Deploying your own

The extension is given the relay's address at build time through
`WXT_SYNC_RELAY_URL` (`.env` for a dev build, a repository variable for the
store build), so a fork runs a relay of its own.

```sh
cd relay
pnpm dlx wrangler login
pnpm dlx wrangler deploy
```

The deploy prints the Worker's URL; that is the value for
`WXT_SYNC_RELAY_URL`. `wrangler.toml` asks for Durable Objects with SQLite
storage, the kind the Workers Free plan offers (with 5 GB of storage per
account, as of the limits page in mid-2026); check Cloudflare's current
pricing page before relying on it.

## Tests

`relay/src/worker.spec.ts` runs the blob logic over in-memory storage, and
the extension's own tests run against the same code through
`src/testing/fakeRelay.ts` — the two sides are never tested apart.
