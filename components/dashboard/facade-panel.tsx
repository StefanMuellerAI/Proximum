"use client";

/* eslint-disable @next/next/no-img-element */
import { Loader2, ImageOff, Camera, Sun } from "lucide-react";
import type { FacadeResult } from "@/lib/facade";
import { Badge } from "@/components/ui/badge";

interface Props {
  facade: FacadeResult | null;
  status: "idle" | "loading" | "error" | "done";
  wwrPercent: number;
  wwrSource: "bild" | "typologie" | "manuell";
  pvYieldKwhPerM2: number;
  pvSource: "bild" | "typologie" | "manuell";
}

function sourceBadge(source: "bild" | "typologie" | "manuell") {
  if (source === "bild") return <Badge variant="success">aus Bild</Badge>;
  if (source === "manuell") return <Badge variant="secondary">manuell</Badge>;
  return <Badge variant="outline">Typologie</Badge>;
}

function aerialLabel(s: FacadeResult["aerialSource"] | undefined): string {
  if (s === "3d") return "Schrägluftbild (3D)";
  if (s === "satellit") return "Satellit (Top-Down)";
  return "kein Luftbild";
}

export function FacadePanel({
  facade,
  status,
  wwrPercent,
  wwrSource,
  pvYieldKwhPerM2,
  pvSource,
}: Props) {
  if (status === "loading") {
    return (
      <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Bilder werden geholt und
        analysiert…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <ImageBox
          src={facade?.imageDataUrl ?? null}
          caption="Straßenansicht (Street View)"
        />
        <ImageBox
          src={facade?.aerialImageDataUrl ?? null}
          caption={aerialLabel(facade?.aerialSource)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* WWR */}
        <div className="rounded-lg border p-4">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Camera className="h-3.5 w-3.5" /> Fenster-zu-Wand-Anteil (WWR)
          </div>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold">{Math.round(wwrPercent)}%</span>
            {sourceBadge(wwrSource)}
          </div>
          {facade?.source === "bild" && (
            <div className="mt-1 text-xs text-muted-foreground">
              Konfidenz {facade.konfidenz} · Fassade {facade.sichtbareFassade}
            </div>
          )}
          {wwrSource !== "bild" && (
            <div className="mt-1 text-xs text-muted-foreground">
              {facade?.reason ?? "kein verlässliches Fassadenbild"} – Typologiewert.
            </div>
          )}
        </div>

        {/* PV */}
        <div className="rounded-lg border p-4">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Sun className="h-3.5 w-3.5" /> PV-Potenzial (Dach)
          </div>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold">
              {Math.round(pvYieldKwhPerM2)}
            </span>
            <span className="text-sm text-muted-foreground">kWh/m²·a</span>
            {sourceBadge(pvSource)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {facade?.pvEignung ? `Eignung ${facade.pvEignung}` : "Eignung —"}
            {facade?.dachAusrichtung ? ` · Dach ${facade.dachAusrichtung}` : ""}
            {facade?.pvHinweise ? ` · ${facade.pvHinweise}` : ""}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        WWR steuert die Hüllen-Maßnahmen und den Überhitzungsindikator; das
        PV-Potenzial fließt in die PV-Maßnahme des Simulators ein. Luftbild:
        Google Photorealistic 3D Tiles (schräg) bzw. Satellit-Fallback.
      </p>
    </div>
  );
}

function ImageBox({ src, caption }: { src: string | null; caption: string }) {
  return (
    <div>
      <div className="flex h-40 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
        {src ? (
          <img src={src} alt={caption} className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 p-4 text-center text-xs text-muted-foreground">
            <ImageOff className="h-6 w-6" />
            {caption}
          </div>
        )}
      </div>
      <div className="mt-1 text-center text-[11px] text-muted-foreground">
        {caption}
      </div>
    </div>
  );
}
