# Cross-device sync: stage 2 design

Written 2026-09-05 against fukidashi 0.3.0 (`main` with `sync-foundation` merged).
Everything decided in #6 ("sync foundation") is taken as given here.

## 0. Summary

- **Google Drive's `appDataFolder` is the first backend.** There is nothing to operate and no abuse surface, and the data stays inside the user's own Google account. `drive.appdata` is a non-sensitive scope, so no OAuth verification is needed. The sync-code relay (Cloudflare) slots in behind the same `SyncBackend` later.
- **Auth is `chrome.identity.launchWebAuthFlow` with the implicit flow (`response_type=token`)**, renewed silently with `prompt=none`. Authorization code + PKCE is out: Google requires a client secret from web-application clients, and an extension cannot carry one. Being signed out is a first-class state, not an error.
- **The remote is one file.** Drive API v3 has no ETag / If-Match (checked against the reference), so strict optimistic locking is impossible. A `version` check right before the write narrows the window to a few hundred milliseconds; anything lost inside that window is repaired on the loser's next sync, because the merge is last-write-wins, idempotent and commutative.
- **Step 0 closes the gaps the foundation left**: the read-modify-write window, `lastSyncedAt` reset on failure, tombstones that never leave, the alarm re-created on every service-worker wake, and a sync run on every wake.

## 1. Scope

| Synced (storage keys) | Not synced (per-device state) |
| --- | --- |
| Notes, tombstones included: `fukidashi:notes:*` | The `enabled` setting (settled in #5) |
| Page titles: `fukidashi:title:*` | Sync status: `fukidashi:sync-status` |
|  | Sync config and tokens: `fukidashi:sync:*` (new) |

`collectSyncPages` reads only those two prefixes, so a new key never becomes synced by accident.

Out of scope for this stage: the sync-code relay, several accounts at once, push notifications, delta sync, a device list. (Encryption was first listed here too; it landed as Step 5.)

## 2. What the foundation already provides

| Piece | Where | State |
| --- | --- | --- |
| Tombstones (`deletedAt`, 30-day TTL) | `src/core/tombstone.ts` | done |
| Titles with `updatedAt` | `src/core/types.ts` (`PageTitle`) | done |
| Pure LWW merge (commutative, idempotent, code-point order) | `src/core/sync/merge.ts` | done |
| `SyncPayload` v1, JSON export and import | `src/core/sync/payload.ts`, `src/services/sync/storage.ts` | done |
| `SyncBackend` (pull / push, `SyncConflictError`) | `src/services/sync/backend.ts` | done |
| `syncOnce` (pull, merge, apply, push; up to 3 tries on conflict) | `src/services/sync/engine.ts` | done |
| `startSync` (5 s debounce on `onChanged`, 15-minute alarm, run at start) | `src/services/sync/scheduler.ts` | done, needs fixes |
| `SyncStatus` and `watchSyncStatus` | `src/services/sync/status.ts` | done, needs fixes |
| `loadSyncBackend()` | `src/services/sync/configured.ts` | returns null |
| Fakes (chrome.storage, backend) | `src/testing/` | done |

## 3. Decisions

### 3.1 Backend: Google Drive `appDataFolder`

| Aspect | Drive `appDataFolder` | Sync code + relay (Workers) |
| --- | --- | --- |
| Operations | none | a server kept alive forever; rate limits, size caps and cleanup of abandoned blobs become duties |
| Account | a Google account | none, only a code to keep |
| Privacy story | "sent only to a hidden folder in your own Drive; the developer runs no server" | "passes through the developer's server, unreadable thanks to end-to-end encryption" |
| Optimistic locking | none (see 3.3) | a Durable Object gives compare-and-swap for free |
| End-to-end encryption | optional (Step 5) | mandatory |
| Browsers | Chrome, Brave, Firefox (`launchWebAuthFlow`) | the same |

Drive ships first because it runs itself, and because the privacy policy can keep saying that the developer holds nothing. The relay is the second backend, for people who do not want Google, in Step 6. The two can coexist: two `SyncBackend` implementations, one engine, one scheduler, one status, one UI.

### 3.2 Auth: `launchWebAuthFlow` and the implicit flow

- `getAuthToken` does not work in Brave (#6). `launchWebAuthFlow` is written the same way for Chrome, Brave and Firefox.
- Google's documentation calls the implicit flow discouraged and points at code + PKCE. But Google's token endpoint demands `client_secret` from "Web application" clients even with PKCE. Shipping a secret inside the extension is out, and a proxy that holds it contradicts "no server". So: implicit flow.
- The danger the implicit flow is known for, the fragment leaking, does not apply: `launchWebAuthFlow` captures the redirect to `https://<extension-id>.chromiumapp.org/` inside the browser and never loads it as a page. The token lives in `chrome.storage.local`, the same trust boundary as the notes.
- The cost: an access token lasts about an hour. Renewal uses `interactive: false` with `prompt=none` and only works while the browser holds a Google session cookie. Without one, the user has to sign in again. That is designed as a `signedOut` state, and the alarm never bothers the user about it (5.2).
- Scopes: `openid email` and `https://www.googleapis.com/auth/drive.appdata`, both non-sensitive. The email is there so that "two devices connected to two different accounts, never converging" shows up on the settings page. It adds one line to the consent screen.
- Two redirect URIs are registered. Chrome and Brave use `https://<extension-id>.chromiumapp.org/`; Firefox uses what `browser.identity.getRedirectURL()` returns, `https://<hash>.extensions.allizom.org/`, derived from the gecko id `fukidashi@thundermiracle.com` in `wxt.config.ts`.
- A dev build has a different extension id from the store build, so the manifest in `wxt.config.ts` becomes a function that adds `key` (the store's public key) only when `mode === "development"`, which makes the ids match.
- The OAuth client is of type "Web application"; the consent screen is in **production** (in testing, only test users can sign in; the 7-day refresh-token expiry #6 mentioned has the same cause). The client id is not a secret, but so that a fork does not share the client it comes from `WXT_GOOGLE_CLIENT_ID` in `.env` through `import.meta.env`.

### 3.3 The remote copy and conflicts

- One file, `fukidashi-notes.json`, directly under `appDataFolder`. Its content is the `SyncPayload` JSON, the same as an export.
- `RemoteSnapshot.version` carries Drive's `version` field (monotonically increasing) as a string. `version` also moves on "changes not visible to the user" on the server side, so a metadata-only change can look like a conflict and burn one retry. Harmless; if it turns out to be noisy, `md5Checksum` is the fallback token.
- **Drive API v3 has no ETag and no If-Match.** v2's `etag` was dropped in v3, and `files.update` has no precondition parameter (checked against the official reference on 2026-09-05). So Drive's `push(payload, baseVersion)` is check-then-write:
  1. `baseVersion` null: create. Afterwards search for the name; two or more hits (a concurrent create) throw `SyncConflictError`. The next pull keeps the file with the highest `version` and deletes the rest.
  2. Otherwise `files.get(fields=version)` and compare. A mismatch throws `SyncConflictError` (the engine pulls, merges and pushes again); a match goes on to `files.update`.
- A few hundred milliseconds remain between the check and the write. Two devices landing in it together means the later write wins. But the earlier device still holds everything locally, so its next sync (the alarm within 15 minutes, or its next edit) pulls, merges and pushes it back. Data is lost for good only if that device never syncs again, and only after both devices pushed unsent changes in the same second.
- The fake backend keeps its strict optimistic locking (stricter than the real thing). The engine runs the same path under both.
- Hardening (Step 4, done): read `headRevisionId` from the `files.update` response and `revisions.list`; if another device's revision sits between the base and the new head, fetch it with `revisions.get?alt=media`, merge, and write the union in place. The push then ends in `SyncConflictError` on purpose: the engine records a checkpoint (the remote's version and the pages' digest) after every round and skips the read while the remote is still at that version, so the remote must never hold anything the engine has not read — the conflict makes it read the union back before it records anything.

### 3.4 Where encryption goes

- `SyncBackend` passes `SyncPayload` objects around. The "payload to bytes" step is cut out as `PayloadCodec { encode(payload): Promise<string>; decode(text): Promise<{ payload, rewrite }> }` and injected into the backend. `decode` also says whether `encode` would have written the text differently; the backend passes that on as `RemoteSnapshot.rewrite`, and the engine then pushes even when the notes agree. That is how a copy changes form without waiting for an edit.
- End-to-end encryption is a codec swap (Step 5, done): AES-256-GCM over the JSON payload, the key from a passphrase through PBKDF2-SHA256 (600k rounds) for Drive, or from the sync code through HKDF for the relay. The envelope `{ version, cipher, kdf: { name, iterations, salt }, iv, ciphertext }` stays JSON; base64 costs a third more bytes, so the 5 MiB cap bites at about 3.7 MiB of notes. Engine and scheduler know nothing of it beyond the `rewrite` flag and one more state, `wrongPassphrase`, which is held back like `signedOut` until the settings page asks for a run.
- The key is derived on the settings page and kept per device (`fukidashi:sync:key`); the passphrase itself is not stored, and the codec reads the key on every call, so a passphrase set on the settings page reaches the backend the scheduler already holds. The salt travels in the envelope: setting a passphrase reads the copy first, and if it is encrypted, derives the key with that copy's salt and iterations and tries it — a wrong passphrase is refused on the spot. Otherwise a fresh salt is drawn, and the next round rewrites the plaintext copy encrypted. Two devices drawing fresh salts before either pushes is the one edge case; the second lands in `wrongPassphrase`, and re-entering the passphrase there adopts the salt.
- The codec reads both forms while it has a key, so a device without the passphrase and one with it share a copy without breaking anything: whatever the plain device pushes is taken in and written back encrypted, and the plain device then shows `wrongPassphrase` — its own notes and the copy untouched — until it is given the passphrase. Encryption is therefore sticky: removing the passphrase on one device rewrites the copy as plaintext (one round with a codec that still opens it but writes plain), but any device that still has it encrypts the copy again on its next round. Disconnecting forgets the key along with the token.
- Optional on Drive (a forgotten passphrase means no more sync, which is a real UX cost, and nobody can recover it). Mandatory for the relay.

### 3.5 The format contract

`readNote` rebuilds each object, so an older extension that pushes a newer payload back drops the fields it does not know. The rule, written down:

- Adding a field bumps `SYNC_FORMAT_VERSION`.
- An older device is refused by `parseSyncPayload`, stops in the `outdated` state and breaks nothing. The store's auto-update resolves it.

## 4. Structure

```
content / popup ──save──▶ chrome.storage.local ──onChanged──▶ background (service worker)
                               ▲                                   │ 5 s debounce / 15-minute alarm / onStartup
                               │ applySyncPages                    ▼
                               └──────────────── syncOnce ──▶ DriveBackend(codec) ──fetch──▶ Google Drive
                                                                    (JSON | AES-GCM)          appDataFolder/fukidashi-notes.json
options page ── connect / disconnect / sync now ──▶ writes fukidashi:sync:* (onChanged wakes the background), runtime message
popup footer ◀── watchSyncStatus ── fukidashi:sync-status
```

| File | Role | Change |
| --- | --- | --- |
| `src/services/sync/drive/auth.ts` | Authorization URL, interactive and silent `launchWebAuthFlow`, token storage, expiry check, revoke | new |
| `src/services/sync/drive/api.ts` | Thin Drive REST client (list / get / create / update / delete; 401 → renew → one retry) | new |
| `src/services/sync/drive/backend.ts` | `createDriveBackend(codec)`: the `SyncBackend` implementation (3.3) | new |
| `src/services/sync/codec.ts` | `PayloadCodec`, the envelope, key derivation, and the one codec — plain or encrypting by its keys | new |
| `src/services/sync/key.ts` | the passphrase-derived key kept on the device | new |
| `src/services/sync/drive/passphrase.ts` | setting and removing the passphrase, as the settings page does it | new |
| `src/services/sync/config.ts` | `SyncConfig` (`{ backend: "drive" }` or absent): load / save / watch | new |
| `src/services/sync/configured.ts` | `loadSyncBackend()` becomes async and builds the backend from the config | changed |
| `src/services/sync/scheduler.ts` | Synchronous listener registration, config watching, lazy backend resolution, alarm guard, backoff, skipping while `signedOut`, `sync-now` | changed |
| `src/services/sync/engine.ts`, `storage.ts` | Read-modify-write window, tombstone purge | changed |
| `src/services/sync/status.ts` | `state` added, `lastSyncedAt` kept on failure | changed |
| `src/services/messages.ts` | `fukidashi:sync-now` | changed |
| `src/entrypoints/background.ts` | Calls `startSync(loadSyncBackend)` synchronously, nothing else | changed |
| `src/entrypoints/options/App.tsx` | Sync section (5.4) | changed |
| `src/entrypoints/popup/App.tsx` | One status line in the footer | changed |
| `src/testing/fakeDrive.ts` | In-memory Drive behind a replaced `fetch`: version numbering, the 5 MB cap, 401 | new |
| `wxt.config.ts` | Permissions, Firefox data collection, the dev `key` | changed |

## 5. Details

### 5.1 The Drive backend

| Operation | Request |
| --- | --- |
| Find | `GET /drive/v3/files?spaces=appDataFolder&q=name='fukidashi-notes.json' and trashed=false&fields=files(id,version,md5Checksum,size)` |
| Read | `GET /drive/v3/files/{id}?alt=media` |
| Create | `POST /upload/drive/v3/files?uploadType=multipart&fields=id,version` (metadata: `{ name, parents: ["appDataFolder"], mimeType: "application/json" }`) |
| Update | `PATCH /upload/drive/v3/files/{id}?uploadType=media&fields=id,version` |
| Delete (optional, on disconnect) | `DELETE /drive/v3/files/{id}` |

- pull: find; nothing found returns null; otherwise read, `codec.decode`, return `{ payload, version }`.
- push: as in 3.3. Returns the `version` after the write.
- Size: up to the 5 MB limit of simple and multipart uploads. Beyond that, `SyncError("too large")` shows up in the status (about 10,000 notes at 500 bytes each). Resumable upload waits until it is needed.
- `host_permissions`: Google's APIs answer CORS, so start without; measure on Chrome and Firefox and add `https://www.googleapis.com/*` only if a browser refuses.
- `md5Checksum` is already in the find result for Step 4's "skip the read when nothing changed".

### 5.2 Auth and tokens

- **Connect (interactive)**: a button on the options page calls `launchWebAuthFlow({ interactive: true, url })`. The URL is `https://accounts.google.com/o/oauth2/v2/auth` with `client_id`, `redirect_uri`, `response_type=token`, `scope`, `state` (random, checked on return) and `prompt=select_account`. The fragment of the response gives `access_token` and `expires_in`; `https://openidconnect.googleapis.com/v1/userinfo` gives the email. Stored as `fukidashi:sync:drive` = `{ accessToken, expiresAt, email }`.
- **Silent renewal**: past `expiresAt` minus 5 minutes, the background calls `launchWebAuthFlow({ interactive: false, url + "&prompt=none&login_hint=<email>" })`. Google answering `#error=interaction_required` / `login_required`, or the API rejecting with "User interaction required", means `signedOut`.
- **401**: one silent renewal, then one retry of the request. Failing that, `signedOut`.
- **While `signedOut`**: alarm and debounce syncs return without touching the network, leaving the state as is. The only way back is the "Sign in" button on the options page (interactive). The popup shows one line.
- **Disconnect**: `POST https://oauth2.googleapis.com/revoke?token=…` (carry on if it fails), then delete the token and the config, then stop the scheduler. With "Also delete the copy in Google Drive" ticked, `files.delete`. The local notes are not touched.
- **Uninstall**: the Drive copy stays. PRIVACY.md documents "Google Drive → Settings → Manage apps → Fukidashi → Delete hidden app data".
- Firefox: whether `chrome.identity.launchWebAuthFlow` returns a promise there, and how the non-interactive window behaves, is checked on a real Firefox (the README's "not tested there" caveat stays until then).

### 5.3 Engine and scheduler fixes (the content of Step 0)

1. **The read-modify-write window** (from the #6 comment): `applySyncPages(pages)` re-reads local storage right before writing and writes `mergeSyncPages(fresh, pages)`. An edit the user made in between has a newer `updatedAt`, so LWW keeps it. The remaining window is the `chrome.storage.local.set` call itself, the same width as today's "editing one page in two tabs" race. The engine keeps pushing `merged`; the edit that arrived in between goes out with the next sync, which `onChanged` sets off anyway.
2. **Status on failure** (from the #6 comment): keep `lastSyncedAt` and add `error` only. Add `state: "off" | "idle" | "syncing" | "signedOut" | "error" | "outdated"`.
3. **Tombstones that never leave**: `applySyncPages` calls `chrome.storage.local.set` directly, bypassing the purge in `writeNotes`, and whatever was purged locally comes back from the remote copy on the next merge. So tombstones stay forever and the payload only grows. `syncOnce` runs `purgeExpiredTombstones(now)` over the merged result before applying and pushing, and drops pages left with no notes. A device that has not synced for more than 30 days can bring back a deleted note, exactly the trade-off `tombstone.ts` already accepts. Optional: `deleteNote` blanks the tombstone's `comment` and `anchor`, so deleted content does not linger on the remote and the payload shrinks.
4. **The alarm re-created on every wake**: `defineBackground` runs every time the service worker wakes, and `chrome.alarms.create` with an existing name resets its period. Create it only when `chrome.alarms.get(SYNC_ALARM)` finds nothing.
5. **The sync at start**: for the same reason an unconditional `sync()` means "two syncs per edit". Limit it to `runtime.onStartup`, `onInstalled`, and "`lastSyncedAt` older than the period". The run right after connecting comes from item 6.
6. **Synchronous listeners and the config watch**: in MV3, listeners for `storage.onChanged`, `alarms.onAlarm`, `runtime.onMessage` and `runtime.onStartup` have to be added synchronously while the worker is first evaluated, or the very event that woke the worker is missed. Today's `startSync(backend)` holds the note-key watcher inside it; making `loadSyncBackend()` async and calling `startSync` after it resolves would mean an edit that wakes a sleeping worker never starts the 5-second debounce and waits for the 15-minute alarm instead. So `startSync` becomes `startSync(resolveBackend)`: it registers its listeners synchronously with no arguments needed, and each handler checks config and state first, then resolves `resolveBackend()` (a cached promise). Changes to `fukidashi:sync:config` are picked up by the same `onChanged` handler: switching on runs one sync immediately, switching off drops the cached backend and clears the alarm. The options page only has to save the config.
7. **Backoff**: 5xx, 429 and network failures push `nextAttemptAt` out by 1, 5, 15, then 60 minutes; alarm and debounce syncs skip until then. "Sync now" ignores it. Success resets it.
8. **A newer payload** (`SyncPayloadError`): go `outdated` and stop retrying.

### 5.4 UI

The Sync section on the options page, built like the Backup and Markdown cards:

| State | Shown |
| --- | --- |
| Not connected | What goes where ("sent only to a hidden folder in your own Google Drive; there is no server of ours") and [Connect Google Drive] |
| Connected | "Connected as <email>", "Last synced 2m ago", [Sync now], [Disconnect] (with an "Also delete the copy in Google Drive" checkbox), and one line for the last error |
| `signedOut` | "Sign in to Google again to keep syncing", [Sign in] |
| `outdated` | "Update Fukidashi to keep syncing" |

Saving the connection makes the background sync once right away (5.3, item 6); the result reaches the settings page through `watchSyncStatus`. The first-connection message says that the notes on this device stay and are combined with what Drive holds, the same meaning as an import.

Popup: one line next to the `ToggleSwitch` in the footer ("Synced 2m ago", "Sign in to sync", "Sync failed"); clicking it opens the settings. Nothing is shown while sync is off.

### 5.5 Manifest, permissions, store disclosures

- `permissions`: `alarms` and `identity` join `storage` and `activeTab`. Neither triggers an install-time warning. A justification for the Chrome Web Store review: "sign-in and periodic runs for the optional Google Drive sync".
- Firefox: `data_collection_permissions` becomes `{ required: ["none"], optional: ["browsingActivity", "websiteContent"] }`, requested at connect time with `browser.permissions.request({ data_collection: [...] })`, because URLs (`browsingActivity`) and quoted text (`websiteContent`) leave the device. Whether `"none"` may sit next to `optional` is checked with `web-ext lint` and on AMO; if not, they move to `required`.
- Chrome Web Store privacy practices: declare "Web history" and "Website content", purpose: sync.
- OAuth consent screen: production, with app name, logo, home page and privacy policy URL. Brand verification is optional.
- Documents: PRIVACY.md (rewrite "never sent anywhere" around the optional Drive sync), README (a feature entry; drop "not synced between machines" from Limitations), AGENTS.md (the sync section and the permissions).

### 5.6 Traffic and quotas

| Size | Payload | Idle (list + read every 15 minutes) |
| --- | --- | --- |
| 100 notes | about 40 KB | about 4 MB/day |
| 500 notes | about 200 KB | about 20 MB/day |
| 2,000 notes | about 800 KB | about 80 MB/day |

- Step 4 (done) brings idle syncs down to one list request: after each round the engine records the remote's version token and a digest of the pages in `fukidashi:sync:checkpoint`; a round that finds the remote still at that version skips the read, and pushes without reading when only this device changed.
- The Drive API quota (12,000 requests per minute per user) is nowhere near. `appDataFolder` counts against the user's own Drive storage.

## 6. Steps (one issue each)

Dependencies: 0 → 1 → 2 → 3. Steps 4 and 5 follow 2 and are independent of each other. Step 6 follows 5.

### Step 0: close the gaps in the foundation

- Why: these are the defects that bite the moment a real backend is connected, and every one of them can be verified with the fakes.
- Scope: items 1 to 8 of 5.3 plus `config.ts` (backoff and `outdated` only as far as the state type and the checks). The `startSync(resolveBackend)` split is verified with a resolver that returns the fake backend.
- Acceptance: an edit made with `saveNote` between the pull and the apply survives / `lastSyncedAt` survives a failure / tombstones past the TTL are gone from both sides after a sync / a second `startSync`, standing in for a worker restart, does not re-create the alarm / a note edit sets off the debounced sync even when the resolver resolves after the listeners were registered / switching the config on, off and on again stops the sync and runs one right after it is switched back on.
- Out of scope: Drive, UI.

### Step 1: the Drive client and auth (no UI)

- Why: the least certain parts (`launchWebAuthFlow` behaviour, CORS, Drive's `version`) get settled without a UI in the way.
- Scope: `drive/auth.ts`, `drive/api.ts`, `drive/backend.ts`, `codec.ts`, `testing/fakeDrive.ts`. Google Cloud setup: the client, both redirect URIs, the consent screen moved to production. The dev `key`.
- Acceptance: the two-device scenarios of `engine.spec.ts` pass unchanged against the fake Drive / a `version` mismatch throws `SyncConflictError` / 401 → silent renewal → retry happens exactly once / over 5 MB gives `too large` / interactive sign-in and a token work on real Chrome, Brave and Firefox (by hand).
- Out of scope: the settings UI, store disclosures.

### Step 2: connecting the backend, the settings UI, the status

- Why: the first version a user can touch.
- Scope: `configured.ts` (building the Drive backend from the config), the Sync section on the options page, the popup footer, the `sync-now` message, disconnect (revoke, optional Drive deletion).
- Acceptance: adds, edits and deletes converge between two profiles within 15 minutes (by hand) / one profile taken offline, edited, and brought back converges / after the token expires (`expiresAt` set into the past) it recovers silently; signed out of Google it goes `signedOut` and the alarm does not nag / `App.spec.tsx` (options) covers connect, disconnect and the `signedOut` display.
- Out of scope: encryption, traffic optimization.

### Step 3: manifest, store, documents

- Scope: all of 5.5. The Firefox data-collection declaration and its consent prompt checked on a real Firefox.
- Acceptance: `web-ext lint` passes / both the Chrome and the Firefox build show the expected permission warnings / PRIVACY.md, README and AGENTS.md are updated.
- This is the cut for a 0.4.0 release.

### Step 4: less traffic, less risk

- Scope: skip the read when nothing changed (5.6), conflict repair through `revisions` (3.3), optionally blanking tombstones.
- Acceptance: an idle alarm sync finishes with one list request / a test that reproduces a simultaneous push ends with both sides' changes in one push.

### Step 5: the encryption codec (optional on Drive) — done

- Scope: the AES-256-GCM codec, a passphrase setting on the options page (set, unlock, remove), key storage (`chrome.storage.local`, never synced), the `wrongPassphrase` state. Migration from an existing plaintext file: it reads as plaintext, and is written back encrypted on the next round through the `rewrite` flag (3.4).
- Acceptance: an encrypted device and a plaintext device side by side break nothing (`engine.spec.ts`, "a browser with a passphrase beside one without"), and "wrong passphrase" shows as a state (`scheduler.spec.ts`).

### Step 6: the sync-code relay (second backend)

- Outline: 16 random bytes as the seed; HKDF derives the blob id (public) and the key (private). Cloudflare Workers with a Durable Object expose only `GET /v1/blob/{id}` (`If-None-Match`) and `PUT /v1/blob/{id}` (`If-Match`). 2 MB cap, 60 requests per minute per id, deleted after 90 days unused. Fits `SyncBackend` as is and uses the Step 5 codec, mandatory this time.
- Not started in this stage.

## 7. Test plan

- Unit: `drive/api.ts` against `fakeDrive` (version numbering, multipart and media, 401 → renewal, the 5 MB cap), `drive/auth.ts` (URL building, fragment parsing, `state` check, handling of `interaction_required`), `codec.ts`.
- Engine: the Step 0 acceptance list goes straight into `engine.spec.ts`, `scheduler.spec.ts` and `storage.spec.ts`.
- UI: `options/App.spec.tsx` with `chrome.identity` stubbed covers connect, disconnect and `signedOut`; `popup/App.spec.tsx` covers the footer line.
- Manual matrix (Steps 2 and 3): Chrome × Brave × Firefox, two profiles each. Offline edits, deletion propagating, token expiry, signing out of Google, the email shown when a second account is connected, what is left in Drive after an uninstall.

## 8. Risks and open points

| Item | What | Handling |
| --- | --- | --- |
| Session-cookie dependence | A browser not signed in to Google goes `signedOut` every hour | Shown as a state. If it turns out common, consider pointing at the relay (Step 6) |
| No compare-and-swap on Drive | A window of a few hundred ms in which a write can be overwritten | Accepted through self-repair; closed by the `revisions` repair in Step 4 |
| `"none"` next to `optional` | Unverified whether AMO accepts it | `web-ext lint` in Step 3; fall back to `required` |
| `host_permissions` | Unverified whether CORS alone is enough | Checked in Step 1 |
| `chrome.identity` on Firefox | Promise support and non-interactive behaviour unverified | The manual check in Step 1 |
| Clock skew | LWW trusts each device's clock (the #3 trade-off) | Unchanged. Warning when the remote `exportedAt` is more than a day in the future: parked |
| Device list | No view of which device synced when | If wanted: `appProperties` or a small sidecar file per device |

## 9. References

- Drive API v3 `files` resource (no `etag`; `version`, `headRevisionId`, `md5Checksum`): https://developers.google.com/workspace/drive/api/reference/rest/v3/files
- Drive API v3 `files.update` (no precondition parameters): https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update
- Drive API v2 versus v3: https://developers.google.com/workspace/drive/api/guides/v3versusv2
- Storing application-specific data (`appDataFolder`): https://developers.google.com/workspace/drive/api/guides/appdata
- Drive API scopes (`drive.appdata` is non-sensitive): https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- OAuth 2.0 implicit flow (the deprecation note and `prompt=none`): https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow
- `chrome.identity` (`launchWebAuthFlow`, `interactive`, `timeoutMsForNonInteractive`): https://developer.chrome.com/docs/extensions/reference/api/identity
- Firefox `identity.launchWebAuthFlow`: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity/launchWebAuthFlow
- Firefox built-in data consent (category definitions, `permissions.request({ data_collection })`): https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
- `browser_specific_settings.gecko.data_collection_permissions`: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings
