"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FileUp,
  ChevronDown,
  ChevronUp,
  TrendingDown,
  Info,
  Gauge,
  CalendarClock,
  Euro,
  Leaf,
  ShieldCheck,
  ShieldAlert,
  Download,
  LayoutGrid,
} from "lucide-react";
import type { FacadeResult } from "@/lib/facade";
import {
  analyze,
  baseEnergyState,
  applyMeasures,
  summarizeInvestment,
  BASE_YEAR,
} from "@/lib/engine";
import { CRREM_TYPE_LABELS } from "@/lib/data/reference";
import { clearAnalysis } from "@/lib/session";
import { overheatingLevel } from "@/lib/overheating";
import { useOrganization } from "@clerk/nextjs";
import { useBuilding } from "@/hooks/use-building";
import { useRisk } from "@/hooks/use-risk";
import { useFacade } from "@/hooks/use-facade";
import { useFootprint } from "@/hooks/use-footprint";
import { useReportConfig } from "@/hooks/use-report-config";
import { BuildingModel } from "@/components/dashboard/building-model";
import { ReportConfigPanel } from "@/components/dashboard/report-config-panel";
import { formatEur, formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { CrremChart } from "@/components/dashboard/crrem-chart";
import { OptimizerPanel } from "@/components/dashboard/optimizer-panel";
import type { RoadmapStep } from "@/lib/engine/optimizer";
import {
  computeDnshAdaptation,
  estimateStockPercentile,
  type DnshResult,
} from "@/lib/engine/taxonomy";
import { LevyChart } from "@/components/dashboard/levy-chart";
import { RiskPanel } from "@/components/dashboard/risk-panel";
import { ReviewPanel } from "@/components/dashboard/review-panel";
import { Simulator } from "@/components/dashboard/simulator";
import { FacadePanel } from "@/components/dashboard/facade-panel";
import { PrintReport } from "@/components/dashboard/print-report";
import { AerialCapture } from "@/components/dashboard/aerial-capture";
import { Home } from "lucide-react";

function strandingLabel(year: number | null): string {
  return year ? String(year) : "nach 2050";
}

export function AnalyseClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const buildingId = searchParams.get("id");
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [roadmap, setRoadmap] = React.useState<RoadmapStep[]>([]);
  const reportConfigState = useReportConfig();
  const { organization } = useOrganization();

  // Datenfluss: Gebaeude laden/persistieren, Risiko + Fassade anreichern.
  const {
    building,
    ready,
    selected,
    cachedRisk,
    cachedFacade,
    cachedFootprint,
    patchBuilding,
    setBuilding,
    toggleMeasure,
    applyPackage,
  } = useBuilding(buildingId);

  const address = building?.adresse ?? null;
  const {
    risk,
    status: riskStatus,
    error: riskError,
  } = useRisk(address, buildingId, cachedRisk);

  // Koordinaten aus der Risiko-Geokodierung steuern die Schräg-Luftaufnahme.
  const coords = risk?.location
    ? { lat: risk.location.lat, lon: risk.location.lon }
    : null;

  const applyFacadeToBuilding = React.useCallback(
    (d: FacadeResult) => {
      setBuilding((prev) => {
        if (!prev) return prev;
        let next = prev;
        if (d.source === "bild" && d.wwrPercent != null && prev.wwrSource !== "manuell")
          next = { ...next, wwrPercent: d.wwrPercent, wwrSource: "bild" };
        if (d.pvYieldKwhPerM2 != null && prev.pvSource !== "manuell")
          next = { ...next, pvYieldKwhPerM2: d.pvYieldKwhPerM2, pvSource: "bild" };
        return next;
      });
    },
    [setBuilding],
  );

  // Minimalistische Gebaeudegrafik (OSM-Grundriss, gecacht je Gebaeude)
  const footprint = useFootprint(coords, buildingId, cachedFootprint);

  const {
    facade,
    status: facadeStatus,
    aerialResolved,
    handleAerial,
  } = useFacade({
    address,
    coords,
    buildingId,
    cached: cachedFacade,
    riskStatus,
    onApplyToBuilding: applyFacadeToBuilding,
  });

  const analytics = React.useMemo(() => {
    if (!building) return null;
    const baseState = baseEnergyState(building);
    const scenState = applyMeasures(
      baseState,
      selected,
      building.wwrPercent,
      building.pvYieldKwhPerM2,
    );
    const base = analyze(building, baseState, { useCertificateCo2: false });
    const scen = analyze(building, scenState, { useCertificateCo2: false });
    const invest = summarizeInvestment(selected, building.bezugsflaecheM2);
    let annualSavingsEur: number | null = null;
    let paybackYears: number | null = null;
    if (base.cost.eurPerYear != null && scen.cost.eurPerYear != null) {
      annualSavingsEur =
        base.cost.eurPerYear -
        scen.cost.eurPerYear +
        ((base.levy.eurPerYearBase ?? 0) - (scen.levy.eurPerYearBase ?? 0));
      if (
        invest.netInvestEur != null &&
        annualSavingsEur > 0 &&
        invest.netInvestEur > 0
      ) {
        paybackYears = invest.netInvestEur / annualSavingsEur;
      }
    }
    return { base, scen, invest, annualSavingsEur, paybackYears };
  }, [building, selected]);

  const handleRoadmapChange = React.useCallback((r: RoadmapStep[]) => {
    setRoadmap(r);
  }, []);

  function exportPdf() {
    const prev = document.title;
    const slug = (building?.adresse ?? "Gebaeude").replace(/[^\w]+/g, "-");
    document.title = `Proximum-ESG_${slug}_${new Date().toISOString().slice(0, 10)}`;
    window.addEventListener(
      "afterprint",
      () => {
        document.title = prev;
      },
      { once: true },
    );
    window.print();
  }

  if (!ready || !building || !analytics) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Analyse wird geladen…
      </div>
    );
  }

  const { base, scen, invest, annualSavingsEur, paybackYears } = analytics;
  const hasMeasures = selected.length > 0;
  const area = building.bezugsflaecheM2;

  // Deltas (positiv = Verbesserung)
  const co2Delta =
    base.co2.tonnesPerYear != null && scen.co2.tonnesPerYear != null
      ? base.co2.tonnesPerYear - scen.co2.tonnesPerYear
      : null;
  const strandDelta =
    (scen.crrem.strandingYear ?? 2051) - (base.crrem.strandingYear ?? 2051);
  const costDelta =
    base.cost.eurPerYear != null && scen.cost.eurPerYear != null
      ? base.cost.eurPerYear - scen.cost.eurPerYear
      : null;
  const levyDelta =
    base.levy.eurPerYearBase != null && scen.levy.eurPerYearBase != null
      ? base.levy.eurPerYearBase - scen.levy.eurPerYearBase
      : null;

  // Ueberhitzung: WWR x zukuenftige Hitzebelastung (aus der Risiko-API)
  const hitzeFuture = risk
    ? risk.hazards
        .filter(
          (h) =>
            h.gruppe === "Hitze" &&
            h.timeframe !== "Referenz" &&
            h.timeframe !== "Gegenwart",
        )
        .reduce<number | null>(
          (max, h) => (max == null ? h.anzeigewert : Math.max(max, h.anzeigewert)),
          null,
        )
    : null;
  const overheat = overheatingLevel(building.wwrPercent, hitzeFuture);

  // DNSH "Anpassung an den Klimawandel" aus dem Klimarisiko-Screening
  const dnsh = computeDnshAdaptation(risk);

  // Perzentil-Einordnung im nationalen Bestand (Naeherung, Predium-artig)
  const stockPercentile = estimateStockPercentile(
    building.primaryKwhM2a,
    building.crremType,
  );

  return (
    <main className="min-h-screen pb-16">
      {/* Schräg-Luftbild-Erfassung (offscreen, einmalig) */}
      {coords && !aerialResolved && (
        <AerialCapture
          lat={coords.lat}
          lon={coords.lon}
          enabled
          onResult={handleAerial}
        />
      )}

      {/* Druck-Report (nur beim PDF-Export sichtbar) */}
      <div className="print-only">
        <PrintReport
          building={building}
          base={base}
          scen={scen}
          hasMeasures={hasMeasures}
          selected={selected}
          invest={invest}
          annualSavingsEur={annualSavingsEur}
          paybackYears={paybackYears}
          risk={risk}
          facade={facade}
          overheat={overheat}
          dnsh={dnsh}
          footprint={footprint}
          config={reportConfigState.config}
          orgName={organization?.name ?? null}
        />
      </div>

      {/* Header */}
      <header className="no-print sticky top-0 z-10 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push(buildingId ? "/portfolio" : "/")}
              aria-label="Zurück"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="font-semibold leading-tight">
                {building.adresse ?? "Unbekannte Adresse"}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span>{building.hauptnutzung ?? "—"}</span>
                {building.baujahr && <span>· Bj. {building.baujahr}</span>}
                {area && <span>· {formatNumber(area)} m²</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{building.gebaeudetyp}</Badge>
            <Badge variant="outline">{building.ausweistyp}</Badge>
            <Badge
              variant="outline"
              title={
                building.crremApproximated
                  ? `Nutzungsart „${building.hauptnutzung ?? "?"}" hat keine eigene CRREM-Klasse und wurde näherungsweise als ${building.crremType} eingestuft – im Bereich „Erkannte Kennwerte prüfen" änderbar.`
                  : `CRREM-Nutzungsart ${building.crremType}`
              }
            >
              CRREM {building.crremType}
              {building.crremApproximated ? " ≈" : ""}
            </Badge>
            <Button variant="default" size="sm" onClick={exportPdf}>
              <Download className="h-4 w-4" />
              Als PDF exportieren
            </Button>
            <ReportConfigPanel state={reportConfigState} />
            <Link
              href="/portfolio"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm font-medium transition-colors hover:bg-accent"
            >
              <LayoutGrid className="h-4 w-4" />
              Portfolio
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                clearAnalysis();
                router.push("/");
              }}
            >
              <FileUp className="h-4 w-4" />
              Neuer Ausweis
            </Button>
          </div>
        </div>
      </header>

      <div className="no-print mx-auto max-w-6xl space-y-6 px-6 pt-6">
        {/* KPI-Karten */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi
            icon={<Gauge className="h-4 w-4" />}
            title="CO₂-Ausstoß"
            value={
              scen.co2.tonnesPerYear != null
                ? formatNumber(scen.co2.tonnesPerYear, 1)
                : formatNumber(scen.co2.intensityKgM2a, 1)
            }
            unit={scen.co2.tonnesPerYear != null ? "t/a" : "kg/m²·a"}
            sub={`${formatNumber(scen.co2.intensityKgM2a, 1)} kg/m²·a${
              building.thgKgM2a != null
                ? ` · Ausweis: ${formatNumber(building.thgKgM2a, 0)}`
                : ""
            }`}
            delta={
              hasMeasures && co2Delta != null
                ? `−${formatNumber(co2Delta, 1)} t/a`
                : null
            }
          />
          <Kpi
            icon={<CalendarClock className="h-4 w-4" />}
            title="CRREM-Stranding"
            value={strandingLabel(scen.crrem.strandingYear)}
            unit=""
            sub={`Zielpfad ${CRREM_TYPE_LABELS[building.crremType]}`}
            delta={
              hasMeasures && strandDelta > 0 ? `+${strandDelta} Jahre` : null
            }
          />
          <Kpi
            icon={<Euro className="h-4 w-4" />}
            title="Energiekosten"
            value={
              scen.cost.eurPerYear != null
                ? formatEur(scen.cost.eurPerYear)
                : formatNumber(scen.cost.eurPerM2Year, 1)
            }
            unit={scen.cost.eurPerYear != null ? "/ Jahr" : "€/m²·a"}
            sub={`${formatNumber(scen.cost.eurPerM2Year, 1)} €/m²·a`}
            delta={
              hasMeasures && costDelta != null && costDelta > 0
                ? `−${formatEur(costDelta)}`
                : null
            }
          />
          <Kpi
            icon={<Leaf className="h-4 w-4" />}
            title={`CO₂-Abgabe ${BASE_YEAR}`}
            value={
              scen.levy.eurPerYearBase != null
                ? formatEur(scen.levy.eurPerYearBase)
                : "—"
            }
            unit="/ Jahr"
            sub={
              scen.levy.fossilTonnesPerYear != null
                ? `${formatNumber(scen.levy.fossilTonnesPerYear, 1)} t fossil/a`
                : "keine fossile Basis"
            }
            delta={
              hasMeasures && levyDelta != null && levyDelta > 0
                ? `−${formatEur(levyDelta)}`
                : null
            }
          />
          <TaxonomyKpi
            aligned={base.taxonomy.aligned}
            detail={base.taxonomy.detail}
            dnsh={dnsh}
            stockPercentile={stockPercentile}
          />
        </div>

        {/* Gebaeudegrafik (OSM-Grundriss, minimalistisch) */}
        {footprint && footprint.buildings.some((b) => b.main) && (
          <Card className="no-print overflow-hidden">
            <CardContent className="relative bg-muted/30 p-0">
              <BuildingModel
                footprint={footprint}
                className="mx-auto block h-72 w-full"
              />
              <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground">
                Gebäude &amp; Umgebung · Grundriss: OpenStreetMap
              </span>
            </CardContent>
          </Card>
        )}

        {/* CRREM */}
        <Card className="print-avoid-break">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-primary" />
              CRREM-Dekarbonisierungspfad & Stranding-Risiko
            </CardTitle>
            <CardDescription>
              Wann überschreitet die CO₂-Intensität des Gebäudes den 1,5-°C-Zielpfad
              ({CRREM_TYPE_LABELS[building.crremType]})? Stranding-Jahr im Ist-Zustand:{" "}
              <strong>{strandingLabel(base.crrem.strandingYear)}</strong>
              {hasMeasures && (
                <>
                  {" "}→ nach Sanierung:{" "}
                  <strong className="text-[var(--success)]">
                    {strandingLabel(scen.crrem.strandingYear)}
                  </strong>
                </>
              )}
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CrremChart
              baseSeries={base.crrem.series}
              scenarioSeries={scen.crrem.series}
              strandingBase={base.crrem.strandingYear}
              strandingScenario={scen.crrem.strandingYear}
              hasMeasures={hasMeasures}
              roadmap={roadmap.map((s) => ({ year: s.year, label: s.label }))}
            />
          </CardContent>
        </Card>

        {/* Sanierungs-Optimizer */}
        <Card className="no-print">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary" />
              Sanierungs-Optimizer
            </CardTitle>
            <CardDescription>
              Findet das beste Maßnahmenpaket für Ihr Ziel (vollständige
              Kombinationssuche über den Katalog) und schlägt eine zeitliche
              Roadmap vor – die Schritte erscheinen als Marker im CRREM-Chart.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OptimizerPanel
              building={building}
              selected={selected}
              onApplyPackage={applyPackage}
              onRoadmapChange={handleRoadmapChange}
            />
          </CardContent>
        </Card>

        {/* CO2-Abgabe + Energiekosten */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Leaf className="h-5 w-5 text-primary" />
                CO₂-Abgabe (Projektion)
              </CardTitle>
              <CardDescription>
                Bepreisung fossiler Energieträger (BEHG, ab 2027 EU-ETS2) bis 2050.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LevyChart
                base={base.levy}
                scenario={scen.levy}
                hasMeasures={hasMeasures}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Euro className="h-5 w-5 text-primary" />
                Energiekosten je Energieträger
              </CardTitle>
              <CardDescription>
                Auf Basis aktueller Durchschnittspreise ({BASE_YEAR}).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {scen.cost.breakdown.map((b, i) => {
                  const total = scen.cost.eurPerYear ?? scen.cost.eurPerM2Year;
                  const val = b.eurPerYear ?? 0;
                  const pct = total > 0 ? (val / total) * 100 : 0;
                  return (
                    <div key={`${b.label}-${i}`}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span>{b.label}</span>
                        <span className="font-medium">
                          {b.eurPerYear != null ? formatEur(b.eurPerYear) : "—"}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between border-t pt-3 text-sm font-semibold">
                  <span>Gesamt</span>
                  <span>
                    {scen.cost.eurPerYear != null
                      ? formatEur(scen.cost.eurPerYear)
                      : `${formatNumber(scen.cost.eurPerM2Year, 1)} €/m²·a`}
                  </span>
                </div>

                {/* Endenergie-Kennzahlen: Absolutwert + Traeger-Split (Ist) */}
                <div className="border-t pt-3 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Endenergie (Ist)</span>
                    <span className="font-medium text-foreground">
                      {formatNumber(building.totalKwhM2a, 0)} kWh/m²·a
                      {area != null &&
                        ` · ${formatNumber(building.totalKwhM2a * area, 0)} kWh/a`}
                    </span>
                  </div>
                  {building.primaryKwhM2a != null && (
                    <div className="mt-1 flex items-center justify-between">
                      <span>Primärenergie (Ist)</span>
                      <span className="font-medium text-foreground">
                        {formatNumber(building.primaryKwhM2a, 0)} kWh/m²·a
                        {area != null &&
                          ` · ${formatNumber(building.primaryKwhM2a * area, 0)} kWh/a`}
                      </span>
                    </div>
                  )}
                  {building.totalKwhM2a > 0 && building.perCarrier.length > 0 && (
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span>Energieträger-Split</span>
                      <span className="text-right font-medium text-foreground">
                        {building.perCarrier
                          .map(
                            (s) =>
                              `${formatNumber(((s.heatKwhM2a + s.electricityKwhM2a) / building.totalKwhM2a) * 100, 0)} % ${s.label}`,
                          )
                          .join(" · ")}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Gebaeudehuelle / Fassade (WWR) */}
        <Card className="print-avoid-break">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="h-5 w-5 text-primary" />
              Gebäudehülle & Fassade
            </CardTitle>
            <CardDescription>
              Fenster-zu-Wand-Anteil aus Fassadenbild (KI-Vision) oder Typologie –
              steuert die Hüllen-Maßnahmen und das Überhitzungsrisiko.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FacadePanel
              facade={facade}
              status={facadeStatus}
              wwrPercent={building.wwrPercent}
              wwrSource={building.wwrSource}
              pvYieldKwhPerM2={building.pvYieldKwhPerM2}
              pvSource={building.pvSource}
            />
          </CardContent>
        </Card>

        {/* Klimarisiken */}
        <Card className="print-avoid-break">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-primary" />
                Klimarisiken am Standort
              </span>
              <Badge
                variant={
                  overheat.level === "hoch"
                    ? "danger"
                    : overheat.level === "mittel"
                      ? "warning"
                      : "success"
                }
              >
                Überhitzung: {overheat.level}
              </Badge>
            </CardTitle>
            <CardDescription>
              Naturgefahren nach EU-Taxonomie-Kategorien (Temperatur, Wind, Wasser,
              Geophysik). {overheat.note}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RiskPanel risk={risk} status={riskStatus} error={riskError} />
          </CardContent>
        </Card>

        {/* Sanierungs-Simulator */}
        <Card className="no-print">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-primary" />
              Sanierungs-Simulator
            </CardTitle>
            <CardDescription>
              Maßnahmen aktivieren und die Wirkung auf alle Kennzahlen live sehen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Simulator
              selected={selected}
              onToggle={toggleMeasure}
              investment={invest}
              annualSavingsEur={annualSavingsEur}
              paybackYears={paybackYears}
            />
          </CardContent>
        </Card>

        {/* Review */}
        <Card className="no-print">
          <CardHeader
            className="cursor-pointer"
            onClick={() => setReviewOpen((v) => !v)}
          >
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Info className="h-5 w-5 text-primary" />
                Erkannte Kennwerte prüfen & korrigieren
                {(building.flags ?? []).length > 0 && (
                  <Badge
                    variant={
                      (building.flags ?? []).some((f) => f.severity === "warnung")
                        ? "danger"
                        : "warning"
                    }
                  >
                    {(building.flags ?? []).length} auffällige Felder
                  </Badge>
                )}
              </span>
              {reviewOpen ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </CardTitle>
          </CardHeader>
          {reviewOpen && (
            <CardContent>
              <ReviewPanel building={building} onPatch={patchBuilding} />
            </CardContent>
          )}
        </Card>

        {/* Annahmen / Hinweise */}
        {(building.notes.length > 0 || building.recommendations.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hinweise & Annahmen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {building.recommendations.length > 0 && (
                <div>
                  <div className="mb-1 font-medium text-foreground">
                    Modernisierungsempfehlungen aus dem Ausweis
                  </div>
                  <ul className="list-inside list-disc space-y-0.5">
                    {building.recommendations.map((r, i) => (
                      <li key={i}>
                        {r.bauteil ? `${r.bauteil}: ` : ""}
                        {r.massnahme}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {building.notes.length > 0 && (
                <ul className="list-inside list-disc space-y-0.5">
                  {building.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}
              <p className="border-t pt-3 text-xs">
                Berechnungen basieren auf dokumentierten Standard-Referenzwerten
                (CRREM Global Pathways v2.05, GEG-CO₂-Faktoren, BEG-Förderung, BEHG/EU-ETS2). Sie
                dienen der Orientierung und ersetzen keine Energieberatung.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

function Kpi({
  icon,
  title,
  value,
  unit,
  sub,
  delta,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  unit: string;
  sub: string;
  delta: string | null;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {icon}
          {title}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold tracking-tight">{value}</span>
          {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
        {delta && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-[var(--success)]/12 px-1.5 py-0.5 text-xs font-semibold text-[var(--success)]">
            <TrendingDown className="h-3 w-3" />
            {delta}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TaxonomyKpi({
  aligned,
  detail,
  dnsh,
  stockPercentile,
}: {
  aligned: boolean;
  detail: string;
  dnsh: DnshResult;
  stockPercentile: number | null;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {aligned ? (
            <ShieldCheck className="h-4 w-4" />
          ) : (
            <ShieldAlert className="h-4 w-4" />
          )}
          EU-Taxonomie
        </div>
        <div className="flex flex-wrap gap-1">
          {aligned ? (
            <Badge variant="success">konform</Badge>
          ) : (
            <Badge variant="danger">nicht konform</Badge>
          )}
          <Badge
            variant={
              dnsh.status === "konform"
                ? "success"
                : dnsh.status === "massnahmen_erforderlich"
                  ? "warning"
                  : "outline"
            }
            title={dnsh.detail}
          >
            DNSH:{" "}
            {dnsh.status === "konform"
              ? "erfüllt"
              : dnsh.status === "massnahmen_erforderlich"
                ? `${dnsh.findings.length} Maßnahme(n)`
                : "offen"}
          </Badge>
        </div>
        {stockPercentile != null && (
          <div className="mt-2 text-xs font-medium">
            Gehört zu den besten ~{stockPercentile} % des nationalen Bestands
            (Primärenergie, Näherung)
          </div>
        )}
        <div className="mt-2 text-xs text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  );
}
