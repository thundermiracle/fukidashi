// Define keys for the settings
export const SETTINGS_KEYS = {
  ENABLED: "enabled",
} as const;

export type SettingsType = {
  enabled: boolean;
};

// Default settings
export const DEFAULT_SETTINGS: SettingsType = {
  enabled: true,
};

// Load settings from chrome.storage.local
export async function loadSettings(): Promise<SettingsType> {
  const result = await chrome.storage.local.get(Object.values(SETTINGS_KEYS));
  const settings: SettingsType = { ...DEFAULT_SETTINGS };

  // Only override default values if they exist in storage
  if (result[SETTINGS_KEYS.ENABLED] !== undefined) {
    settings.enabled = result[SETTINGS_KEYS.ENABLED] === true;
  }

  return settings;
}

// Save a setting to chrome.storage.local
export async function saveSetting(key: string, value: boolean): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

/** Calls `listener` whenever the settings change, from any tab or the popup. */
export function watchSettings(listener: (settings: SettingsType) => void): () => void {
  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local") return;
    if (!Object.values(SETTINGS_KEYS).some((key) => key in changes)) return;
    loadSettings().then(listener);
  };

  chrome.storage.onChanged.addListener(handleChange);
  return () => chrome.storage.onChanged.removeListener(handleChange);
}
