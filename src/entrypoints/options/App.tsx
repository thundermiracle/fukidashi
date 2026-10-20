import { useCallback, useEffect, useState } from "react";
import logo from "@/assets/fukidashi.png";
import { DownloadIcon, UploadIcon } from "@/components/icons";
import {
  liveNotes,
  MARKDOWN_FLAVORS,
  type MarkdownFlavor,
  type MarkdownWords,
  markdownFileName,
  type PageNotes,
  renderMarkdown,
  SyncPayloadError,
  SyncVersionError,
} from "@/core";
import { t, tCount } from "@/services/i18n";
import { loadAllPageNotes, watchAllNotes } from "@/services/notes";
import {
  buildSyncPayload,
  exportFileName,
  importSyncPayload,
  serializeSyncPayload,
} from "@/services/sync";
import "./App.css";
import { SyncSection } from "./SyncSection";

type Outcome = { kind: "done" | "failed"; message: string };

const FLAVOR_LABELS: Record<MarkdownFlavor, string> = {
  notion: "Notion",
  obsidian: "Obsidian",
};

/** The export's words in the user's language, gathered when one is written. */
function markdownWords(): MarkdownWords {
  return {
    title: t("exportDocumentTitle"),
    colors: {
      yellow: t("exportColorYellow"),
      green: t("exportColorGreen"),
      blue: t("exportColorBlue"),
      pink: t("exportColorPink"),
      purple: t("exportColorPurple"),
    },
    summary: (noteCount, pageCount, day) =>
      t("exportSummary", {
        notes: tCount("noteCount", noteCount),
        pages: tCount("pageCount", pageCount),
        day,
      }),
  };
}

/**
 * Why a file would not come in. The payload's own errors are written in
 * English, as core code has no language to write them in, so they are put
 * into the user's words here.
 */
function whyImportFailed(error: unknown): string {
  if (error instanceof SyntaxError) return t("importNotJson");
  if (error instanceof SyncVersionError) return t("importNewerVersion");
  if (error instanceof SyncPayloadError) return t("importNotExport");
  return error instanceof Error ? error.message : t("importFailed");
}

/** Hands the browser a file to save, the only way an extension page can. */
function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [pages, setPages] = useState<PageNotes[]>([]);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [flavor, setFlavor] = useState<MarkdownFlavor>("notion");

  useEffect(() => {
    loadAllPageNotes().then(setPages);
    return watchAllNotes(setPages);
  }, []);

  const noteCount = pages.reduce((total, page) => total + page.notes.length, 0);

  const handleExport = useCallback(async () => {
    setBusy(true);
    try {
      const payload = await buildSyncPayload();
      download(
        exportFileName(payload.exportedAt),
        serializeSyncPayload(payload),
        "application/json",
      );

      setOutcome({
        kind: "done",
        message: t("savedPages", { pages: tCount("pageCount", payload.pages.length) }),
      });
    } catch (error) {
      console.error("Fukidashi: could not export the notes", error);
      setOutcome({ kind: "failed", message: t("exportFailed") });
    } finally {
      setBusy(false);
    }
  }, []);

  const handleExportMarkdown = useCallback(async () => {
    setBusy(true);
    try {
      const payload = await buildSyncPayload();
      download(
        markdownFileName(payload.exportedAt, flavor),
        renderMarkdown(payload, flavor, markdownWords()),
        "text/markdown",
      );

      // Only the notes the user still has are written out, so the count is
      // taken from those rather than from the payload's tombstones.
      const written = payload.pages.reduce(
        (total, page) => total + liveNotes(page.notes).length,
        0,
      );
      setOutcome({
        kind: "done",
        message: t("savedNotesFor", {
          notes: tCount("noteCount", written),
          app: FLAVOR_LABELS[flavor],
        }),
      });
    } catch (error) {
      console.error("Fukidashi: could not write the notes as Markdown", error);
      setOutcome({ kind: "failed", message: t("markdownFailed") });
    } finally {
      setBusy(false);
    }
  }, [flavor]);

  const handleImport = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const pageCount = await importSyncPayload(await file.text());
      setOutcome({
        kind: "done",
        message: t("mergedPages", { pages: tCount("pageCount", pageCount) }),
      });
    } catch (error) {
      console.error("Fukidashi: could not import the notes", error);
      setOutcome({ kind: "failed", message: whyImportFailed(error) });
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <main className="fk-page">
      <header className="fk-page__header">
        <img src={logo} className="fk-page__logo" alt="" />
        <div>
          <h1 className="fk-page__title">{t("settingsTitle")}</h1>
          <p className="fk-page__subtitle">
            {t("notesOnPages", {
              notes: tCount("noteCount", noteCount),
              pages: tCount("pageCount", pages.length),
            })}
          </p>
        </div>
      </header>

      <h2 className="fk-section">{t("sectionSync")}</h2>

      <SyncSection />

      <h2 className="fk-section">{t("sectionBackup")}</h2>

      <section className="fk-card">
        <h3 className="fk-card__title">{t("exportTitle")}</h3>
        <p className="fk-card__body">{t("exportBody")}</p>
        <button type="button" className="fk-button" disabled={busy} onClick={handleExport}>
          <DownloadIcon />
          {t("exportButton")}
        </button>
      </section>

      <section className="fk-card">
        <h3 className="fk-card__title">{t("importTitle")}</h3>
        <p className="fk-card__body">{t("importBody")}</p>
        <label className="fk-button">
          <UploadIcon />
          {t("importButton")}
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

      <h2 className="fk-section">{t("sectionMarkdown")}</h2>

      <section className="fk-card">
        <h3 className="fk-card__title">{t("markdownTitle")}</h3>
        <p className="fk-card__body">{t("markdownBody")}</p>
        <div className="fk-card__row">
          <label className="fk-field" htmlFor="fk-flavor">
            {t("markdownFormat")}
            <select
              id="fk-flavor"
              className="fk-select"
              value={flavor}
              disabled={busy}
              onChange={(event) => setFlavor(event.target.value as MarkdownFlavor)}
            >
              {MARKDOWN_FLAVORS.map((option) => (
                <option key={option} value={option}>
                  {FLAVOR_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="fk-button"
            disabled={busy}
            onClick={handleExportMarkdown}
          >
            <DownloadIcon />
            {t("markdownExportButton")}
          </button>
        </div>
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
