"use client";

import { Loader2, MapPin, AlertCircle } from "lucide-react";
import {
  hazardDeltas,
  levelColor,
  type RiskResult,
  type RiskLevel,
} from "@/lib/risk";

interface Props {
  risk: RiskResult | null;
  status: "idle" | "loading" | "error" | "done";
  error?: string | null;
}

const LEVELS: RiskLevel[] = ["sehr gering", "gering", "mittel", "hoch", "sehr hoch"];

export function RiskPanel({ risk, status, error }: Props) {
  if (status === "loading") {
    return (
      <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Klimarisiken werden für den
        Standort ermittelt…
      </div>
    );
  }
  if (status === "error" || !risk) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Klimarisiken konnten nicht ermittelt werden
          {error ? `: ${error}` : "."}
        </span>
      </div>
    );
  }

  const groupNames = Object.keys(risk.groups);
  const deltas = hazardDeltas(risk.hazards);

  return (
    <div>
      <div className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" />
        {risk.location.strasseHausnummer
          ? `${risk.location.strasseHausnummer}, ${risk.location.plz} ${risk.location.ort}`
          : risk.location.matchedLabel}
      </div>

      {/* Kompakte Delta-Sicht: Gegenwart -> 2050 / 2070+ je Gefahr */}
      {deltas.some((d) => d.present != null) && (
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pr-3">Gefahr</th>
                <th className="py-1.5 pr-3">Heute</th>
                <th className="py-1.5 pr-3">Bis 2050</th>
                <th className="py-1.5 pr-3">Bis 2070+</th>
              </tr>
            </thead>
            <tbody>
              {deltas.map((d) => (
                <tr key={d.gruppe} className="border-b last:border-0">
                  <td className="py-1.5 pr-3 font-medium">{d.gruppe}</td>
                  <td className="py-1.5 pr-3">{d.present ?? "—"}</td>
                  <td className="py-1.5 pr-3">
                    {d.near ?? "—"}
                    <DeltaBadge delta={d.nearDelta} />
                  </td>
                  <td className="py-1.5 pr-3">
                    {d.far ?? "—"}
                    <DeltaBadge delta={d.farDelta} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-2.5">
        {groupNames.map((name) => {
          const items = risk.groups[name];
          return (
            <div key={name} className="flex flex-wrap items-center gap-2">
              <div className="w-28 shrink-0 text-sm font-medium">{name}</div>
              <div className="flex flex-wrap gap-1.5">
                {items.map((h) => (
                  <span
                    key={h.label}
                    title={`${h.label} · ${h.level} (Wert ${h.anzeigewert}, Unsicherheit: ${h.unsicherheitstext})`}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-black/80"
                    style={{ backgroundColor: levelColor(h.level) }}
                  >
                    {shortTimeframe(h.label)} · {h.anzeigewert}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-3 text-xs text-muted-foreground">
        <span>Risiko:</span>
        {LEVELS.map((l) => (
          <span key={l} className="inline-flex items-center gap-1">
            <span
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: levelColor(l) }}
            />
            {l}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Quelle: GIS ImmoRisk Naturgefahren (Standortsteckbrief). Werte 0–100 als
        relative Gefährdung; Zeitfenster in Klammern.
      </p>
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null || delta === 0) return null;
  const worse = delta > 0;
  return (
    <span
      className={`ml-1 text-xs font-semibold ${
        worse ? "text-[var(--danger)]" : "text-[var(--success)]"
      }`}
    >
      {worse ? `+${delta}` : delta}
    </span>
  );
}

function shortTimeframe(label: string): string {
  if (/gegenwart/i.test(label)) return "heute";
  const m = /(\d{4})\s*[-–]\s*(\d{4})/.exec(label);
  if (!m) return "heute";
  const end = Number(m[2]);
  if (end <= 2000) return "Referenz";
  if (end <= 2050) return "→2050";
  if (end <= 2070) return "→2070";
  return "→2100";
}
