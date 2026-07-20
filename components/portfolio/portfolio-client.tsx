"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  CalendarClock,
  Euro,
  FileUp,
  Gauge,
  Leaf,
  Loader2,
  ShieldCheck,
  Trash2,
  TrendingDown,
  Users,
  ArrowUpDown,
} from "lucide-react";
import { OrganizationSwitcher, UserButton, useAuth } from "@clerk/nextjs";
import { useVirtualizer } from "@tanstack/react-virtual";
import type {
  PortfolioAggregation,
  PortfolioEntry,
} from "@/lib/engine/portfolio";
import { CRREM_TYPE_LABELS } from "@/lib/data/reference";
import { formatEur, formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CrremChart } from "@/components/dashboard/crrem-chart";

type SortKey =
  | "name"
  | "areaM2"
  | "co2"
  | "cost"
  | "stranding"
  | "taxonomy";

function strandingLabel(year: number | null): string {
  return year ? String(year) : "nach 2050";
}

/** Zeilenhoehe der virtualisierten Tabelle (px, fix fuer den Virtualizer). */
const ROW_HEIGHT = 49;

interface PortfolioMeta {
  id: string;
  name: string;
  memberCount: number;
}

export function PortfolioClient({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const { orgId } = useAuth();
  const [agg, setAgg] = React.useState<PortfolioAggregation | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [sortKey, setSortKey] = React.useState<SortKey>("stranding");
  const [sortAsc, setSortAsc] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  // Portfolio-Entitaeten (A7): null = "Alle Gebäude" (Scope-Gesamtsicht)
  const [portfolioList, setPortfolioList] = React.useState<PortfolioMeta[]>([]);
  const [activePortfolio, setActivePortfolio] = React.useState<string | null>(null);
  const [selection, setSelection] = React.useState<Set<string>>(new Set());

  const loadPortfolios = React.useCallback(async () => {
    try {
      const res = await fetch("/api/portfolios");
      const data = await res.json();
      if (res.ok) setPortfolioList(data.portfolios);
    } catch {
      // Portfolio-Verwaltung ist optional; Fehler nicht blockierend
    }
  }, []);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      // Aggregation laeuft serverseitig (2.13-12b): kein volles JSONB im Client.
      const url = activePortfolio
        ? `/api/portfolio?portfolioId=${activePortfolio}`
        : "/api/portfolio";
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden.");
      setAgg(data.portfolio);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden.");
      setAgg(null);
    }
  }, [activePortfolio]);

  // Neu laden, wenn die aktive Organisation (Mandant) wechselt.
  React.useEffect(() => {
    setAgg(null);
    setSelection(new Set());
    load();
    loadPortfolios();
  }, [load, loadPortfolios, orgId]);

  async function createPortfolio() {
    const name = window.prompt("Name des neuen Portfolios:");
    if (!name?.trim()) return;
    const res = await fetch("/api/portfolios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      await loadPortfolios();
      setActivePortfolio(data.portfolio.id);
    }
  }

  async function deletePortfolio() {
    if (!activePortfolio) return;
    const meta = portfolioList.find((p) => p.id === activePortfolio);
    if (!window.confirm(`Portfolio „${meta?.name ?? ""}" löschen? (Gebäude bleiben erhalten)`))
      return;
    await fetch(`/api/portfolios/${activePortfolio}`, { method: "DELETE" });
    setActivePortfolio(null);
    await loadPortfolios();
  }

  async function assignSelection(portfolioId: string, mode: "add" | "remove") {
    if (selection.size === 0) return;
    setBusy(true);
    try {
      await fetch(`/api/portfolios/${portfolioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "add"
            ? { addBuildingIds: [...selection] }
            : { removeBuildingIds: [...selection] },
        ),
      });
      setSelection(new Set());
      await Promise.all([load(), loadPortfolios()]);
    } finally {
      setBusy(false);
    }
  }

  function toggleSelect(id: string) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const sorted = React.useMemo(() => {
    if (!agg) return [];
    const dir = sortAsc ? 1 : -1;
    const val = (e: PortfolioEntry): number | string => {
      switch (sortKey) {
        case "name":
          return e.name.toLowerCase();
        case "areaM2":
          return e.areaM2 ?? -1;
        case "co2":
          return e.co2TonnesPerYear ?? e.co2IntensityKgM2a;
        case "cost":
          return e.costEurPerYear ?? -1;
        case "stranding":
          return e.strandingYear ?? 2051;
        case "taxonomy":
          return e.taxonomyAligned ? 1 : 0;
      }
    };
    return [...agg.entries].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (typeof va === "string" && typeof vb === "string")
        return va.localeCompare(vb) * dir;
      return ((va as number) - (vb as number)) * dir;
    });
  }, [agg, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  async function deleteBuilding(id: string, name: string) {
    if (!window.confirm(`Gebäude „${name}" endgültig löschen?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/buildings/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Löschen fehlgeschlagen.");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Löschen fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen pb-16">
      <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Leaf className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold leading-tight">Portfolio</div>
              <div className="text-xs text-muted-foreground">
                Alle Gebäude im Überblick
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/szenarien"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm font-medium transition-colors hover:bg-accent"
            >
              Szenarien
            </Link>
            <ExcelImportButton onImported={load} />
            <Link
              href="/anlegen"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <FileUp className="h-4 w-4" />
              Gebäude anlegen
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm font-medium transition-colors hover:bg-accent"
              >
                <Users className="h-4 w-4" />
                Admin
              </Link>
            )}
            <OrganizationSwitcher />
            <UserButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-6 pt-6">
        {/* Portfolio-Auswahl (A7): freie Gruppierung von Gebaeuden/WEs */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={activePortfolio ?? ""}
            onChange={(e) => setActivePortfolio(e.target.value || null)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            aria-label="Portfolio auswählen"
          >
            <option value="">Alle Gebäude</option>
            {portfolioList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.memberCount})
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={createPortfolio}>
            Neues Portfolio
          </Button>
          {activePortfolio && (
            <Button variant="outline" size="sm" onClick={deletePortfolio}>
              Portfolio löschen
            </Button>
          )}
          {selection.size > 0 && (
            <span className="ml-2 flex items-center gap-2 text-sm text-muted-foreground">
              {selection.size} ausgewählt →
              {activePortfolio ? (
                <>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => assignSelection(activePortfolio, "remove")}
                  >
                    Aus Portfolio entfernen
                  </Button>
                </>
              ) : (
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  defaultValue=""
                  disabled={busy}
                  onChange={(e) => {
                    if (e.target.value) assignSelection(e.target.value, "add");
                    e.target.value = "";
                  }}
                  aria-label="Auswahl zu Portfolio hinzufügen"
                >
                  <option value="" disabled>
                    Zu Portfolio hinzufügen…
                  </option>
                  {portfolioList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!agg ? (
          <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Portfolio wird geladen…
          </div>
        ) : agg.count === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Building2 className="h-8 w-8" />
              </div>
              <div>
                <p className="text-lg font-semibold">Noch keine Gebäude</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Laden Sie einen Energieausweis hoch, um Ihr Portfolio aufzubauen.
                </p>
              </div>
              <Button onClick={() => router.push("/")}>
                <FileUp className="h-4 w-4" />
                Energieausweis hochladen
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Portfolio-KPIs */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Kpi
                icon={<Building2 className="h-4 w-4" />}
                title="Gebäude"
                value={String(agg.count)}
                sub={`${formatNumber(agg.totalAreaM2)} m² Gesamtfläche`}
              />
              <Kpi
                icon={<Gauge className="h-4 w-4" />}
                title="CO₂-Ausstoß"
                value={`${formatNumber(agg.totalCo2TonnesPerYear, 1)} t/a`}
                sub="Summe Ist-Zustand"
              />
              <Kpi
                icon={<Euro className="h-4 w-4" />}
                title="Energiekosten"
                value={formatEur(agg.totalCostEurPerYear)}
                sub={`+ ${formatEur(agg.totalLevyEurPerYear)} CO₂-Abgabe/a`}
              />
              <Kpi
                icon={<CalendarClock className="h-4 w-4" />}
                title="Frühestes Stranding"
                value={strandingLabel(agg.earliestStrandingYear)}
                sub={`Portfolio (gewichtet): ${strandingLabel(agg.portfolioStrandingYear)}`}
              />
              <Kpi
                icon={<ShieldCheck className="h-4 w-4" />}
                title="EU-Taxonomie"
                value={`${agg.alignedCount} / ${agg.count}`}
                sub="Gebäude konform (Näherung)"
              />
            </div>

            {/* Gewichtete CRREM-Kurve */}
            {agg.series.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-primary" />
                    Portfolio-CRREM-Pfad (flächengewichtet)
                  </CardTitle>
                  <CardDescription>
                    Flächengewichtete CO₂-Intensität aller Gebäude (
                    {agg.weightedCount} von {agg.count} mit Bezugsfläche) gegen den
                    gewichteten 1,5-°C-Zielpfad. Portfolio-Stranding:{" "}
                    <strong>{strandingLabel(agg.portfolioStrandingYear)}</strong>
                    {agg.hasScenario && (
                      <>
                        {" "}
                        · mit geplanten Maßnahmen:{" "}
                        <strong className="text-[var(--success)]">
                          {strandingLabel(agg.scenarioStrandingYear)}
                        </strong>
                      </>
                    )}
                    .
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CrremChart
                    baseSeries={agg.series}
                    scenarioSeries={agg.scenarioSeries}
                    strandingBase={agg.portfolioStrandingYear}
                    strandingScenario={agg.scenarioStrandingYear}
                    hasMeasures={agg.hasScenario}
                  />
                </CardContent>
              </Card>
            )}

            {/* Gebaeude-Tabelle */}
            <Card>
              <CardHeader>
                <CardTitle>Gebäude</CardTitle>
                <CardDescription>
                  Klick auf eine Zeile öffnet die Detail-Analyse. Spalten sind
                  sortierbar.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <VirtualBuildingTable
                  entries={sorted}
                  busy={busy}
                  selection={selection}
                  onToggleSelect={toggleSelect}
                  onOpen={(id) => router.push(`/analyse?id=${id}`)}
                  onDelete={deleteBuilding}
                  toggleSort={toggleSort}
                />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}

/**
 * Bulk-Import von Predium-Excel-Exporten (Abloeseplan 1.1): laedt eine
 * .xlsx-Datei zu POST /api/import und aktualisiert danach das Portfolio.
 */
function ExcelImportButton({ onImported }: { onImported: () => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import fehlgeschlagen.");
      setMessage(
        `${data.imported} Gebäude importiert${data.skipped > 0 ? `, ${data.skipped} Zeile(n) übersprungen` : ""}.`,
      );
      onImported();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Import fehlgeschlagen.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
        title="Predium-Excel-Export importieren"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileUp className="h-4 w-4" />
        )}
        Excel-Import
      </button>
      {message && (
        <span className="max-w-[260px] truncate text-xs text-muted-foreground">
          {message}
        </span>
      )}
    </div>
  );
}

/**
 * Virtualisierte Gebaeude-Tabelle (2.13-12c): rendert nur die sichtbaren
 * Zeilen. Bei grossen Bestaenden (>= 1.000 Zeilen) bleibt die Liste dadurch
 * fluessig; die Virtualisierung nutzt Spacer-Zeilen ober-/unterhalb des
 * sichtbaren Fensters, damit die Tabellensemantik erhalten bleibt.
 */
function VirtualBuildingTable({
  entries,
  busy,
  selection,
  onToggleSelect,
  onOpen,
  onDelete,
  toggleSort,
}: {
  entries: PortfolioEntry[];
  busy: boolean;
  selection: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  toggleSort: (key: SortKey) => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const items = virtualizer.getVirtualItems();
  const paddingTop = items.length > 0 ? items[0].start : 0;
  const paddingBottom =
    items.length > 0
      ? virtualizer.getTotalSize() - items[items.length - 1].end
      : 0;

  return (
    <div
      ref={scrollRef}
      className="overflow-auto"
      style={{ maxHeight: "640px" }}
    >
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-[1] bg-card">
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="w-8 py-2 pr-2" aria-label="Auswahl" />
            <Th label="Gebäude" onClick={() => toggleSort("name")} />
            <Th label="Nutzung" />
            <Th label="Fläche" onClick={() => toggleSort("areaM2")} />
            <Th label="CO₂" onClick={() => toggleSort("co2")} />
            <Th label="Kosten/a" onClick={() => toggleSort("cost")} />
            <Th label="Stranding" onClick={() => toggleSort("stranding")} />
            <Th label="Taxonomie" onClick={() => toggleSort("taxonomy")} />
            <th className="py-2 text-right" />
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr aria-hidden>
              <td colSpan={9} style={{ height: `${paddingTop}px`, padding: 0 }} />
            </tr>
          )}
          {items.map((vi) => {
            const e = entries[vi.index];
            return (
              <tr
                key={e.id}
                onClick={() => onOpen(e.id)}
                style={{ height: `${ROW_HEIGHT}px` }}
                className="cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/40"
              >
                <td className="w-8 py-2.5 pr-2">
                  <input
                    type="checkbox"
                    checked={selection.has(e.id)}
                    onChange={() => onToggleSelect(e.id)}
                    onClick={(ev) => ev.stopPropagation()}
                    aria-label={`${e.name} auswählen`}
                  />
                </td>
                <td className="py-2.5 pr-3">
                  <div className="max-w-[260px] truncate font-medium">
                    {e.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {e.epcClass ? `Klasse ${e.epcClass}` : "—"}
                    {e.measureCount > 0 &&
                      ` · ${e.measureCount} Maßnahme(n) geplant`}
                  </div>
                </td>
                <td className="py-2.5 pr-3 text-muted-foreground">
                  {CRREM_TYPE_LABELS[e.crremType]}
                </td>
                <td className="py-2.5 pr-3">
                  {e.areaM2 != null ? `${formatNumber(e.areaM2)} m²` : "—"}
                </td>
                <td className="py-2.5 pr-3">
                  {e.co2TonnesPerYear != null
                    ? `${formatNumber(e.co2TonnesPerYear, 1)} t/a`
                    : `${formatNumber(e.co2IntensityKgM2a, 1)} kg/m²·a`}
                </td>
                <td className="py-2.5 pr-3">
                  {e.costEurPerYear != null ? formatEur(e.costEurPerYear) : "—"}
                </td>
                <td className="py-2.5 pr-3">
                  <Badge
                    variant={
                      e.strandingYear == null
                        ? "success"
                        : e.strandingYear <= 2030
                          ? "danger"
                          : "warning"
                    }
                  >
                    {strandingLabel(e.strandingYear)}
                  </Badge>
                  {e.scenarioStrandingYear != null &&
                    e.scenarioStrandingYear !== e.strandingYear && (
                      <span className="ml-1.5 text-xs text-[var(--success)]">
                        → {strandingLabel(e.scenarioStrandingYear)}
                      </span>
                    )}
                </td>
                <td className="py-2.5 pr-3">
                  {e.taxonomyAligned ? (
                    <Badge variant="success">konform</Badge>
                  ) : (
                    <Badge variant="outline">nicht konform</Badge>
                  )}
                </td>
                <td className="py-2.5 text-right">
                  <button
                    type="button"
                    title="Gebäude löschen"
                    aria-label="Gebäude löschen"
                    disabled={busy}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onDelete(e.id, e.name);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            );
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden>
              <td
                colSpan={9}
                style={{ height: `${paddingBottom}px`, padding: 0 }}
              />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Th({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <th className="py-2 pr-3">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground"
        >
          {label}
          <ArrowUpDown className="h-3 w-3" />
        </button>
      ) : (
        label
      )}
    </th>
  );
}

function Kpi({
  icon,
  title,
  value,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  sub: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {icon}
          {title}
        </div>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}
