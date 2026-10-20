import { type KeyboardEvent, useCallback, useEffect, useState } from "react";
import { formatAge, t } from "@/services/i18n";
import { requestSyncNow } from "@/services/messages";
import {
  connectDrive,
  DataCollectionRefusedError,
  DEFAULT_SYNC_STATUS,
  disconnectDrive,
  loadDriveToken,
  loadSyncConfig,
  loadSyncKey,
  loadSyncStatus,
  removeSyncPassphrase,
  SignInCancelledError,
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
      return t("driveSignedOut");
    case "wrongPassphrase":
      return encrypted ? t("driveWrongPassphrase") : t("driveNeedsPassphrase");
    case "outdated":
      return t("driveOutdated");
    default:
      return describeCommonStatus(status);
  }
}

function describeCommonStatus(status: SyncStatus): string {
  switch (status.state) {
    case "syncing":
      return t("syncing");
    case "error":
      // The reason is a sentence of its own; the message closes it.
      return t("syncCouldNot", {
        error: (status.error ?? t("syncSomethingWrong")).replace(/[.。]$/, ""),
      });
    default:
      return status.lastSyncedAt > 0
        ? t("lastSyncedAgo", { age: formatAge(status.lastSyncedAt) })
        : t("notSyncedYetSentence");
  }
}

function whyConnectFailed(error: unknown): string {
  if (error instanceof SignInCancelledError) return t("signInCancelled");
  if (error instanceof DataCollectionRefusedError) return t("dataCollectionRefused");
  return messageOf(error, t("connectFailed"));
}

function whyDisconnectFailed(error: unknown): string {
  if (error instanceof SyncSignedOutError) return t("disconnectSignInFirst");
  return messageOf(error, t("disconnectFailed"));
}

function whyPassphraseFailed(error: unknown, fallback: string): string {
  if (error instanceof SyncPassphraseError) return t("passphraseNotThatOne");
  if (error instanceof SyncSignedOutError) return t("signInFirst");
  return messageOf(error, fallback);
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
      perform(async () => {
        const token = await connectDrive();
        setEmail(token.email);
        return null;
      }, whyConnectFailed),
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
          message: deleteCopy ? t("disconnectedDeleted") : t("disconnectedKept"),
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
      setOutcome({ kind: "failed", message: t("enterPassphrase") });
      return;
    }
    if (fresh && repeat !== passphrase) {
      setOutcome({ kind: "failed", message: t("passphrasesDiffer") });
      return;
    }
    return perform(
      async () => {
        await setSyncPassphrase(passphrase);
        setPassphrase("");
        setRepeat("");
        return {
          kind: "done",
          message: unlocking ? t("passphraseAccepted") : t("encryptedNow"),
        };
      },
      (error) => whyPassphraseFailed(error, t("passphraseSetFailed")),
    );
  }, [passphrase, repeat, fresh, unlocking, perform]);

  const handleRemovePassphrase = useCallback(
    () =>
      perform(
        async () => {
          await removeSyncPassphrase();
          return { kind: "done", message: t("passphraseRemoved") };
        },
        (error) => whyPassphraseFailed(error, t("passphraseRemoveFailed")),
      ),
    [perform],
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
    return (
      <section className="fk-card">
        <h3 className="fk-card__title">{t("syncIntroTitle")}</h3>
        <p className="fk-card__body">{t("syncIntroBody")}</p>
        <button type="button" className="fk-button" disabled={busy} onClick={handleConnect}>
          {t("connectDrive")}
        </button>
        {outcomeLine}
      </section>
    );
  }

  const passphraseField = (
    <input
      type="password"
      className="fk-input"
      aria-label={t("passphrase")}
      placeholder={t("passphrase")}
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
        {email
          ? t("connectedAs", { email, status: describeDriveStatus(status, encrypted) })
          : t("connected", { status: describeDriveStatus(status, encrypted) })}
      </p>
      <div className="fk-card__row">
        {status.state === "signedOut" ? (
          <button type="button" className="fk-button" disabled={busy} onClick={handleConnect}>
            {t("signIn")}
          </button>
        ) : (
          <button
            type="button"
            className="fk-button"
            disabled={busy || status.state === "syncing"}
            onClick={() => requestSyncNow()}
          >
            {t("syncNow")}
          </button>
        )}
        <button type="button" className="fk-button" disabled={busy} onClick={handleDisconnect}>
          {t("disconnect")}
        </button>
        {deleteCopyField(t("alsoDeleteCopy"))}
      </div>
      <div className="fk-card__group">
        <h4 className="fk-card__heading">{t("encryptionHeading")}</h4>
        {unlocking ? (
          <div className="fk-card__row">
            {passphraseField}
            <button
              type="button"
              className="fk-button"
              disabled={busy}
              onClick={handleSetPassphrase}
            >
              {t("unlock")}
            </button>
          </div>
        ) : encrypted ? (
          <>
            <p className="fk-card__body">{t("encryptedBody")}</p>
            <button
              type="button"
              className="fk-button"
              disabled={busy}
              onClick={handleRemovePassphrase}
            >
              {t("removePassphrase")}
            </button>
          </>
        ) : (
          <>
            <p className="fk-card__body">{t("plainBody")}</p>
            <div className="fk-card__row">
              {passphraseField}
              <input
                type="password"
                className="fk-input"
                aria-label={t("repeatPassphrase")}
                placeholder={t("repeatPassphrase")}
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
                {t("encrypt")}
              </button>
            </div>
          </>
        )}
      </div>
      {outcomeLine}
    </section>
  );
}
