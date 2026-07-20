"use client";

/**
 * Szenarien-UI (GAP-11): Szenarien anlegen/vergleichen, Sammelmassnahmen
 * mit Umsetzungsdatum (Zeitachse), Zeitverlaufs-Graphen (Investment,
 * gestrandete Gebaeude, CO2-Pfad) und Excel-Export.
 */
import * as React from "react";
import Link from "next/link";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { Download, GitCompare, Loader2, Plus } from "lucide-react";
import { RENOVATION_MEASURES } from "@/lib/data/reference";
import type { ScenarioEvaluation } from "@/lib/engine/scenario";
import { formatEur, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ScenarioMeta {
  id: string;
  name: string;
  planCount: number;
}

interface LoadedScenario {
  meta: ScenarioMeta;
  evaluation: ScenarioEvaluation;
}

export function ScenariosClient() {
  const [list, setList] = React.useState<ScenarioMeta[]>([]);
  const [active, setActive] = React.useState<LoadedScenario | null>(null);
  const [compare, setCompare] = React.useState<LoadedScenario | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [measureId, setMeasureId] = React.useState("waermepumpe");
  const [date, setDate] = React.useState("2030-06-30");

  const loadList = React.useCallback(async () => {
    const res = await fetch("/api/scenarios");
    if (res.ok) setList((await res.json()).scenarios);
  }, []);

  React.useEffect(() => {
    loadList();
  }, [loadList]);

  async function loadScenario(id: string, slot: "active" | "compare") {
    const res = await fetch(`/api/scenarios/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    const loaded: LoadedScenario = {
      meta: { id: data.scenario.id, name: data.scenario.name, planCount: 0 },
      evaluation: data.evaluation,
    };
    if (slot === "active") setActive(loaded);
    else setCompare(loaded);
  }

  async function createScenario() {
    const name = window.prompt("Name des Szenarios (z. B. „Paris-konform 2035“):");
    if (!name?.trim()) return;
    const res = await fetch("/api/scenarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (res.ok) {
      await loadList();
      const data = await res.json();
      await loadScenario(data.scenario.id, "active");
    }
  }

  /** Sammelmassnahme: Massnahme + Datum auf alle Gebaeude im Scope. */
  async function applyBulkMeasure() {
    if (!active) return;
    setBusy(true);
    try {
      // Alle Gebaeude-IDs einsammeln (paginierter Listen-Endpoint)
      const ids: string[] = [];
      let cursor: string | null = null;
      do {
        const url: string = cursor
          ? `/api/buildings?limit=500&cursor=${cursor}`
          : "/api/buildings?limit=500";
        const res = await fetch(url);
        if (!res.ok) break;
        const data = await res.json();
        ids.push(...data.buildings.map((b: { id: string }) => b.id));
        cursor = data.nextCursor;
      } while (cursor);

      await fetch(`/api/scenarios/${active.meta.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bulkMeasure: {
            buildingIds: ids,
            measureId,
            implementationDate: date,
          },
        }),
      });
      await loadScenario(active.meta.id, "active");
    } finally {
      setBusy(false);
    }
  }

  const chartData = React.useMemo(() => {
    if (!active) return [];
    return active.evaluation.timeline.map((p) => {
      const other = compare?.evaluation.timeline.find((q) => q.year === p.year);
      return {
        year: p.year,
        co2: Number(p.co2IntensityKgM2a.toFixed(2)),
        pfad: Number(p.pathwayKgM2a.toFixed(2)),
        invest: Math.round(p.cumulativeInvestEur / 1000),
        stranded: p.strandedCount,
        co2Vergleich: other ? Number(other.co2IntensityKgM2a.toFixed(2)) : undefined,
      };
    });
  }, [active, compare]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Szenarien &amp; Maßnahmenpläne</h1>
        <div className="flex items-center gap-2">
          <Link href="/portfolio" className="text-sm text-muted-foreground hover:underline">
            Zum Portfolio
          </Link>
          <Button onClick={createScenario}>
            <Plus className="h-4 w-4" /> Neues Szenario
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={active?.meta.id ?? ""}
          onChange={(e) => e.target.value && loadScenario(e.target.value, "active")}
          aria-label="Szenario wählen"
        >
          <option value="">Szenario wählen…</option>
          {list.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.planCount} Pläne)
            </option>
          ))}
        </select>
        <span className="flex items-center gap-1 text-sm text-muted-foreground">
          <GitCompare className="h-4 w-4" /> Vergleich:
        </span>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={compare?.meta.id ?? ""}
          onChange={(e) =>
            e.target.value ? loadScenario(e.target.value, "compare") : setCompare(null)
          }
          aria-label="Vergleichs-Szenario wählen"
        >
          <option value="">— kein Vergleich —</option>
          {list
            .filter((s) => s.id !== active?.meta.id)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
        {active && (
          <a
            href={`/api/scenarios/${active.meta.id}/export`}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm font-medium hover:bg-accent"
          >
            <Download className="h-4 w-4" /> Excel-Export
          </a>
        )}
      </div>

      {active && (
        <>
          {/* Sammelmassnahme */}
          <Card>
            <CardHeader>
              <CardTitle>Sammelmaßnahme</CardTitle>
              <CardDescription>
                Eine Maßnahme mit Umsetzungsdatum auf alle Gebäude anwenden
                (Wirkung ab Folgejahr). „Exklusion" bildet Verkauf/Rückbau ab.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={measureId}
                onChange={(e) => setMeasureId(e.target.value)}
                aria-label="Maßnahme"
              >
                {RENOVATION_MEASURES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
                <option value="exklusion">Exklusion (Verkauf/Rückbau)</option>
              </select>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                aria-label="Umsetzungsdatum"
              />
              <Button onClick={applyBulkMeasure} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Auf alle Gebäude anwenden
              </Button>
            </CardContent>
          </Card>

          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Gesamtinvestition</div>
                <div className="text-2xl font-bold">
                  {formatEur(active.evaluation.totalInvestEur)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Gestrandet 2030</div>
                <div className="text-2xl font-bold">
                  {active.evaluation.strandedCount2030} Gebäude
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Gestrandet 2050</div>
                <div className="text-2xl font-bold">
                  {active.evaluation.strandedCount2050} Gebäude
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Zeitverlaufs-Graphen */}
          <Card>
            <CardHeader>
              <CardTitle>Zeitverlauf: CO₂-Intensität vs. CRREM-Pfad</CardTitle>
              <CardDescription>
                Flächengewichtet, Exklusionen monatsanteilig; Maßnahmen wirken
                ab dem Folgejahr des Umsetzungsdatums.
              </CardDescription>
            </CardHeader>
            <CardContent style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="pfad" name="CRREM-Pfad" stroke="#64748b" strokeDasharray="5 4" dot={false} />
                  <Line type="monotone" dataKey="co2" name={active.meta.name} stroke="#0e7a52" dot={false} strokeWidth={2} />
                  {compare && (
                    <Line type="monotone" dataKey="co2Vergleich" name={compare.meta.name} stroke="#dc2626" dot={false} strokeWidth={2} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Kumulierte Investitionen (T€)</CardTitle>
              </CardHeader>
              <CardContent style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" />
                    <YAxis />
                    <Tooltip />
                    <Line type="stepAfter" dataKey="invest" name="Invest kumuliert (T€)" stroke="#0e7a52" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Gestrandete Gebäude</CardTitle>
              </CardHeader>
              <CardContent style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Line type="stepAfter" dataKey="stranded" name="Gestrandet" stroke="#dc2626" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Gebaeude im Szenario */}
          <Card>
            <CardHeader>
              <CardTitle>Gebäude im Szenario</CardTitle>
            </CardHeader>
            <CardContent>
              {active.evaluation.buildings.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Noch keine Maßnahmenpläne – Sammelmaßnahme oben anwenden.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-1.5 pr-3">Gebäude</th>
                      <th className="py-1.5 pr-3">Stranding</th>
                      <th className="py-1.5 pr-3">Klasse 2050</th>
                      <th className="py-1.5 pr-3">Exklusion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.evaluation.buildings.map((b) => (
                      <tr key={b.buildingId} className="border-b last:border-0">
                        <td className="py-1.5 pr-3">{b.name ?? b.buildingId}</td>
                        <td className="py-1.5 pr-3">
                          {b.strandingYear ?? "kein Stranding"}
                        </td>
                        <td className="py-1.5 pr-3">
                          {b.series[b.series.length - 1]?.epcClass ?? "—"}
                        </td>
                        <td className="py-1.5 pr-3">
                          {b.excludedFromYear
                            ? `ab ${b.excludedFromYear} (${formatNumber(
                                (b.series.find((p) => p.year === b.excludedFromYear)?.weight ?? 0) * 12,
                                0,
                              )}/12 im Jahr)`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
