"use client";

import * as React from "react";
import {
  Sparkles,
  Target,
  ShieldCheck,
  Wallet,
  CheckCircle2,
  XCircle,
  CalendarClock,
  ArrowRight,
} from "lucide-react";
import type { NormalizedBuilding } from "@/lib/schema";
import {
  optimize,
  type OptimizerGoal,
  type OptimizerObjective,
  type OptimizerResult,
  type RankedPackage,
} from "@/lib/engine/optimizer";
import { formatEur, formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const inputCls =
  "h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const GOAL_LABELS: Record<OptimizerGoal, string> = {
  stranding: "Stranding bis Jahr X vermeiden",
  taxonomy: "EU-Taxonomie-konform",
  budget: "Budget-Limit",
};

const OBJECTIVE_LABELS: Record<OptimizerObjective, string> = {
  minInvest: "Minimale Netto-Investition",
  co2PerEuro: "Maximale CO₂-Reduktion je €",
  maxDelay: "Maximaler Stranding-Aufschub",
};

function strandingLabel(year: number | null): string {
  return year ? String(year) : "nach 2050";
}

interface Props {
  building: NormalizedBuilding;
  /** Aktuell im Simulator gewaehlte Massnahmen (fuer den Vergleich). */
  selected: string[];
  /** Uebernimmt ein Paket in den Simulator. */
  onApplyPackage: (measureIds: string[]) => void;
  /** Meldet die Roadmap des besten Pakets an das Dashboard (CRREM-Marker). */
  onRoadmapChange: (roadmap: OptimizerResult["roadmap"]) => void;
}

export function OptimizerPanel({
  building,
  selected,
  onApplyPackage,
  onRoadmapChange,
}: Props) {
  const [goal, setGoal] = React.useState<OptimizerGoal>("stranding");
  const [targetYear, setTargetYear] = React.useState(2045);
  const [budgetInput, setBudgetInput] = React.useState("");
  const [objective, setObjective] = React.useState<OptimizerObjective>("minInvest");

  const budgetEur = React.useMemo(() => {
    const n = Number(budgetInput.replace(/[.\s]/g, "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [budgetInput]);

  // Deferred: die 511 Simulationen laufen nachrangig, damit Tipp-Eingaben
  // (z. B. im Review-Panel oder Budget-Feld) nicht pro Tastendruck blockieren.
  const deferredBuilding = React.useDeferredValue(building);
  const deferredTargetYear = React.useDeferredValue(targetYear);
  const deferredBudgetEur = React.useDeferredValue(budgetEur);

  const result = React.useMemo(
    () =>
      optimize(deferredBuilding, {
        goal,
        targetYear: deferredTargetYear,
        budgetEur: deferredBudgetEur,
        objective,
      }),
    [deferredBuilding, goal, deferredTargetYear, deferredBudgetEur, objective],
  );

  const roadmap = result.roadmap;
  React.useEffect(() => {
    onRoadmapChange(roadmap);
  }, [roadmap, onRoadmapChange]);

  const best = result.best;
  const bestApplied =
    best != null &&
    best.measureIds.length === selected.length &&
    best.measureIds.every((id) => selected.includes(id));

  return (
    <div className="space-y-5">
      {/* Ziel-Auswahl */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Ziel</span>
          <select
            className={inputCls}
            value={goal}
            onChange={(e) => setGoal(e.target.value as OptimizerGoal)}
          >
            {(Object.keys(GOAL_LABELS) as OptimizerGoal[]).map((g) => (
              <option key={g} value={g}>
                {GOAL_LABELS[g]}
              </option>
            ))}
          </select>
        </label>
        {goal === "stranding" && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Kein Stranding vor Jahr
            </span>
            <input
              className={inputCls}
              type="number"
              min={2026}
              max={2050}
              value={targetYear}
              onChange={(e) => setTargetYear(Number(e.target.value) || 2045)}
            />
          </label>
        )}
        {goal === "budget" && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Budget (€ netto)
            </span>
            <input
              className={inputCls}
              inputMode="numeric"
              placeholder="z. B. 500000"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
            />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            Zielfunktion
          </span>
          <select
            className={inputCls}
            value={objective}
            onChange={(e) => setObjective(e.target.value as OptimizerObjective)}
          >
            {(Object.keys(OBJECTIVE_LABELS) as OptimizerObjective[]).map((o) => (
              <option key={o} value={o}>
                {OBJECTIVE_LABELS[o]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col justify-end text-xs text-muted-foreground">
          {result.evaluatedCount} Pakete geprüft · {result.feasibleCount} erfüllen
          das Ziel
        </div>
      </div>

      {/* Bestes Paket */}
      {best ? (
        <div className="rounded-xl border border-primary/40 bg-accent/30 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              Optimales Paket ({best.measureIds.length} Maßnahmen)
            </div>
            <Button
              size="sm"
              variant={bestApplied ? "secondary" : "default"}
              onClick={() => onApplyPackage(best.measureIds)}
              disabled={bestApplied}
            >
              {bestApplied ? (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Im Simulator aktiv
                </>
              ) : (
                <>
                  <ArrowRight className="h-4 w-4" /> In Simulator übernehmen
                </>
              )}
            </Button>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {best.labels.map((l) => (
              <Badge key={l} variant="secondary">
                {l}
              </Badge>
            ))}
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              icon={<CalendarClock className="h-3.5 w-3.5" />}
              label="Stranding"
              value={`${strandingLabel(result.baseStrandingYear)} → ${strandingLabel(best.strandingYear)}`}
            />
            <Metric
              icon={<Wallet className="h-3.5 w-3.5" />}
              label="Netto-Invest"
              value={
                best.netInvestEur != null
                  ? formatEur(best.netInvestEur)
                  : `${formatNumber(best.netInvestPerM2)} €/m²`
              }
            />
            <Metric
              icon={<Target className="h-3.5 w-3.5" />}
              label="€ je t CO₂/a"
              value={
                best.eurPerTonCo2 != null ? formatEur(best.eurPerTonCo2) : "—"
              }
            />
            <Metric
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
              label="Taxonomie (Schätzung)"
              value={best.taxonomyAlignedEstimated ? "konform" : "nicht konform"}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--warning)]/50 bg-[var(--warning)]/10 p-3 text-sm">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Kein Maßnahmenpaket erfüllt das gewählte Ziel
            {goal === "stranding" ? ` (kein Stranding vor ${targetYear})` : ""}
            {goal === "budget" && budgetEur == null
              ? " – bitte Budget angeben"
              : ""}
            . Die Rangliste zeigt die besten verfügbaren Pakete.
          </span>
        </div>
      )}

      {/* Roadmap */}
      {roadmap.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sanierungs-Roadmap (greedy: günstigste CO₂-Vermeidung zuerst, vor dem
            jeweils drohenden Stranding)
          </h4>
          <ol className="space-y-1.5">
            {roadmap.map((step, i) => (
              <li
                key={step.measureId}
                className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-sm"
              >
                <Badge variant="default">{step.year}</Badge>
                <span className="font-medium">
                  {i + 1}. {step.label}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {step.netInvestEur != null
                    ? `${formatEur(step.netInvestEur)} · `
                    : ""}
                  danach Stranding: {strandingLabel(step.strandingAfter)} ·{" "}
                  {formatNumber(step.co2IntensityAfterKgM2a, 1)} kg CO₂/m²·a
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Rangliste */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Rangliste der besten Pakete
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Maßnahmen</th>
                <th className="py-2 pr-3">Stranding</th>
                <th className="py-2 pr-3">Netto-Invest</th>
                <th className="py-2 pr-3">€ / t CO₂·a</th>
                <th className="py-2 pr-3">Amortisation</th>
                <th className="py-2 pr-3">Ziel</th>
                <th className="py-2 text-right" />
              </tr>
            </thead>
            <tbody>
              {result.ranking.map((p, i) => (
                <RankingRow
                  key={p.measureIds.join("+")}
                  rank={i + 1}
                  p={p}
                  onApply={() => onApplyPackage(p.measureIds)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Der Optimizer prüft alle {result.evaluatedCount} Kombinationen des
        Maßnahmenkatalogs mit der vereinfachten, deterministischen Engine.
        Taxonomie nach Sanierung ist eine Primärenergie-Schätzung (GEG-PE-Faktoren).
        Ergebnisse dienen der Orientierung und ersetzen keine Fachplanung.
      </p>
    </div>
  );
}

function RankingRow({
  rank,
  p,
  onApply,
}: {
  rank: number;
  p: RankedPackage;
  onApply: () => void;
}) {
  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-3 font-medium">{rank}</td>
      <td className="max-w-[320px] py-2 pr-3">
        <span className="line-clamp-2">{p.labels.join(", ")}</span>
      </td>
      <td className="py-2 pr-3">{strandingLabel(p.strandingYear)}</td>
      <td className="py-2 pr-3">
        {p.netInvestEur != null
          ? formatEur(p.netInvestEur)
          : `${formatNumber(p.netInvestPerM2)} €/m²`}
      </td>
      <td className="py-2 pr-3">
        {p.eurPerTonCo2 != null ? formatEur(p.eurPerTonCo2) : "—"}
      </td>
      <td className="py-2 pr-3">
        {p.paybackYears != null ? `${formatNumber(p.paybackYears, 1)} J.` : "—"}
      </td>
      <td className="py-2 pr-3">
        {p.feasible ? (
          <Badge variant="success">erfüllt</Badge>
        ) : (
          <Badge variant="outline">verfehlt</Badge>
        )}
      </td>
      <td className="py-2 text-right">
        <Button size="sm" variant="ghost" onClick={onApply}>
          Übernehmen
        </Button>
      </td>
    </tr>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="mb-0.5 flex items-center gap-1 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
