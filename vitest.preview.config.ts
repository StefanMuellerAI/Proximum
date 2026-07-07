import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

/** Separate Konfiguration fuer die manuelle Grafik-Vorschau (Netzwerkzugriff). */
export default defineConfig({
  resolve: {
    alias: { "@": root },
  },
  test: {
    include: ["scripts/preview-*.ts"],
    environment: "node",
    testTimeout: 30_000,
  },
});
