export interface Settings {
  /** Turns highlights and panels off everywhere, without touching the stored notes. */
  enabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
};

/** Each setting is stored as its own entry, under the setting's name. */
const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(SETTING_KEYS);
  return {
    enabled: typeof stored.enabled === "boolean" ? stored.enabled : DEFAULT_SETTINGS.enabled,
  };
}

/** Writes the given settings; the ones not given keep their stored value. */
export async function saveSettings(update: Partial<Settings>): Promise<void> {
  await chrome.storage.local.set(update);
}

/** Calls `listener` whenever the settings change, from any tab or the popup. */
export function watchSettings(listener: (settings: Settings) => void): () => void {
  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local") return;
    if (!SETTING_KEYS.some((key) => key in changes)) return;
    loadSettings().then(listener);
  };

  chrome.storage.onChanged.addListener(handleChange);
  return () => chrome.storage.onChanged.removeListener(handleChange);
}
