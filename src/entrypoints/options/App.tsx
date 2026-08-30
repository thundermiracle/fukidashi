import { useCallback, useEffect, useState } from "react";
import logo from "@/assets/fukidashi.png";
import { DownloadIcon, UploadIcon } from "@/components/icons";
import { formatCount, type PageNotes } from "@/core";
import { loadAllPageNotes, watchAllNotes } from "@/services/notes";
import {
  buildSyncPayload,
  exportFileName,
  importSyncPayload,
  serializeSyncPayload,
} from "@/services/sync";
import "./App.css";

type Outcome = { kind: "done" | "failed"; message: string };

function App() {
  const [pages, setPages] = useState<PageNotes[]>([]);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadAllPageNotes().then(setPages);
    return watchAllNotes(setPages);
  }, []);

  const noteCount = pages.reduce((total, page) => total + page.notes.length, 0);

  const handleExport = useCallback(async () => {
    setBusy(true);
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

      setOutcome({ kind: "done", message: `Saved ${formatCount(payload.pages.length, "page")}.` });
    } catch (error) {
      console.error("Fukidashi: could not export the notes", error);
      setOutcome({ kind: "failed", message: "Could not save the notes." });
    } finally {
      setBusy(false);
    }
  }, []);

  const handleImport = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const pageCount = await importSyncPayload(await file.text());
      setOutcome({
        kind: "done",
        message: `Merged ${formatCount(pageCount, "page")} from the file.`,
      });
    } catch (error) {
      console.error("Fukidashi: could not import the notes", error);
      setOutcome({
        kind: "failed",
        message: error instanceof Error ? error.message : "Could not read that file.",
      });
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <main className="fk-page">
      <header className="fk-page__header">
        <img src={logo} className="fk-page__logo" alt="" />
        <div>
          <h1 className="fk-page__title">Fukidashi settings</h1>
          <p className="fk-page__subtitle">
            {`${formatCount(noteCount, "note")} on ${formatCount(pages.length, "page")}`}
          </p>
        </div>
      </header>

      <h2 className="fk-section">Backup</h2>

      <section className="fk-card">
        <h3 className="fk-card__title">Save your notes to a file</h3>
        <p className="fk-card__body">
          Writes every note you have, including the pages you are not looking at, to one JSON file.
        </p>
        <button type="button" className="fk-button" disabled={busy} onClick={handleExport}>
          <DownloadIcon />
          Export
        </button>
      </section>

      <section className="fk-card">
        <h3 className="fk-card__title">Read notes back from a file</h3>
        <p className="fk-card__body">
          Adds what the file holds to what is already here — nothing on this device is replaced. A
          note edited in two places keeps whichever version was written last, and a note deleted on
          either side stays deleted.
        </p>
        <label className="fk-button">
          <UploadIcon />
          Import
          <input
            type="file"
            accept="application/json,.json"
            className="fk-button__file"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              // The same file picked twice should still import the second time.
              event.target.value = "";
              if (file) handleImport(file);
            }}
          />
        </label>
      </section>

      {outcome && (
        <p className={`fk-outcome${outcome.kind === "failed" ? " fk-outcome--failed" : ""}`}>
          {outcome.message}
        </p>
      )}
    </main>
  );
}

export default App;
