import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import logo from "@/assets/fukidashi.png";
import {
  ArrowLeftIcon,
  BubbleIcon,
  DownloadIcon,
  ExternalLinkIcon,
  UploadIcon,
} from "@/components/icons";
import { NoteList } from "@/components/NoteList";
import { SiteList } from "@/components/SiteList";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import {
  formatCount,
  formatPagePath,
  formatPageUrl,
  groupBySite,
  type Note,
  normalizePageUrl,
  type PageNotes,
  pageHost,
} from "@/core";
import { setPendingFocus } from "@/services/focus";
import { requestFocusNote } from "@/services/messages";
import { deleteNote, loadAllPageNotes, watchAllNotes } from "@/services/notes";
import { loadSettings, saveSettings } from "@/services/settings";
import {
  buildSyncPayload,
  exportFileName,
  importSyncPayload,
  serializeSyncPayload,
} from "@/services/sync";
import "./App.css";

/** Notes are listed in the order they appear in the page text. */
function inPageOrder(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => a.anchor.start - b.anchor.start);
}

function notesOf(pages: PageNotes[], url: string): Note[] {
  return pages.find((page) => page.url === url)?.notes ?? [];
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
  /** What the last export or import did, shown until the popup closes. */
  const [transferNote, setTransferNote] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const [storedPages, settings] = await Promise.all([loadAllPageNotes(), loadSettings()]);

        setTabId(activeTab?.id ?? null);
        setCurrentUrl(activeTab?.url ? normalizePageUrl(activeTab.url) : "");
        setPages(storedPages);
        setEnabled(settings.enabled);
      } catch (error) {
        console.error("Fukidashi: could not read the stored notes", error);
      } finally {
        setIsLoading(false);
      }
    };

    load();
    return watchAllNotes(setPages);
  }, []);

  const sites = useMemo(() => groupBySite(pages), [pages]);
  const totalNotes = pages.reduce((total, page) => total + page.notes.length, 0);

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

  const handleExport = useCallback(async () => {
    try {
      const payload = await buildSyncPayload();
      const url = URL.createObjectURL(
        new Blob([serializeSyncPayload(payload)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFileName(payload.exportedAt);
      link.click();
      URL.revokeObjectURL(url);

      setTransferNote(`Saved ${formatCount(payload.pages.length, "page")}.`);
    } catch (error) {
      console.error("Fukidashi: could not export the notes", error);
      setTransferNote("Could not save the notes.");
    }
  }, []);

  const handleImport = useCallback(async (file: File) => {
    try {
      const pageCount = await importSyncPayload(await file.text());
      setTransferNote(`Merged ${formatCount(pageCount, "page")}.`);
    } catch (error) {
      console.error("Fukidashi: could not import the notes", error);
      setTransferNote(error instanceof Error ? error.message : "Could not read that file.");
    }
  }, []);

  /** Says which notes the body is showing: a page's, or everything stored. */
  const subtitle = () => {
    if (openedUrl) return formatPagePath(openedUrl);
    if (!showsOnePage) {
      return `${formatCount(totalNotes, "note")} on ${formatCount(pages.length, "page")}`;
    }
    return currentUrl ? formatPageUrl(currentUrl) : "No page open";
  };

  const renderBody = () => {
    if (isLoading) return <p className="fk-popup__status">Loading…</p>;

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
          <p className="fk-empty__title">No notes on this page yet</p>
          <p className="fk-empty__hint">
            Select any text on the page, then pick a color or write a note.
          </p>
        </div>
      );
    }

    return sites.length > 0 ? (
      <SiteList sites={sites} onSelect={setOpenedUrl} onOpen={openPage} />
    ) : (
      <div className="fk-empty">
        <BubbleIcon className="fk-empty__icon" />
        <p className="fk-empty__title">No notes anywhere yet</p>
        <p className="fk-empty__hint">Every page you annotate is collected here.</p>
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
            title="Back to all pages"
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
            title="Open this page"
            aria-label={`Open ${openedUrl}`}
            onClick={() => openPage(openedUrl)}
          >
            <ExternalLinkIcon />
          </button>
        )}
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
            This page
          </button>
          <button
            type="button"
            className={`fk-tab${tab === "sites" ? " fk-tab--active" : ""}`}
            aria-pressed={tab === "sites"}
            onClick={() => showTab("sites")}
          >
            All pages
          </button>
        </div>
      )}

      <div className="fk-popup__body">{renderBody()}</div>

      <footer className="fk-popup__footer">
        <ToggleSwitch
          id="enabled"
          label="Show highlights"
          checked={enabled}
          onChange={handleToggle}
        />

        <div className="fk-transfer">
          <button type="button" className="fk-transfer__button" onClick={handleExport}>
            <DownloadIcon />
            Export
          </button>
          <button
            type="button"
            className="fk-transfer__button"
            onClick={() => fileInput.current?.click()}
          >
            <UploadIcon />
            Import
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="fk-transfer__file"
            aria-label="Import notes from a file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // The same file picked twice should still import the second time.
              event.target.value = "";
              if (file) handleImport(file);
            }}
          />
        </div>

        {transferNote && <p className="fk-transfer__note">{transferNote}</p>}
      </footer>
    </div>
  );
}

export default App;
