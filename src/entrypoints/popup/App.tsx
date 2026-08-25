import { useCallback, useEffect, useMemo, useState } from "react";
import logo from "@/assets/fukidashi.png";
import { ArrowLeftIcon, BubbleIcon, ExternalLinkIcon } from "@/components/icons";
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
import { requestFocusNote } from "@/services/messages";
import { deleteNote, loadAllPageNotes, watchAllNotes } from "@/services/notes";
import { loadSettings, SETTINGS_KEYS, saveSetting } from "@/services/settings";
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
    await saveSetting(SETTINGS_KEYS.ENABLED, checked);
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
      // A note of some other page can only be reached by going there first.
      if (listedUrl !== currentUrl || tabId === null) {
        openPage(listedUrl);
        return;
      }
      if (await requestFocusNote(tabId, note.id)) window.close();
    },
    [currentUrl, listedUrl, openPage, tabId],
  );

  const handleDeleteNote = useCallback((note: Note) => deleteNote(listedUrl, note.id), [listedUrl]);

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
          defaultChecked={enabled}
          onChange={handleToggle}
        />
      </footer>
    </div>
  );
}

export default App;
