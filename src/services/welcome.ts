/** The page a new user is shown once, built from `src/entrypoints/welcome/`. */
export const WELCOME_PAGE = "/welcome.html";

/**
 * Opens the welcome page when the extension is first installed; an update or
 * a browser update says nothing. Registered as the worker starts, before
 * anything is awaited: a listener added later misses the event that woke it.
 */
export function greetOnInstall(): () => void {
  const listener = (details: chrome.runtime.InstalledDetails) => {
    if (details.reason !== "install") return;
    chrome.tabs.create({ url: chrome.runtime.getURL(WELCOME_PAGE) });
  };

  chrome.runtime.onInstalled.addListener(listener);
  return () => chrome.runtime.onInstalled.removeListener(listener);
}
