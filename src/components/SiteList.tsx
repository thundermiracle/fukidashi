import {
  formatCount,
  formatPagePath,
  formatRelativeTime,
  lastTouched,
  type SiteNotes,
} from "@/core";
import { ExternalLinkIcon } from "./icons";

interface SiteListProps {
  sites: SiteNotes[];
  /** Drills into the notes of one page. */
  onSelect: (url: string) => void;
  /** Opens the page in a browser tab. */
  onOpen: (url: string) => void;
}

/** Every page carrying notes, gathered under the site it belongs to. */
export function SiteList({ sites, onSelect, onOpen }: SiteListProps) {
  return (
    <ul className="fk-sites">
      {sites.map((site) => (
        <li key={site.host} className="fk-sites__site">
          <p className="fk-sites__host">
            <span className="fk-sites__name" title={site.host}>
              {site.host}
            </span>
            <span className="fk-sites__total">{site.noteCount}</span>
          </p>
          <ul className="fk-list">
            {site.pages.map((page) => (
              <li key={page.url} className="fk-list__item">
                <button
                  type="button"
                  className="fk-list__button"
                  onClick={() => onSelect(page.url)}
                >
                  <span className="fk-list__content">
                    <span className="fk-page__path" title={page.url}>
                      {formatPagePath(page.url)}
                    </span>
                    <span className="fk-list__time">
                      {formatCount(page.notes.length, "note")} ·{" "}
                      {formatRelativeTime(lastTouched(page.notes))}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="fk-icon-button fk-list__open"
                  title="Open this page"
                  aria-label={`Open ${page.url}`}
                  onClick={() => onOpen(page.url)}
                >
                  <ExternalLinkIcon />
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
