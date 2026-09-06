import { type KeyboardEvent, useCallback, useEffect, useState } from "react";
import { formatRelativeTime } from "@/core";
import { requestSyncNow } from "@/services/messages";
import {
  connectDrive,
  DEFAULT_SYNC_STATUS,
  disconnectDrive,
  loadDriveToken,
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

/** One sentence on where syncing stands, for the connected card. */
function describeStatus(status: SyncStatus, encrypted: boolean): string {
  switch (status.state) {
    case "signedOut":
      return "Google needs you to sign in again before anything can sync.";
    case "wrongPassphrase":
      return encrypted
        ? "The passphrase on this browser is not the one the copy in Drive was encrypted with. Enter that one to keep syncing."
        : "The copy in Drive is encrypted. Enter its passphrase to keep syncing.";
    case "outdated":
      return "The copy in Drive was written by a newer version of Fukidashi. Update the extension to keep syncing.";
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

/**
 * Connecting Google Drive, and what the connection is up to. Whether the
 * device is connected is the config's word; what state the sync is in is
 * the background's, which arrives through the status; whether the notes
 * leave encrypted is the key's, kept on this device.
 */
export function SyncSection() {
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [status, setStatus] = useState<SyncStatus>(DEFAULT_SYNC_STATUS);
  const [email, setEmail] = useState("");
  const [encrypted, setEncrypted] = useState(false);
  const [deleteCopy, setDeleteCopy] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    loadSyncConfig().then(setConfig);
    loadSyncStatus().then(setStatus);
    loadDriveToken().then((token) => setEmail(token?.email ?? ""));
    loadSyncKey().then((key) => setEncrypted(key !== null));
    const stopWatchingConfig = watchSyncConfig(setConfig);
    const stopWatchingStatus = watchSyncStatus(setStatus);
    const stopWatchingKey = watchSyncKey((key) => setEncrypted(key !== null));
    return () => {
      stopWatchingConfig();
      stopWatchingStatus();
      stopWatchingKey();
    };
  }, []);

  const handleConnect = useCallback(async () => {
    setBusy(true);
    setOutcome(null);
    try {
      const token = await connectDrive();
      setEmail(token.email);
    } catch (error) {
      console.error("Fukidashi: could not connect Google Drive", error);
      setOutcome({
        kind: "failed",
        message: error instanceof Error ? error.message : "Could not connect Google Drive.",
      });
    } finally {
      setBusy(false);
    }
  }, []);

  const handleDisconnect = useCallback(async () => {
    setBusy(true);
    setOutcome(null);
    try {
      await disconnectDrive({ deleteRemoteCopy: deleteCopy });
      setEmail("");
      setOutcome({
        kind: "done",
        message: deleteCopy
          ? "Disconnected. The copy in Google Drive is gone; the notes here stay."
          : "Disconnected. The copy in Google Drive stays where it is, and so do the notes here.",
      });
      setDeleteCopy(false);
    } catch (error) {
      console.error("Fukidashi: could not disconnect Google Drive", error);
      setOutcome({ kind: "failed", message: whyDisconnectFailed(error) });
    } finally {
      setBusy(false);
    }
  }, [deleteCopy]);

  // Unlocking means the copy in Drive already has a passphrase, which the
  // service checks the entry against. Setting one afresh has nothing to
  // check against, so it is asked for twice: a typo here would lock every
  // other browser out.
  const unlocking = status.state === "wrongPassphrase";
  const fresh = !unlocking && !encrypted;

  const handleSetPassphrase = useCallback(async () => {
    if (passphrase === "") {
      setOutcome({ kind: "failed", message: "Enter a passphrase." });
      return;
    }
    if (fresh && repeat !== passphrase) {
      setOutcome({ kind: "failed", message: "The two passphrases differ." });
      return;
    }

    setBusy(true);
    setOutcome(null);
    try {
      await setSyncPassphrase(passphrase);
      setPassphrase("");
      setRepeat("");
      setOutcome({
        kind: "done",
        message: unlocking
          ? "Passphrase accepted. Syncing again."
          : "Encrypted. From now on the notes leave this browser encrypted, and every other browser you connect will ask for the passphrase.",
      });
    } catch (error) {
      console.error("Fukidashi: could not set the passphrase", error);
      setOutcome({
        kind: "failed",
        message: whyPassphraseFailed(error, "Could not set the passphrase."),
      });
    } finally {
      setBusy(false);
    }
  }, [passphrase, repeat, fresh, unlocking]);

  const handleRemovePassphrase = useCallback(async () => {
    setBusy(true);
    setOutcome(null);
    try {
      await removeSyncPassphrase();
      setOutcome({
        kind: "done",
        message:
          "Passphrase removed. The copy in Drive is stored as it is again — until a browser that still has the passphrase encrypts it back.",
      });
    } catch (error) {
      console.error("Fukidashi: could not remove the passphrase", error);
      setOutcome({
        kind: "failed",
        message: whyPassphraseFailed(error, "Could not remove the passphrase."),
      });
    } finally {
      setBusy(false);
    }
  }, []);

  const submitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") handleSetPassphrase();
  };

  const outcomeLine = outcome && (
    <p
      className={`fk-card__outcome${outcome.kind === "failed" ? " fk-card__outcome--failed" : ""}`}
    >
      {outcome.message}
    </p>
  );

  if (!config) {
    return (
      <section className="fk-card">
        <h3 className="fk-card__title">Keep your notes on every browser</h3>
        <p className="fk-card__body">
          Connect Google Drive and the notes you write here turn up in every other browser you
          connect, edits and deletions included. They go to a hidden folder in your own Google Drive
          that only Fukidashi can read — there is no server of ours in between.
        </p>
        <button type="button" className="fk-button" disabled={busy} onClick={handleConnect}>
          Connect Google Drive
        </button>
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
      onKeyDown={submitOnEnter}
    />
  );

  return (
    <section className="fk-card">
      <h3 className="fk-card__title">Google Drive</h3>
      <p className="fk-card__body">
        {email ? `Connected as ${email}. ` : "Connected. "}
        {describeStatus(status, encrypted)}
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
        <label className="fk-field">
          <input
            type="checkbox"
            checked={deleteCopy}
            disabled={busy}
            onChange={(event) => setDeleteCopy(event.target.checked)}
          />
          Also delete the copy in Google Drive
        </label>
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
                onKeyDown={submitOnEnter}
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
