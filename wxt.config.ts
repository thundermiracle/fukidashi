import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: "src",
  outDir: "dist",
  manifest: {
    name: "Fukidashi",
    description: "Chrome extension",
    version: "0.1.0",
    permissions: ["storage"],
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
