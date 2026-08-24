import { loadSettings, SETTINGS_KEYS } from "@/services/settings";

function start() {
  console.log("Fukidashi: content script started");
}

function stop() {
  console.log("Fukidashi: content script stopped");
}

async function init() {
  const { enabled } = await loadSettings();
  if (enabled) start();

  chrome.storage.onChanged.addListener((changes) => {
    const change = changes[SETTINGS_KEYS.ENABLED];
    if (!change) return;

    if (change.newValue === true) {
      start();
    } else {
      stop();
    }
  });
}

// Content script entrypoint
export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_end",
  main() {
    init();
  },
});
