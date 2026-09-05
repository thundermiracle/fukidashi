type Listener<T> = (detail: T) => void;

function createEvent<T>() {
  const listeners = new Set<Listener<T>>();
  return {
    listeners,
    fire: (detail: T) => {
      for (const listener of listeners) listener(detail);
    },
    event: {
      addListener: (listener: Listener<T>) => listeners.add(listener),
      removeListener: (listener: Listener<T>) => listeners.delete(listener),
    },
  };
}

/**
 * In-memory stand-in for the runtime events the background listens to, so a
 * test can pretend the browser started or the extension was installed.
 */
export function createFakeChromeRuntime() {
  const onStartup = createEvent<void>();
  const onInstalled = createEvent<chrome.runtime.InstalledDetails>();

  return {
    startup: () => onStartup.fire(undefined),
    installed: (reason: chrome.runtime.InstalledDetails["reason"] = "update") =>
      onInstalled.fire({ reason }),
    listeners: { onStartup: onStartup.listeners, onInstalled: onInstalled.listeners },
    chrome: {
      runtime: {
        onStartup: onStartup.event,
        onInstalled: onInstalled.event,
      },
    },
  };
}
