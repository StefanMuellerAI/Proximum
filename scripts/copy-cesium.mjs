/**
 * Kopiert die vorgebauten Cesium-Assets nach public/cesium, damit der Browser
 * Worker/Assets/Widgets laden kann (window.CESIUM_BASE_URL = "/cesium").
 * Laeuft als postinstall; public/cesium ist in .gitignore.
 */
import { cp, mkdir, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "cesium", "Build", "Cesium");
const dest = join(root, "public", "cesium");

try {
  await access(src);
} catch {
  console.warn("[copy-cesium] Cesium-Build nicht gefunden – übersprungen.");
  process.exit(0);
}

await mkdir(dirname(dest), { recursive: true });
await cp(src, dest, { recursive: true });
console.log(`[copy-cesium] Cesium-Assets -> ${dest}`);
