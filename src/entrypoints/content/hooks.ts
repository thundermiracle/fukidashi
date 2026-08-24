import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Note, normalizePageUrl } from "@/core";
import { loadNotes, watchNotes } from "@/services/notes";
import { loadSettings, type SettingsType, watchSettings } from "@/services/settings";
import { type PanelPosition, placePanel } from "./position";

/** How often the URL is polled: the isolated world cannot see the page's own pushState calls. */
const URL_POLL_INTERVAL = 1000;

export function useSettings(): SettingsType {
  const [settings, setSettings] = useState<SettingsType>({ enabled: true });

  useEffect(() => {
    loadSettings().then(setSettings);
    return watchSettings(setSettings);
  }, []);

  return settings;
}

/** The current page URL, kept up to date across in-page (SPA) navigation. */
export function usePageUrl(): string {
  const [url, setUrl] = useState(() => normalizePageUrl(location.href));

  useEffect(() => {
    const check = () => {
      const next = normalizePageUrl(location.href);
      setUrl((current) => (current === next ? current : next));
    };

    const timer = setInterval(check, URL_POLL_INTERVAL);
    window.addEventListener("popstate", check);
    window.addEventListener("hashchange", check);

    return () => {
      clearInterval(timer);
      window.removeEventListener("popstate", check);
      window.removeEventListener("hashchange", check);
    };
  }, []);

  return url;
}

/** The notes stored for `url`, reloaded whenever they change anywhere. */
export function useNotes(url: string): Note[] {
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    let active = true;
    setNotes([]);

    loadNotes(url).then((loaded) => {
      if (active) setNotes(loaded);
    });
    const unwatch = watchNotes(url, (updated) => {
      if (active) setNotes(updated);
    });

    return () => {
      active = false;
      unwatch();
    };
  }, [url]);

  return notes;
}

/** Anything with a bounding box: a selection range or a highlight element. */
export interface AnchorSource {
  getBoundingClientRect(): DOMRect;
}

/**
 * Positions a floating panel against an anchor. The panel is rendered hidden
 * for one frame so it can be measured, and follows the anchor while the page
 * scrolls or resizes.
 */
export function useAnchoredPosition<T extends HTMLElement>(anchor: AnchorSource | null) {
  const ref = useRef<T>(null);
  const [position, setPosition] = useState<PanelPosition | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!anchor || !element) {
      setPosition(null);
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const panel = element.getBoundingClientRect();
      setPosition(
        placePanel(
          anchor.getBoundingClientRect(),
          { width: panel.width, height: panel.height },
          { width: window.innerWidth, height: window.innerHeight },
        ),
      );
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [anchor]);

  const style: React.CSSProperties = position
    ? { left: position.left, top: position.top }
    : { left: 0, top: 0, visibility: "hidden" };

  return { ref, position, style };
}

/** Runs `onOutside` when the user presses the mouse outside `ref`. */
export function useDismissOnOutsideClick(
  ref: RefObject<HTMLElement | null>,
  onOutside: () => void,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;

    const handle = (event: MouseEvent) => {
      const panel = ref.current;
      // composedPath crosses the shadow boundary, so clicks on our own panels
      // are recognised as inside.
      if (panel && !event.composedPath().includes(panel)) onOutside();
    };

    document.addEventListener("mousedown", handle, true);
    return () => document.removeEventListener("mousedown", handle, true);
  }, [active, onOutside, ref]);
}

/** Calls `onEscape` for an Escape press anywhere on the page. */
export function useEscapeKey(onEscape: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;

    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") onEscape();
    };

    document.addEventListener("keydown", handle, true);
    return () => document.removeEventListener("keydown", handle, true);
  }, [active, onEscape]);
}
