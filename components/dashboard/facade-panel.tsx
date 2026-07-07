"use client";

/* eslint-disable @next/next/no-img-element */
import { Loader2, ImageOff, Camera, Sun } from "lucide-react";
import type { FacadeResult } from "@/lib/facade";
import type { ValueSource } from "@/lib/schema";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/utils";

interface Props {
  facade: FacadeResult | null;
  status: "idle" | "loading" | "error" | "done";
  wwrPercent: number;
  wwrSource: ValueSource;
  pvYieldKwhPerM2: number;
  pvSource: ValueSource;
}

function sourceBadge(source: ValueSource) {
  if (source === "bild") return <Badge variant="success">aus Bild</Badge>;
  if (source === "solar") return <Badge variant="success">Solar API</Badge>;
  if (source === "manuell") return <Badge variant="secondary">manuell</Badge>;
  return <Badge variant="outline">Typologie</Badge>;
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
        <Loader2 className="h-4 w-4 animate-spin" /> Fassade und Solarpotenzial
        werden analysiert…
      </div>
    );
  }

  const solar = facade?.solar ?? null;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <ImageBox
          src={facade?.imageDataUrl ?? null}
          caption="Straßenansicht (Street View)"
        />

        {/* Solar-Daten (datenbasiert, Google Solar API) */}
        <div className="flex h-full flex-col justify-center rounded-lg border bg-muted/40 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Sun className="h-3.5 w-3.5" /> Solarpotenzial (Google Solar API)
          </div>
          {solar?.status === "ok" ? (
            <dl className="space-y-1 text-sm">
              {solar.yearlyEnergyDcKwh != null && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Max. Jahresertrag</dt>
                  <dd className="font-medium">
                    {formatNumber(solar.yearlyEnergyDcKwh, 0)} kWh/a
                  </dd>
                </div>
              )}
              {solar.roofAreaM2 != null && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Nutzbare Dachfläche</dt>
                  <dd className="font-medium">
                    {formatNumber(solar.roofAreaM2, 0)} m²
                  </dd>
                </div>
              )}
              {solar.maxSunshineHoursPerYear != null && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Sonnenstunden</dt>
                  <dd className="font-medium">
                    {formatNumber(solar.maxSunshineHoursPerYear, 0)} h/a
                  </dd>
                </div>
              )}
              {solar.eignung && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Eignung</dt>
                  <dd className="font-medium">{solar.eignung}</dd>
                </div>
              )}
              {solar.imageryDate && (
                <div className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">Befliegung</dt>
                  <dd className="text-muted-foreground">
                    {solar.imageryDate}
                    {solar.imageryQuality ? ` · ${solar.imageryQuality}` : ""}
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-xs text-muted-foreground">
              {solar?.reason ?? "Keine Solar-Daten verfügbar"} – PV-Ertrag als
              Typologiewert.
            </p>
          )}
        </div>
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
            <Sun className="h-3.5 w-3.5" /> PV-Potenzial (bez. Bezugsfläche)
          </div>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold">
              {Math.round(pvYieldKwhPerM2)}
            </span>
            <span className="text-sm text-muted-foreground">kWh/m²·a</span>
            {sourceBadge(pvSource)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {pvSource === "solar"
              ? "Datenbasiert aus Solar-API-Jahresertrag und Bezugsfläche."
              : "Typologie-Annahme (keine Solar-Daten für dieses Gebäude)."}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        WWR steuert die Hüllen-Maßnahmen und den Überhitzungsindikator; das
        PV-Potenzial fließt in die PV-Maßnahme des Simulators ein. Quellen:
        Google Street View (Fassade) und Google Solar API (Dach, Befliegungsdaten).
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
