"use client";

/* eslint-disable @next/next/no-img-element */
import { Loader2, ImageOff, Camera } from "lucide-react";
import type { FacadeResult } from "@/lib/facade";
import { Badge } from "@/components/ui/badge";

interface Props {
  facade: FacadeResult | null;
  status: "idle" | "loading" | "error" | "done";
  wwrPercent: number;
  wwrSource: "bild" | "typologie" | "manuell";
}

function sourceBadge(source: "bild" | "typologie" | "manuell") {
  if (source === "bild")
    return <Badge variant="success">aus Fassadenbild</Badge>;
  if (source === "manuell") return <Badge variant="secondary">manuell</Badge>;
  return <Badge variant="outline">Typologie-Standard</Badge>;
}

export function FacadePanel({ facade, status, wwrPercent, wwrSource }: Props) {
  if (status === "loading") {
    return (
      <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Fassadenbild wird geholt und
        analysiert…
      </div>
    );
  }

  const hasImage = facade?.imageDataUrl != null;

  return (
    <div className="grid gap-5 md:grid-cols-[240px_1fr]">
      <div className="flex h-44 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
        {hasImage ? (
          <img
            src={facade!.imageDataUrl!}
            alt="Fassade (Street View)"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 p-4 text-center text-xs text-muted-foreground">
            <ImageOff className="h-6 w-6" />
            Kein Fassadenbild verfügbar
          </div>
        )}
      </div>

      <div>
        <div className="flex items-end gap-3">
          <div>
            <div className="text-xs font-medium text-muted-foreground">
              Fenster-zu-Wand-Anteil (WWR)
            </div>
            <div className="text-3xl font-bold tracking-tight">
              {Math.round(wwrPercent)}%
            </div>
          </div>
          {sourceBadge(wwrSource)}
        </div>

        {facade?.source === "bild" && (
          <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
            <Chip>Konfidenz: {facade.konfidenz}</Chip>
            <Chip>Bildqualität: {facade.bildqualitaet}</Chip>
            <Chip>Fassade: {facade.sichtbareFassade}</Chip>
            {facade.panoDate && <Chip>Aufnahme: {facade.panoDate}</Chip>}
          </div>
        )}

        {facade?.hinweise && facade.source === "bild" && (
          <p className="mt-2 text-xs text-muted-foreground">
            Hinweis: {facade.hinweise}
          </p>
        )}

        {wwrSource !== "bild" && (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Camera className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {wwrSource === "manuell"
              ? "Manuell gesetzter Wert."
              : `Typologie-Standard für diese Nutzungsart (${
                  facade?.reason ?? "kein verlässliches Fassadenbild"
                }).`}
          </p>
        )}

        <p className="mt-3 border-t pt-2 text-[11px] text-muted-foreground">
          Der WWR steuert die Wirkung der Hüllen-Maßnahmen (Fenster/Fassade/Dach)
          im Simulator sowie den Überhitzungsindikator.
        </p>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 font-medium">
      {children}
    </span>
  );
}
