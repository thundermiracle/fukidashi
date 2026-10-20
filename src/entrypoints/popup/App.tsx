import { useCallback, useEffect, useMemo, useState } from "react";
import logo from "@/assets/fukidashi.png";
import { ArrowLeftIcon, BubbleIcon, ExternalLinkIcon, GearIcon } from "@/components/icons";
import { NoteList } from "@/components/NoteList";
import { SiteList } from "@/components/SiteList";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import {
  formatPagePath,
  formatPageUrl,
  groupBySite,
  inPageOrder,
  type Note,
  normalizePageUrl,
  type PageNotes,
  pageHost,
} from "@/core";
import { setPendingFocus } from "@/services/focus";
import { formatAge, t, tCount } from "@/services/i18n";
import { requestFocusNote } from "@/services/messages";
import { deleteNote, loadAllPageNotes, watchAllNotes } from "@/services/notes";
import { loadSettings, saveSettings } from "@/services/settings";
import {
  DEFAULT_SYNC_STATUS,
  loadSyncConfig,
  loadSyncStatus,
  type SyncConfig,
  type SyncStatus,
  watchSyncStatus,
} from "@/services/sync";
import "./App.css";

function notesOf(pages: PageNotes[], url: string): Note[] {
  return pages.find((page) => page.url === url)?.notes ?? [];
}

/** The footer's word on syncing: where it stands, and whether it needs the user. */
function describeSync(status: SyncStatus): { text: string; needsAttention: boolean } {
  switch (status.state) {
    case "syncing":
      return { text: t("syncing"), needsAttention: false };
    case "signedOut":
      return { text: t("signInToSync"), needsAttention: true };
    case "wrongPassphrase":
      return { text: t("enterPassphraseToSync"), needsAttention: true };
    case "error":
      return { text: t("syncFailed"), needsAttention: true };
    case "outdated":
      return { text: t("updateToSync"), needsAttention: true };
    default:
      return {
        text:
          status.lastSyncedAt > 0
            ? t("syncedAgo", { age: formatAge(status.lastSyncedAt) })
            : t("notSyncedYet"),
        needsAttention: false,
      };
  }
}

function App() {
  const [tabId, setTabId] = useState<number | null>(null);
  const [currentUrl, setCurrentUrl] = useState("");
  const [pages, setPages] = useState<PageNotes[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<"page" | "sites">("page");
  /** The page drilled into from the site list, if any. */
  const [openedUrl, setOpenedUrl] = useState<string | null>(null);
  /** How this browser syncs, and how that is going; nothing is shown while it does not. */
  const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(DEFAULT_SYNC_STATUS);

  useEffect(() => {
    const load = async () => {
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const [storedPages, settings, config, status] = await Promise.all([
          loadAllPageNotes(),
          loadSettings(),
          loadSyncConfig(),
          loadSyncStatus(),
        ]);

        setTabId(activeTab?.id ?? null);
        setCurrentUrl(activeTab?.url ? normalizePageUrl(activeTab.url) : "");
        setPages(storedPages);
        setEnabled(settings.enabled);
        setSyncConfig(config);
        setSyncStatus(status);
      } catch (error) {
        console.error("Fukidashi: could not read the stored notes", error);
      } finally {
        setIsLoading(false);
      }
    };

    load();
    const stopWatchingNotes = watchAllNotes(setPages);
    const stopWatchingSync = watchSyncStatus(setSyncStatus);
    return () => {
      stopWatchingNotes();
      stopWatchingSync();
    };
  }, []);

  const sites = useMemo(() => groupBySite(pages), [pages]);
  const totalNotes = pages.reduce((total, page) => total + page.notes.length, 0);
  const sync = describeSync(syncStatus);

  // One page's notes are listed either because it is the page in front of the
  // user, or because they picked it out of the site list.
  const showsOnePage = openedUrl !== null || tab === "page";
  const listedUrl = openedUrl ?? currentUrl;
  const listedNotes = showsOnePage ? notesOf(pages, listedUrl) : [];

  const handleToggle = useCallback(async (checked: boolean) => {
    setEnabled(checked);
    await saveSettings({ enabled: checked });
  }, []);

  const openPage = useCallback((url: string) => {
    chrome.tabs.create({ url });
    window.close();
  }, []);

  const showTab = useCallback((next: "page" | "sites") => {
    setOpenedUrl(null);
    setTab(next);
  }, []);

  const handleSelectNote = useCallback(
    async (note: Note) => {
      // A note of some other page can only be reached by going there first;
      // the jump is left behind for that page to pick up as it loads.
      if (listedUrl !== currentUrl || tabId === null) {
        await setPendingFocus(listedUrl, note.id);
        openPage(listedUrl);
        return;
      }
      if (await requestFocusNote(tabId, note.id)) {
        window.close();
        return;
      }
      // The page has no content script to answer — it was loaded before the
      // extension was installed or updated. Reloading brings the script in,
      // and the jump waits for it the same way it does for a new tab.
      await setPendingFocus(listedUrl, note.id);
      chrome.tabs.reload(tabId);
      window.close();
    },
    [currentUrl, listedUrl, openPage, tabId],
  );

  const handleDeleteNote = useCallback((note: Note) => deleteNote(listedUrl, note.id), [listedUrl]);

  // Backup lives on the settings page, not here: picking a file opens an OS
  // dialog, and that closes the popup before it can read what was picked.
  const openSettings = useCallback(() => {
    chrome.runtime.openOptionsPage();
    window.close();
  }, []);

  /** Says which notes the body is showing: a page's, or everything stored. */
  const subtitle = () => {
    if (openedUrl) return formatPagePath(openedUrl);
    if (!showsOnePage) {
      return t("notesOnPages", {
        notes: tCount("noteCount", totalNotes),
        pages: tCount("pageCount", pages.length),
      });
    }
    return currentUrl ? formatPageUrl(currentUrl) : t("noPageOpen");
  };

  const renderBody = () => {
    if (isLoading) return <p className="fk-popup__status">{t("loading")}</p>;

    if (showsOnePage) {
      return listedNotes.length > 0 ? (
        <NoteList
          notes={inPageOrder(listedNotes)}
          onSelect={handleSelectNote}
          onDelete={handleDeleteNote}
        />
      ) : (
        <div className="fk-empty">
          <BubbleIcon className="fk-empty__icon" />
          <p className="fk-empty__title">{t("noNotesOnPage")}</p>
          <p className="fk-empty__hint">{t("noNotesOnPageHint")}</p>
        </div>
      );
    }

    return sites.length > 0 ? (
      <SiteList sites={sites} onSelect={setOpenedUrl} onOpen={openPage} />
    ) : (
      <div className="fk-empty">
        <BubbleIcon className="fk-empty__icon" />
        <p className="fk-empty__title">{t("noNotesAnywhere")}</p>
        <p className="fk-empty__hint">{t("noNotesAnywhereHint")}</p>
      </div>
    );
  };

  return (
    <div className="fk-popup">
      <header className="fk-popup__header">
        {openedUrl ? (
          <button
            type="button"
            className="fk-icon-button fk-popup__back"
            title={t("backToAllPages")}
            onClick={() => setOpenedUrl(null)}
          >
            <ArrowLeftIcon />
          </button>
        ) : (
          <img src={logo} className="fk-popup__logo" alt="" />
        )}

        <div className="fk-popup__titles">
          <h1 className="fk-popup__title">{openedUrl ? pageHost(openedUrl) : "Fukidashi"}</h1>
          <p className="fk-popup__page" title={openedUrl ?? currentUrl}>
            {subtitle()}
          </p>
        </div>

        {openedUrl && openedUrl !== currentUrl && (
          <button
            type="button"
            className="fk-icon-button"
            title={t("openThisPage")}
            aria-label={t("openUrl", { url: openedUrl })}
            onClick={() => openPage(openedUrl)}
          >
            <ExternalLinkIcon />
          </button>
        )}
        <button
          type="button"
          className="fk-icon-button"
          title={t("settings")}
          aria-label={t("settings")}
          onClick={openSettings}
        >
          <GearIcon />
        </button>
        <span className="fk-popup__count">{showsOnePage ? listedNotes.length : totalNotes}</span>
      </header>

      {!openedUrl && (
        <div className="fk-tabs">
          <button
            type="button"
            className={`fk-tab${tab === "page" ? " fk-tab--active" : ""}`}
            aria-pressed={tab === "page"}
            onClick={() => showTab("page")}
          >
            {t("tabThisPage")}
          </button>
          <button
            type="button"
            className={`fk-tab${tab === "sites" ? " fk-tab--active" : ""}`}
            aria-pressed={tab === "sites"}
            onClick={() => showTab("sites")}
          >
            {t("tabAllPages")}
          </button>
        </div>
      )}

      <div className="fk-popup__body">{renderBody()}</div>

      <footer className="fk-popup__footer">
        <ToggleSwitch
          id="enabled"
          label={t("showHighlights")}
          checked={enabled}
          onChange={handleToggle}
        />
        {syncConfig !== null && (
          <button
            type="button"
            className={`fk-popup__sync${sync.needsAttention ? " fk-popup__sync--attention" : ""}`}
            title={t("syncSettings")}
            onClick={openSettings}
          >
            {sync.text}
          </button>
        )}
      </footer>
    </div>
  );
}

export default App;
