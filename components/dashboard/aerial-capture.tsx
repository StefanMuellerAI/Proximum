"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react";

interface Props {
  lat: number | null;
  lon: number | null;
  enabled: boolean;
  /** Wird genau einmal aufgerufen: dataURL des Schrägbilds oder null (Fallback). */
  onResult: (dataUrl: string | null) => void;
}

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

/** Laedt die Cesium-UMD-Build aus /public/cesium (window.Cesium). */
function loadCesium(): Promise<any> {
  const w = window as any;
  if (w.Cesium) return Promise.resolve(w.Cesium);
  w.CESIUM_BASE_URL = "/cesium";
  return new Promise((resolve, reject) => {
    const existing = document.getElementById("cesium-script") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(w.Cesium));
      existing.addEventListener("error", () => reject(new Error("Cesium load error")));
      return;
    }
    const s = document.createElement("script");
    s.id = "cesium-script";
    s.src = "/cesium/Cesium.js";
    s.async = true;
    s.onload = () => resolve(w.Cesium);
    s.onerror = () => reject(new Error("Cesium load error"));
    document.head.appendChild(s);
  });
}

/**
 * Rendert einmalig eine schraege Luftansicht (Google Photorealistic 3D Tiles)
 * fuer die Gebaeudekoordinaten und liefert einen JPEG-Frame zurueck. Bei
 * fehlendem Key/Fehler/Timeout -> onResult(null) (Server nutzt dann Satellit).
 */
export function AerialCapture({ lat, lon, enabled, onResult }: Props) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const doneRef = React.useRef(false);

  React.useEffect(() => {
    if (doneRef.current) return;
    if (!enabled || !KEY || lat == null || lon == null) {
      doneRef.current = true;
      onResult(null);
      return;
    }

    let cancelled = false;
    let viewer: any = null;
    let hardTimer: ReturnType<typeof setTimeout> | null = null;
    const finish = (result: string | null) => {
      if (doneRef.current) return;
      doneRef.current = true;
      if (hardTimer) clearTimeout(hardTimer);
      onResult(result);
    };
    // Harte Obergrenze: blockiert die nachfolgende Fassaden-Analyse nie zu lange.
    hardTimer = setTimeout(() => {
      cancelled = true;
      try {
        viewer?.destroy();
      } catch {
        /* ignore */
      }
      finish(null);
    }, 22000);

    (async () => {
      try {
        const Cesium = await loadCesium();
        if (cancelled || !containerRef.current) return;

        viewer = new Cesium.Viewer(containerRef.current, {
          baseLayer: false,
          animation: false,
          timeline: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          fullscreenButton: false,
          selectionIndicator: false,
          infoBox: false,
          scene3DOnly: true,
          contextOptions: { webgl: { preserveDrawingBuffer: true } },
        });
        viewer.scene.globe.show = false;
        if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
        if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#e8eef2");

        const tileset = await Cesium.Cesium3DTileset.fromUrl(
          `https://tile.googleapis.com/v1/3dtiles/root.json?key=${KEY}`,
          { showCreditsOnScreen: true },
        );
        if (cancelled) {
          viewer.destroy();
          return;
        }
        viewer.scene.primitives.add(tileset);

        // Wichtig: echte Gelaende-/Dachhoehe an der Adresse aus den 3D-Tiles
        // abtasten. Sonst liegt das Kameraziel auf Meeresspiegel-Hoehe und der
        // Blick geht ins Leere (Gebaeude liegt real z. B. ~100 m hoeher).
        let groundHeight = 0;
        try {
          const samples = await viewer.scene.sampleHeightMostDetailed([
            Cesium.Cartographic.fromDegrees(lon, lat),
          ]);
          const h = samples?.[0]?.height;
          if (typeof h === "number" && Number.isFinite(h)) groundHeight = h;
        } catch {
          /* ohne Hoehe weiter (Naeherung) */
        }
        if (cancelled) {
          viewer.destroy();
          return;
        }

        // Schraege Kamera aufs Gebaeude (Blick von SSW, ~35 Grad geneigt)
        const center = Cesium.Cartesian3.fromDegrees(lon, lat, groundHeight + 6);
        viewer.camera.lookAt(
          center,
          new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(205),
            Cesium.Math.toRadians(-35),
            170,
          ),
        );

        // Tiles fuer DIESE Ansicht laden lassen (poll + Mindestzeit)
        const start = Date.now();
        await new Promise<void>((resolve) => {
          const check = () => {
            if (cancelled) return resolve();
            const enough = tileset.tilesLoaded && Date.now() - start > 1500;
            if (enough || Date.now() - start > 12000) return resolve();
            setTimeout(check, 300);
          };
          check();
        });
        await new Promise((r) => setTimeout(r, 800));
        if (cancelled) {
          viewer.destroy();
          return;
        }

        const dataUrl = viewer.scene.canvas.toDataURL("image/jpeg", 0.85);
        finish(typeof dataUrl === "string" && dataUrl.length > 5000 ? dataUrl : null);
        viewer.destroy();
      } catch {
        if (viewer) {
          try {
            viewer.destroy();
          } catch {
            /* ignore */
          }
        }
        if (!cancelled) finish(null);
      }
    })();

    return () => {
      cancelled = true;
      if (hardTimer) clearTimeout(hardTimer);
    };
  }, [lat, lon, enabled, onResult]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="no-print"
      style={{
        position: "fixed",
        left: "-10000px",
        top: 0,
        width: "640px",
        height: "480px",
        pointerEvents: "none",
      }}
    />
  );
}
