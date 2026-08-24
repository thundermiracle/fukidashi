import { useCallback, useEffect, useState } from "react";
import logo from "@/assets/fukidashi.png";
import { BubbleIcon } from "@/components/icons";
import { NoteList } from "@/components/NoteList";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { formatPageUrl, type Note } from "@/core";
import { requestScrollToNote } from "@/services/messages";
import { deleteNote, loadNotes, watchNotes } from "@/services/notes";
import { loadSettings, SETTINGS_KEYS, saveSetting } from "@/services/settings";
import "./App.css";

/** Notes are listed in the order they appear in the page text. */
function inPageOrder(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => a.anchor.start - b.anchor.start);
}

function App() {
  const [tabId, setTabId] = useState<number | null>(null);
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const pageUrl = tab?.url ?? "";
        const [storedNotes, settings] = await Promise.all([
          pageUrl ? loadNotes(pageUrl) : Promise.resolve([]),
          loadSettings(),
        ]);

        setTabId(tab?.id ?? null);
        setUrl(pageUrl);
        setNotes(storedNotes);
        setEnabled(settings.enabled);
      } catch (error) {
        console.error("Fukidashi: could not read this page's notes", error);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    if (!url) return;
    return watchNotes(url, setNotes);
  }, [url]);

  const handleToggle = useCallback(async (checked: boolean) => {
    setEnabled(checked);
    await saveSetting(SETTINGS_KEYS.ENABLED, checked);
  }, []);

  const handleSelect = useCallback(
    async (note: Note) => {
      if (tabId === null) return;
      if (await requestScrollToNote(tabId, note.id)) window.close();
    },
    [tabId],
  );

  const handleDelete = useCallback((note: Note) => deleteNote(url, note.id), [url]);

  return (
    <div className="fk-popup">
      <header className="fk-popup__header">
        <img src={logo} className="fk-popup__logo" alt="" />
        <div className="fk-popup__titles">
          <h1 className="fk-popup__title">Fukidashi</h1>
          <p className="fk-popup__page">{url ? formatPageUrl(url) : "No page open"}</p>
        </div>
        <span className="fk-popup__count">{notes.length}</span>
      </header>

      <div className="fk-popup__body">
        {isLoading ? (
          <p className="fk-popup__status">Loading…</p>
        ) : notes.length > 0 ? (
          <NoteList notes={inPageOrder(notes)} onSelect={handleSelect} onDelete={handleDelete} />
        ) : (
          <div className="fk-empty">
            <BubbleIcon className="fk-empty__icon" />
            <p className="fk-empty__title">No notes on this page yet</p>
            <p className="fk-empty__hint">
              Select any text on the page, then pick a color or write a note.
            </p>
          </div>
        )}
      </div>

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
