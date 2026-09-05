import { useCallback, useEffect, useState } from "react";
import { formatRelativeTime } from "@/core";
import { requestSyncNow } from "@/services/messages";
import {
  connectDrive,
  DEFAULT_SYNC_STATUS,
  disconnectDrive,
  loadDriveToken,
  loadSyncConfig,
  loadSyncStatus,
  type SyncConfig,
  SyncSignedOutError,
  type SyncStatus,
  watchSyncConfig,
  watchSyncStatus,
} from "@/services/sync";

type Outcome = { kind: "done" | "failed"; message: string };

/** One sentence on where syncing stands, for the connected card. */
function describeStatus(status: SyncStatus): string {
  switch (status.state) {
    case "signedOut":
      return "Google needs you to sign in again before anything can sync.";
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

/**
 * Connecting Google Drive, and what the connection is up to. Whether the
 * device is connected is the config's word; what state the sync is in is
 * the background's, which arrives through the status.
 */
export function SyncSection() {
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [status, setStatus] = useState<SyncStatus>(DEFAULT_SYNC_STATUS);
  const [email, setEmail] = useState("");
  const [deleteCopy, setDeleteCopy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    loadSyncConfig().then(setConfig);
    loadSyncStatus().then(setStatus);
    loadDriveToken().then((token) => setEmail(token?.email ?? ""));
    const stopWatchingConfig = watchSyncConfig(setConfig);
    const stopWatchingStatus = watchSyncStatus(setStatus);
    return () => {
      stopWatchingConfig();
      stopWatchingStatus();
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

  return (
    <section className="fk-card">
      <h3 className="fk-card__title">Google Drive</h3>
      <p className="fk-card__body">
        {email ? `Connected as ${email}. ` : "Connected. "}
        {describeStatus(status)}
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
      {outcomeLine}
    </section>
  );
}
