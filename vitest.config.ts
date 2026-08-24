import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/testing/setup.ts"],
  },
  resolve: {
    alias: {
      // Match WXT's "@" -> srcDir alias so tests resolve "@/..." like the build.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
