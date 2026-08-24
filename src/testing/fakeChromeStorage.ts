type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void;

/** Minimal in-memory stand-in for the parts of chrome.storage the app uses. */
export function createFakeChromeStorage(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...initial };
  const listeners = new Set<StorageListener>();

  const emit = (changes: Record<string, chrome.storage.StorageChange>) => {
    for (const listener of listeners) listener(changes, "local");
  };

  return {
    data,
    listeners,
    chrome: {
      storage: {
        local: {
          get: async (keys: string | string[]) => {
            const wanted = Array.isArray(keys) ? keys : [keys];
            const found: Record<string, unknown> = {};
            for (const key of wanted) {
              if (key in data) found[key] = data[key];
            }
            return found;
          },
          set: async (items: Record<string, unknown>) => {
            const changes: Record<string, chrome.storage.StorageChange> = {};
            for (const [key, value] of Object.entries(items)) {
              changes[key] = { oldValue: data[key], newValue: value };
              data[key] = value;
            }
            emit(changes);
          },
          remove: async (key: string) => {
            const changes = { [key]: { oldValue: data[key], newValue: undefined } };
            delete data[key];
            emit(changes);
          },
        },
        onChanged: {
          addListener: (listener: StorageListener) => listeners.add(listener),
          removeListener: (listener: StorageListener) => listeners.delete(listener),
        },
      },
    },
  };
}
