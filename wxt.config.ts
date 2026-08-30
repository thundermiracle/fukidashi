import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: "src",
  outDir: "dist",
  manifest: {
    name: "Fukidashi",
    description: "Add comments and notes to any web page",
    // The version is taken from package.json, which is what the release
    // workflow bumps — a copy here would ship stale.
    // activeTab covers the popup reading the current tab's URL and messaging
    // its content script; no broad host permission is needed for that.
    permissions: ["storage", "activeTab"],
    browser_specific_settings: {
      gecko: {
        id: "fukidashi@thundermiracle.com",
        // Firefox requires this for new extensions; this extension collects nothing.
        data_collection_permissions: {
          required: ["none"],
        },
      },
    },
  },
  webExt: {
    binaries: {
      // use brave browser
      chrome: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    },
  },
});
