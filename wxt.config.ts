import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: "src",
  outDir: "dist",
  manifest: ({ browser, mode }) => ({
    name: "Fukidashi",
    description: "Add comments and notes to any web page",
    // The version is taken from package.json, which is what the release
    // workflow bumps — a copy here would ship stale.
    // activeTab covers the popup reading the current tab's URL and messaging
    // its content script; no broad host permission is needed for that.
    // identity signs in to Google Drive for the optional sync, and alarms
    // is its timer for picking up what other devices pushed.
    permissions: ["storage", "activeTab", "identity", "alarms"],
    // A dev build carrying the store build's public key gets the same
    // extension id, so the OAuth redirect registered for the store build
    // (`https://<id>.chromiumapp.org/`) is the one Google sends it back to.
    // The key lives in `.env`; without it the dev build keeps its own id.
    ...(browser === "chrome" && mode === "development" && process.env.WXT_EXTENSION_KEY
      ? { key: process.env.WXT_EXTENSION_KEY }
      : {}),
    browser_specific_settings: {
      gecko: {
        id: "fukidashi@thundermiracle.com",
        // Firefox requires this for new extensions; this extension collects nothing.
        data_collection_permissions: {
          required: ["none"],
        },
      },
    },
  }),
  webExt: {
    binaries: {
      // use brave browser
      chrome: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    },
  },
});
