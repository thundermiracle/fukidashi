import { type KeyboardEvent, useCallback, useEffect, useState } from "react";
import { formatRelativeTime } from "@/core";
import { requestSyncNow } from "@/services/messages";
import {
  connectDrive,
  connectWithCode,
  connectWithNewCode,
  DEFAULT_SYNC_STATUS,
  disconnectDrive,
  disconnectRelay,
  loadDriveToken,
  loadRelayCode,
  loadSyncConfig,
  loadSyncKey,
  loadSyncStatus,
  removeSyncPassphrase,
  type SyncConfig,
  SyncPassphraseError,
  SyncSignedOutError,
  type SyncStatus,
  setSyncPassphrase,
  watchSyncConfig,
  watchSyncKey,
  watchSyncStatus,
} from "@/services/sync";

type Outcome = { kind: "done" | "failed"; message: string };

/** One sentence on where syncing stands, for the Drive card. */
function describeDriveStatus(status: SyncStatus, encrypted: boolean): string {
  switch (status.state) {
    case "signedOut":
      return "Google needs you to sign in again before anything can sync.";
    case "wrongPassphrase":
      return encrypted
        ? "The passphrase on this browser is not the one the copy in Drive was encrypted with. Enter that one to keep syncing."
        : "The copy in Drive is encrypted. Enter its passphrase to keep syncing.";
    case "outdated":
      return "The copy in Drive was written by a newer version of Fukidashi. Update the extension to keep syncing.";
    default:
      return describeCommonStatus(status);
  }
}

/** The same, for the sync-code card, where the copy is always encrypted with the code. */
function describeRelayStatus(status: SyncStatus): string {
  switch (status.state) {
    case "wrongPassphrase":
      return "The notes on the relay were not written with this code. Disconnect and join again with the right code, or create a new one.";
    case "outdated":
      return "The notes on the relay were written by a newer version of Fukidashi. Update the extension to keep syncing.";
    default:
      return describeCommonStatus(status);
  }
}

function describeCommonStatus(status: SyncStatus): string {
  switch (status.state) {
    case "syncing":
      return "Syncing…";
    case "error":
      return `Could not sync: ${(status.error ?? "something went wrong").replace(/\.$/, "")}. Fukidashi keeps trying.`;
    default:
      return status.lastSyncedAt > 0
        ? `Last synced ${formatRelativeTime(status.lastSyncedAt)}.`
        : "Not synced yet.";
  }
}

function whyDisconnectFailed(error: unknown): string {
  if (error instanceof SyncSignedOutError) {
    return "Sign in first to delete the copy, or disconnect without deleting it.";
  }
  return error instanceof Error ? error.message : "Could not disconnect.";
}

function whyPassphraseFailed(error: unknown, fallback: string): string {
  if (error instanceof SyncPassphraseError) {
    return "That is not the passphrase the copy in Drive was encrypted with.";
  }
  if (error instanceof SyncSignedOutError) return "Sign in first.";
  return error instanceof Error ? error.message : fallback;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Connecting a backend, and what the connection is up to. Whether the
 * device is connected, and to what, is the config's word; what state the
 * sync is in is the background's, which arrives through the status;
 * whether the notes leave encrypted is the key's, kept on this device.
 */
export function SyncSection() {
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [status, setStatus] = useState<SyncStatus>(DEFAULT_SYNC_STATUS);
  const [email, setEmail] = useState("");
  const [encrypted, setEncrypted] = useState(false);
  const [deleteCopy, setDeleteCopy] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [repeat, setRepeat] = useState("");
  const [codeEntered, setCodeEntered] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [codeShown, setCodeShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  /** Whether this build was told where the relay answers; without it there is nothing to offer. */
  const hasRelay = Boolean(import.meta.env.WXT_SYNC_RELAY_URL);

  useEffect(() => {
    loadSyncConfig().then(setConfig);
    loadSyncStatus().then(setStatus);
    loadDriveToken().then((token) => setEmail(token?.email ?? ""));
    loadSyncKey().then((key) => setEncrypted(key !== null));
    loadRelayCode().then(setCode);
    const stopWatchingConfig = watchSyncConfig(setConfig);
    const stopWatchingStatus = watchSyncStatus(setStatus);
    const stopWatchingKey = watchSyncKey((key) => setEncrypted(key !== null));
    return () => {
      stopWatchingConfig();
      stopWatchingStatus();
      stopWatchingKey();
    };
  }, []);

  /** Runs one of the flows, keeping the card quiet meanwhile and saying how it went. */
  const perform = useCallback(
    async (work: () => Promise<Outcome | null>, describeFailure: (error: unknown) => string) => {
      setBusy(true);
      setOutcome(null);
      try {
        setOutcome(await work());
      } catch (error) {
        console.error("Fukidashi: sync settings", error);
        setOutcome({ kind: "failed", message: describeFailure(error) });
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const handleConnect = useCallback(
    () =>
      perform(
        async () => {
          const token = await connectDrive();
          setEmail(token.email);
          return null;
        },
        (error) => messageOf(error, "Could not connect Google Drive."),
      ),
    [perform],
  );

  const handleDisconnect = useCallback(
    () =>
      perform(async () => {
        await disconnectDrive({ deleteRemoteCopy: deleteCopy });
        setEmail("");
        setDeleteCopy(false);
        return {
          kind: "done",
          message: deleteCopy
            ? "Disconnected. The copy in Google Drive is gone; the notes here stay."
            : "Disconnected. The copy in Google Drive stays where it is, and so do the notes here.",
        };
      }, whyDisconnectFailed),
    [deleteCopy, perform],
  );

  // Unlocking means the copy in Drive already has a passphrase, which the
  // service checks the entry against. Setting one afresh has nothing to
  // check against, so it is asked for twice: a typo here would lock every
  // other browser out.
  const unlocking = status.state === "wrongPassphrase";
  const fresh = !unlocking && !encrypted;

  const handleSetPassphrase = useCallback(() => {
    if (passphrase === "") {
      setOutcome({ kind: "failed", message: "Enter a passphrase." });
      return;
    }
    if (fresh && repeat !== passphrase) {
      setOutcome({ kind: "failed", message: "The two passphrases differ." });
      return;
    }
    return perform(
      async () => {
        await setSyncPassphrase(passphrase);
        setPassphrase("");
        setRepeat("");
        return {
          kind: "done",
          message: unlocking
            ? "Passphrase accepted. Syncing again."
            : "Encrypted. From now on the notes leave this browser encrypted, and every other browser you connect will ask for the passphrase.",
        };
      },
      (error) => whyPassphraseFailed(error, "Could not set the passphrase."),
    );
  }, [passphrase, repeat, fresh, unlocking, perform]);

  const handleRemovePassphrase = useCallback(
    () =>
      perform(
        async () => {
          await removeSyncPassphrase();
          return {
            kind: "done",
            message:
              "Passphrase removed. The copy in Drive is stored as it is again — until a browser that still has the passphrase encrypts it back.",
          };
        },
        (error) => whyPassphraseFailed(error, "Could not remove the passphrase."),
      ),
    [perform],
  );

  const handleCreateCode = useCallback(
    () =>
      perform(
        async () => {
          const created = await connectWithNewCode();
          setCode(created);
          setCodeShown(true);
          return {
            kind: "done",
            message:
              "Here is your sync code. Enter it on your other browsers to sync the same notes.",
          };
        },
        (error) => messageOf(error, "Could not create a sync code."),
      ),
    [perform],
  );

  const handleJoin = useCallback(() => {
    if (codeEntered.trim() === "") {
      setOutcome({ kind: "failed", message: "Enter the sync code from your other browser." });
      return;
    }
    return perform(
      async () => {
        await connectWithCode(codeEntered);
        setCode(await loadRelayCode());
        setCodeEntered("");
        return { kind: "done", message: "Joined. The notes are on their way." };
      },
      (error) => messageOf(error, "Could not join with that code."),
    );
  }, [codeEntered, perform]);

  const handleDisconnectRelay = useCallback(
    () =>
      perform(
        async () => {
          await disconnectRelay({ deleteRemoteCopy: deleteCopy });
          setCode(null);
          setCodeShown(false);
          setDeleteCopy(false);
          return {
            kind: "done",
            message: deleteCopy
              ? "Disconnected. The notes on the relay are gone; the notes here stay."
              : "Disconnected. The notes on the relay stay for your other browsers, and so do the notes here.",
          };
        },
        (error) => messageOf(error, "Could not disconnect."),
      ),
    [deleteCopy, perform],
  );

  const handleCopyCode = useCallback(
    () =>
      perform(
        async () => {
          if (code === null) return null;
          await navigator.clipboard.writeText(code);
          return { kind: "done", message: "Copied." };
        },
        () => "Could not copy the code; select it and copy it by hand.",
      ),
    [code, perform],
  );

  const submitOnEnter = (handler: () => void) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") handler();
  };

  const outcomeLine = outcome && (
    <p
      className={`fk-card__outcome${outcome.kind === "failed" ? " fk-card__outcome--failed" : ""}`}
    >
      {outcome.message}
    </p>
  );

  const deleteCopyField = (label: string) => (
    <label className="fk-field">
      <input
        type="checkbox"
        checked={deleteCopy}
        disabled={busy}
        onChange={(event) => setDeleteCopy(event.target.checked)}
      />
      {label}
    </label>
  );

  if (!config) {
    // A build with no relay address cannot sync with a code at all, so it is
    // not offered: a fork that runs no relay of its own shows the Drive half
    // alone, rather than a button that always refuses.
    if (!hasRelay) {
      return (
        <section className="fk-card">
          <h3 className="fk-card__title">Keep your notes on every browser</h3>
          <p className="fk-card__body">
            Connect Google Drive and the notes you write here turn up in every other browser you
            connect, edits and deletions included. They go to a hidden folder in your own Google
            Drive that only Fukidashi can read — there is no server of ours in between.
          </p>
          <button type="button" className="fk-button" disabled={busy} onClick={handleConnect}>
            Connect Google Drive
          </button>
          {outcomeLine}
        </section>
      );
    }

    return (
      <section className="fk-card">
        <h3 className="fk-card__title">Keep your notes on every browser</h3>
        <p className="fk-card__body">
          Connect Google Drive, or use a sync code, and the notes you write here turn up in every
          other browser you connect, edits and deletions included.
        </p>
        <div className="fk-card__group">
          <h4 className="fk-card__heading">Google Drive</h4>
          <p className="fk-card__body">
            The notes go to a hidden folder in your own Google Drive that only Fukidashi can read —
            there is no server of ours in between.
          </p>
          <button type="button" className="fk-button" disabled={busy} onClick={handleConnect}>
            Connect Google Drive
          </button>
        </div>
        <div className="fk-card__group">
          <h4 className="fk-card__heading">Sync code</h4>
          <p className="fk-card__body">
            No Google account needed. The notes travel encrypted with the code through a relay run
            by the developer of Fukidashi, which cannot read them. Create a code here and enter it
            on your other browsers, or enter one you already have.
          </p>
          <div className="fk-card__row">
            <button type="button" className="fk-button" disabled={busy} onClick={handleCreateCode}>
              Create a sync code
            </button>
            <input
              type="text"
              className="fk-input"
              aria-label="Sync code"
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              autoComplete="off"
              spellCheck={false}
              value={codeEntered}
              disabled={busy}
              onChange={(event) => setCodeEntered(event.target.value)}
              onKeyDown={submitOnEnter(handleJoin)}
            />
            <button type="button" className="fk-button" disabled={busy} onClick={handleJoin}>
              Join
            </button>
          </div>
        </div>
        {outcomeLine}
      </section>
    );
  }

  if (config.backend === "relay") {
    return (
      <section className="fk-card">
        <h3 className="fk-card__title">Sync code</h3>
        <p className="fk-card__body">Connected with a sync code. {describeRelayStatus(status)}</p>
        <div className="fk-card__row">
          <button
            type="button"
            className="fk-button"
            disabled={busy || status.state === "syncing"}
            onClick={() => requestSyncNow()}
          >
            Sync now
          </button>
          <button
            type="button"
            className="fk-button"
            disabled={busy || code === null}
            onClick={() => setCodeShown((shown) => !shown)}
          >
            {codeShown ? "Hide code" : "Show code"}
          </button>
          <button
            type="button"
            className="fk-button"
            disabled={busy}
            onClick={handleDisconnectRelay}
          >
            Disconnect
          </button>
          {deleteCopyField("Also delete the notes on the relay")}
        </div>
        {codeShown && code !== null && (
          <div className="fk-card__group">
            <h4 className="fk-card__heading">Your sync code</h4>
            <p className="fk-card__body">
              Enter it on another browser to sync the same notes there. Anyone who has it can read
              and change the notes, so treat it as you would a password — and keep a copy: a lost
              code cannot be recovered.
            </p>
            <div className="fk-card__row">
              <code className="fk-code">{code}</code>
              <button type="button" className="fk-button" disabled={busy} onClick={handleCopyCode}>
                Copy
              </button>
            </div>
          </div>
        )}
        <div className="fk-card__group">
          <p className="fk-card__body fk-card__body--last">
            The notes are encrypted with the code before they leave this browser. The relay, run by
            the developer of Fukidashi, holds only what it cannot read, and lets go of notes nobody
            has synced for 90 days.
          </p>
        </div>
        {outcomeLine}
      </section>
    );
  }

  const passphraseField = (
    <input
      type="password"
      className="fk-input"
      aria-label="Passphrase"
      placeholder="Passphrase"
      autoComplete={fresh ? "new-password" : "current-password"}
      value={passphrase}
      disabled={busy}
      onChange={(event) => setPassphrase(event.target.value)}
      onKeyDown={submitOnEnter(handleSetPassphrase)}
    />
  );

  return (
    <section className="fk-card">
      <h3 className="fk-card__title">Google Drive</h3>
      <p className="fk-card__body">
        {email ? `Connected as ${email}. ` : "Connected. "}
        {describeDriveStatus(status, encrypted)}
      </p>
      <div className="fk-card__row">
        {status.state === "signedOut" ? (
          <button type="button" className="fk-button" disabled={busy} onClick={handleConnect}>
            Sign in
          </button>
        ) : (
          <button
            type="button"
            className="fk-button"
            disabled={busy || status.state === "syncing"}
            onClick={() => requestSyncNow()}
          >
            Sync now
          </button>
        )}
        <button type="button" className="fk-button" disabled={busy} onClick={handleDisconnect}>
          Disconnect
        </button>
        {deleteCopyField("Also delete the copy in Google Drive")}
      </div>
      <div className="fk-card__group">
        <h4 className="fk-card__heading">Encryption</h4>
        {unlocking ? (
          <div className="fk-card__row">
            {passphraseField}
            <button
              type="button"
              className="fk-button"
              disabled={busy}
              onClick={handleSetPassphrase}
            >
              Unlock
            </button>
          </div>
        ) : encrypted ? (
          <>
            <p className="fk-card__body">
              Encrypted with a passphrase; every other browser you connect needs it too. Removing it
              writes the copy in Drive back as it is — until a browser that still has the passphrase
              encrypts it again.
            </p>
            <button
              type="button"
              className="fk-button"
              disabled={busy}
              onClick={handleRemovePassphrase}
            >
              Remove passphrase
            </button>
          </>
        ) : (
          <>
            <p className="fk-card__body">
              The copy in Drive holds the notes as they are. Set a passphrase and they are encrypted
              before they leave this browser; every browser you connect will need it, and a
              forgotten one cannot be recovered.
            </p>
            <div className="fk-card__row">
              {passphraseField}
              <input
                type="password"
                className="fk-input"
                aria-label="Repeat the passphrase"
                placeholder="Repeat the passphrase"
                autoComplete="new-password"
                value={repeat}
                disabled={busy}
                onChange={(event) => setRepeat(event.target.value)}
                onKeyDown={submitOnEnter(handleSetPassphrase)}
              />
              <button
                type="button"
                className="fk-button"
                disabled={busy}
                onClick={handleSetPassphrase}
              >
                Encrypt
              </button>
            </div>
          </>
        )}
      </div>
      {outcomeLine}
    </section>
  );
}
