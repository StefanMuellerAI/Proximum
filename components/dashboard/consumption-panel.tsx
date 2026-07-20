"use client";

/**
 * Verbrauchsdaten-Panel (GAP-7): Zeitreihen je Berichtsjahr mit
 * Gap-Analyse, Rechnungs-Import (Vision-Pipeline) und Review-Queue.
 * Der Bedarf-vs.-Verbrauch-Abgleich wird PROMINENT angezeigt (1.4a).
 */
import * as React from "react";
import { FileUp, Loader2, Plus, TrendingDown } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  DemandVsConsumption,
  YearAggregation,
} from "@/lib/engine/consumption";

interface ApiRecord {
  id: string;
  periodStart: string;
  periodEnd: string;
  reportingYear: number;
  carrier: string;
  amountKwh: number;
  source: string;
  reviewStatus: "bestaetigt" | "pruefung" | "verworfen";
}

export function ConsumptionPanel({ buildingId }: { buildingId: string | null }) {
  const [records, setRecords] = React.useState<ApiRecord[]>([]);
  const [aggregations, setAggregations] = React.useState<YearAggregation[]>([]);
  const [comparison, setComparison] = React.useState<DemandVsConsumption[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    if (!buildingId) return;
    try {
      const res = await fetch(`/api/buildings/${buildingId}/consumption`);
      if (!res.ok) return;
      const data = await res.json();
      setRecords(data.records);
      setAggregations(data.aggregations);
      setComparison(data.comparison);
    } catch {
      // Verbrauchsdaten sind optional
    }
  }, [buildingId]);

  React.useEffect(() => {
    load();
  }, [load]);

  if (!buildingId) return null;

  async function uploadInvoice(file: File) {
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/buildings/${buildingId}/consumption/import`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import fehlgeschlagen.");
      setMessage(
        `${data.imported} Position(en) importiert${data.reviewRequired > 0 ? `, ${data.reviewRequired} zur Prüfung` : ""}.`,
      );
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Import fehlgeschlagen.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function review(recordId: string, reviewStatus: "bestaetigt" | "verworfen") {
    await fetch(`/api/buildings/${buildingId}/consumption`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordId, reviewStatus }),
    });
    await load();
  }

  async function addRecord(form: FormData) {
    const periodStart = String(form.get("start") ?? "");
    const periodEnd = String(form.get("end") ?? "");
    const amountKwh = Number(form.get("kwh"));
    const carrier = String(form.get("carrier") ?? "");
    if (!periodStart || !periodEnd || !Number.isFinite(amountKwh) || !carrier) return;
    setBusy(true);
    try {
      await fetch(`/api/buildings/${buildingId}/consumption`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodStart,
          periodEnd,
          reportingYear: new Date(periodEnd).getFullYear(),
          carrier,
          amountKwh,
        }),
      });
      setShowForm(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const pending = records.filter((r) => r.reviewStatus === "pruefung");
  const latestComparison = comparison[comparison.length - 1];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-primary" />
          Verbrauchsdaten &amp; Bedarf-Abgleich
        </CardTitle>
        <CardDescription>
          Reale Verbräuche je Berichtsjahr (Rechnungs-Import oder manuell) –
          Grundlage für den Abgleich mit dem Ausweis-Bedarf.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* PROMINENT: Bedarf vs. Verbrauch (1.4a) */}
        {latestComparison && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              latestComparison.assessment === "verbrauch_deutlich_unter_bedarf"
                ? "border-[var(--warning)]/50 bg-[var(--warning)]/10"
                : "border-border bg-accent/30"
            }`}
          >
            <strong>
              Bedarf vs. Verbrauch ({latestComparison.reportingYear}):
            </strong>{" "}
            Verbrauch {formatNumber(latestComparison.consumptionKwhM2a, 0)} kWh/m²·a
            vs. Bedarf {formatNumber(latestComparison.demandKwhM2a, 0)} kWh/m²·a (
            {formatNumber(latestComparison.ratio * 100, 0)} %).
            {latestComparison.assessment === "verbrauch_deutlich_unter_bedarf" && (
              <>
                {" "}
                Der reale Verbrauch liegt deutlich unter dem Bedarf
                (Prebound-Effekt) – bedarfsbasierte Einsparprognosen sind
                entsprechend zu relativieren.
              </>
            )}
          </div>
        )}

        {/* Review-Queue */}
        {pending.length > 0 && (
          <div className="rounded-lg border border-[var(--warning)]/40 p-3">
            <div className="mb-2 text-sm font-medium">
              {pending.length} Datensatz/Datensätze zur Prüfung (Duplikat/Storno/geringe Konfidenz)
            </div>
            <ul className="space-y-1 text-sm">
              {pending.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span>
                    {r.periodStart.slice(0, 10)} – {r.periodEnd.slice(0, 10)} ·{" "}
                    {r.carrier} · {formatNumber(r.amountKwh, 0)} kWh
                  </span>
                  <span className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => review(r.id, "bestaetigt")}>
                      Bestätigen
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => review(r.id, "verworfen")}>
                      Verwerfen
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Jahres-Aggregation mit Gap-Analyse */}
        {aggregations.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pr-3">Berichtsjahr</th>
                <th className="py-1.5 pr-3">Verbrauch</th>
                <th className="py-1.5 pr-3">Abdeckung</th>
                <th className="py-1.5 pr-3">Hochrechnung (12 Mon.)</th>
              </tr>
            </thead>
            <tbody>
              {aggregations.map((a) => (
                <tr key={a.reportingYear} className="border-b last:border-0">
                  <td className="py-1.5 pr-3">{a.reportingYear}</td>
                  <td className="py-1.5 pr-3">{formatNumber(a.totalKwh, 0)} kWh</td>
                  <td className="py-1.5 pr-3">
                    {formatNumber(a.coveredMonths, 1)} Monate{" "}
                    {a.hasGap && <Badge variant="warning">Lücke</Badge>}
                  </td>
                  <td className="py-1.5 pr-3">
                    {formatNumber(a.extrapolatedTotalKwh, 0)} kWh
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground">
            Noch keine Verbrauchsdaten – Rechnung hochladen oder manuell erfassen.
          </p>
        )}

        {message && <p className="text-xs text-muted-foreground">{message}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadInvoice(f);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="h-4 w-4" />
            )}
            Rechnung importieren (KI)
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" /> Manuell erfassen
          </Button>
        </div>

        {showForm && (
          <form
            className="grid gap-2 sm:grid-cols-5"
            onSubmit={(e) => {
              e.preventDefault();
              addRecord(new FormData(e.currentTarget));
            }}
          >
            <input name="start" type="date" required className="h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="Zeitraum von" />
            <input name="end" type="date" required className="h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="Zeitraum bis" />
            <input name="carrier" placeholder="Energieträger" required className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
            <input name="kwh" type="number" step="any" placeholder="kWh" required className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
            <Button type="submit" size="sm" disabled={busy}>
              Speichern
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
