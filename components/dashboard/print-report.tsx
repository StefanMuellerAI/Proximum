"use client";

/* eslint-disable @next/next/no-img-element */
import * as React from "react";
import type { CSSProperties } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import type { NormalizedBuilding } from "@/lib/schema";
import type { AnalysisResult, InvestmentSummary } from "@/lib/engine";
import {
  CRREM_TYPE_LABELS,
  RENOVATION_MEASURES,
  TAXONOMY,
  REFERENCE_INFO,
} from "@/lib/data/reference";
import {
  estimateStockPercentile,
  type DnshResult,
} from "@/lib/engine/taxonomy";
import { hazardDeltas, type RiskResult } from "@/lib/risk";
import type { FacadeResult } from "@/lib/facade";
import type { OverheatingResult } from "@/lib/overheating";
import type { FootprintResult } from "@/lib/footprint";
import type { ReportConfig } from "@/lib/report-config";
import { BuildingModel } from "@/components/dashboard/building-model";
import { formatEur, formatNumber } from "@/lib/utils";

interface Props {
  building: NormalizedBuilding;
  base: AnalysisResult;
  scen: AnalysisResult;
  hasMeasures: boolean;
  selected: string[];
  invest: InvestmentSummary;
  annualSavingsEur: number | null;
  paybackYears: number | null;
  risk: RiskResult | null;
  facade: FacadeResult | null;
  overheat: OverheatingResult;
  dnsh: DnshResult;
  footprint: FootprintResult | null;
  config: ReportConfig;
  orgName: string | null;
}

const CHART_W = 660;
const CHART_H = 220;

// CI-Farbwelt fuer den Druck (fixe, druckstabile Werte)
const CI = {
  accent: "#0e7a52",
  accentDark: "#0a5c3e",
  ink: "#0f172a",
  muted: "#64748b",
  rule: "#e2e8f0",
  zebra: "#f6f8f7",
  panel: "#f2f6f4",
  danger: "#dc2626",
  success: "#059669",
};

function strandingLabel(year: number | null): string {
  return year ? String(year) : "nach 2050";
}

function sampleYears<T extends { year: number }>(series: T[]): T[] {
  if (series.length === 0) return [];
  const last = series[series.length - 1];
  const out = series.filter((p) => p.year % 5 === 0);
  if (out[0]?.year !== series[0].year) out.unshift(series[0]);
  if (out[out.length - 1]?.year !== last.year) out.push(last);
  return out;
}

const imgStyle: CSSProperties = {
  width: "210px",
  height: "150px",
  objectFit: "cover",
  borderRadius: "8px",
  border: `1px solid ${CI.rule}`,
  display: "block",
};
const capStyle: CSSProperties = {
  fontSize: "10px",
  color: CI.muted,
  textAlign: "center",
  marginTop: "3px",
};

// ---------------------------------------------------------------------------
// Wiederverwendbare Report-Bausteine
// ---------------------------------------------------------------------------

let sectionCounter = 0;

function SectionHeading({
  no,
  children,
}: {
  no: number;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: "10px",
        borderBottom: `2px solid ${CI.accent}`,
        paddingBottom: "5px",
        marginBottom: "10px",
      }}
    >
      <span
        style={{
          fontSize: "11px",
          fontWeight: 700,
          color: CI.accent,
          letterSpacing: "0.08em",
        }}
      >
        {String(no).padStart(2, "0")}
      </span>
      <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: CI.ink }}>
        {children}
      </h2>
    </div>
  );
}

const thStyle: CSSProperties = {
  textAlign: "left",
  fontSize: "10px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: CI.muted,
  padding: "5px 8px",
  borderBottom: `1.5px solid ${CI.accent}`,
};
const tdStyle: CSSProperties = {
  fontSize: "11.5px",
  color: CI.ink,
  padding: "5px 8px",
  borderBottom: `1px solid ${CI.rule}`,
  verticalAlign: "top",
};

function Table({
  head,
  rows,
}: {
  head: React.ReactNode[];
  rows: React.ReactNode[][];
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={i} style={thStyle}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={i % 2 === 1 ? { background: CI.zebra } : undefined}>
            {r.map((c, j) => (
              <td key={j} style={tdStyle}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "good" | "bad" | "warn" | "neutral";
  children: React.ReactNode;
}) {
  const colors = {
    good: { bg: "#e7f4ee", fg: CI.accentDark },
    bad: { bg: "#fdeaea", fg: CI.danger },
    warn: { bg: "#fdf3e0", fg: "#92600a" },
    neutral: { bg: "#eef1f4", fg: CI.muted },
  }[tone];
  return (
    <span
      style={{
        display: "inline-block",
        borderRadius: "999px",
        padding: "1px 8px",
        fontSize: "10px",
        fontWeight: 700,
        background: colors.bg,
        color: colors.fg,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value == null || value === 0) return null;
  const worse = value > 0;
  return (
    <span style={{ color: worse ? CI.danger : CI.success, fontWeight: 700 }}>
      {" "}
      {worse ? `+${value}` : value}
    </span>
  );
}

/** Kennzahl-Box im KPI-Band. */
function Kpi({
  label,
  value,
  unit,
  sub,
  footnote,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string | null;
  footnote?: number;
}) {
  return (
    <div
      style={{
        flex: "1 1 0",
        minWidth: "100px",
        borderLeft: `2px solid ${CI.accent}`,
        padding: "2px 0 2px 10px",
      }}
    >
      <div
        style={{
          fontSize: "9.5px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: CI.muted,
        }}
      >
        {label}
        {footnote != null && <sup> {footnote}</sup>}
      </div>
      <div style={{ marginTop: "2px", whiteSpace: "nowrap" }}>
        <span style={{ fontSize: "20px", fontWeight: 700, color: CI.ink }}>
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: "10px", color: CI.muted, marginLeft: "4px" }}>
            {unit}
          </span>
        )}
      </div>
      {sub && (
        <div style={{ fontSize: "9.5px", color: CI.muted, marginTop: "1px" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/** Abschnitt mit optionaler linker Marginalie (Begriffserklaerung). */
function WithMargin({
  note,
  children,
}: {
  note: string | null;
  children: React.ReactNode;
}) {
  if (!note) return <>{children}</>;
  return (
    <div style={{ display: "flex", gap: "14px" }}>
      <div
        style={{
          flex: "0 0 130px",
          fontSize: "9.5px",
          lineHeight: 1.45,
          color: CI.muted,
          borderRight: `1px solid ${CI.rule}`,
          paddingRight: "10px",
        }}
      >
        {note}
      </div>
      <div style={{ flex: "1 1 0", minWidth: 0 }}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function PrintReport({
  building,
  base,
  scen,
  hasMeasures,
  selected,
  invest,
  annualSavingsEur,
  paybackYears,
  risk,
  facade,
  overheat,
  dnsh,
  footprint,
  config,
  orgName,
}: Props) {
  const { sections, options } = config;
  const area = building.bezugsflaecheM2;
  const showEur = options.kostenAnzeigen;
  const showTables = options.detailTabellen;

  const crremChartData = base.crrem.series.map((p, i) => ({
    year: p.year,
    pfad: p.pfad,
    ist: p.gebaeude,
    szenario: hasMeasures ? scen.crrem.series[i]?.gebaeude : undefined,
  }));
  const levyChartData = base.levy.series.map((p, i) => ({
    year: p.year,
    ist: p.eurPerYear ?? 0,
    szenario: hasMeasures ? (scen.levy.series[i]?.eurPerYear ?? 0) : undefined,
  }));

  const crremRows = sampleYears(base.crrem.series);
  const levyRows = sampleYears(base.levy.series);
  const scenLevyByYear = new Map(scen.levy.series.map((p) => [p.year, p.eurPerYear]));
  const scenCrremByYear = new Map(scen.crrem.series.map((p) => [p.year, p.gebaeude]));
  const selectedMeasures = RENOVATION_MEASURES.filter((m) => selected.includes(m.id));
  const percentile = estimateStockPercentile(
    building.primaryKwhM2a,
    building.crremType,
  );

  const axisTick = { fontSize: 10, fill: "#334155" };
  const today = new Date().toLocaleDateString("de-DE");

  // Abschnittsnummern dynamisch (nur sichtbare Abschnitte zaehlen)
  sectionCounter = 0;
  const nextNo = () => ++sectionCounter;

  return (
    <div style={{ color: CI.ink, fontSize: "12px" }}>
      {/* Wiederkehrende Fusszeile (position fixed wiederholt je Druckseite) */}
      <div className="report-page-footer">
        <span style={{ fontWeight: 700, color: CI.accent }}>PROXIMUM</span>
        <span style={{ color: CI.muted }}>
          {building.adresse ?? "Unbekannte Adresse"} · Erstellt am {today}
          {options.orgNameImKopf && orgName ? ` · ${orgName}` : ""}
        </span>
      </div>

      {/* Kopfzeile / Branding */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          borderBottom: `3px solid ${CI.accent}`,
          paddingBottom: "8px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "17px",
              fontWeight: 800,
              letterSpacing: "0.12em",
              color: CI.accent,
            }}
          >
            PROXIMUM
          </div>
          <div style={{ fontSize: "9.5px", color: CI.muted, letterSpacing: "0.05em" }}>
            ESG-ANALYSE FÜR IMMOBILIEN
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: "10px", color: CI.muted }}>
          {options.orgNameImKopf && orgName && (
            <div style={{ fontWeight: 700, color: CI.ink }}>{orgName}</div>
          )}
          <div>Erstellt am {today}</div>
          <div>CRREM-Szenario 1,5 °C</div>
        </div>
      </div>

      {/* Deckblatt: Adresse + Grafik + Stammdaten */}
      <section style={{ marginTop: "16px" }} className="print-avoid-break">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "18px" }}>
          <div style={{ flex: "1 1 0" }}>
            <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 800 }}>
              {building.adresse ?? "Unbekannte Adresse"}
            </h1>
            <div style={{ marginTop: "4px", fontSize: "11px", color: CI.muted }}>
              ESG-Report auf Basis des Energieausweises
            </div>

            <div
              style={{
                marginTop: "14px",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "6px 24px",
                fontSize: "11.5px",
              }}
            >
              {[
                ["Nutzung / Kategorie", building.hauptnutzung ?? "—"],
                ["Gebäudetyp", building.gebaeudetyp],
                [
                  "CRREM-Nutzungsart",
                  `${building.crremType} – ${CRREM_TYPE_LABELS[building.crremType]}`,
                ],
                ["Ausweistyp", building.ausweistyp],
                ["Baujahr", building.baujahr ?? "—"],
                [
                  "Bezugsfläche",
                  area != null ? `${formatNumber(area)} m²` : "—",
                ],
                [
                  "Fenster-zu-Wand-Anteil",
                  `${Math.round(building.wwrPercent)} % (${building.wwrSource})`,
                ],
                ["Überhitzungsrisiko", overheat.level],
              ].map(([k, v]) => (
                <div
                  key={String(k)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "10px",
                    borderBottom: `1px solid ${CI.rule}`,
                    paddingBottom: "3px",
                  }}
                >
                  <span style={{ color: CI.muted }}>{k}</span>
                  <span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {sections.gebaeudegrafik &&
            footprint &&
            footprint.buildings.some((b) => b.main) && (
              <figure style={{ margin: 0, flex: "0 0 auto" }}>
                <div
                  style={{
                    width: "225px",
                    height: "170px",
                    borderRadius: "10px",
                    border: `1px solid ${CI.rule}`,
                    background: CI.panel,
                    overflow: "hidden",
                  }}
                >
                  <BuildingModel footprint={footprint} width={225} height={170} />
                </div>
                <figcaption style={capStyle}>
                  Gebäude &amp; Umgebung (OpenStreetMap)
                </figcaption>
              </figure>
            )}
        </div>
      </section>

      {/* KPI-Band */}
      {sections.zusammenfassung && (
        <section style={{ marginTop: "18px" }} className="print-avoid-break">
          <SectionHeading no={nextNo()}>Kennzahlen im Überblick</SectionHeading>
          <div style={{ display: "flex", gap: "14px" }}>
            <Kpi
              label="CO₂e-Intensität"
              value={formatNumber(base.co2.intensityKgM2a, 1)}
              unit="kg/m²·a"
              sub={
                base.co2.tonnesPerYear != null
                  ? `${formatNumber(base.co2.tonnesPerYear, 1)} t/a gesamt`
                  : null
              }
              footnote={1}
            />
            <Kpi
              label="Misalignment"
              value={strandingLabel(base.crrem.strandingYear)}
              sub="CRREM 1,5-°C-Pfad"
              footnote={1}
            />
            <Kpi
              label="Endenergie"
              value={formatNumber(base.energy.totalKwhM2a, 0)}
              unit="kWh/m²·a"
              sub={
                area != null
                  ? `${formatNumber(base.energy.totalKwhM2a * area, 0)} kWh/a gesamt`
                  : null
              }
              footnote={2}
            />
            <Kpi
              label="Primärenergie"
              value={
                building.primaryKwhM2a != null
                  ? formatNumber(building.primaryKwhM2a, 0)
                  : "—"
              }
              unit={building.primaryKwhM2a != null ? "kWh/m²·a" : undefined}
              sub={
                building.primaryKwhM2a != null && area != null
                  ? `${formatNumber(building.primaryKwhM2a * area, 0)} kWh/a gesamt`
                  : null
              }
              footnote={2}
            />
            {showEur && (
              <Kpi
                label="Energiekosten"
                value={
                  base.cost.eurPerYear != null
                    ? formatEur(base.cost.eurPerYear)
                    : `${formatNumber(base.cost.eurPerM2Year, 1)} €/m²`
                }
                unit={base.cost.eurPerYear != null ? "/ Jahr" : undefined}
                sub={`${formatNumber(base.cost.eurPerM2Year, 1)} €/m²·a`}
                footnote={3}
              />
            )}
            {showEur && (
              <Kpi
                label="CO₂-Abgabe"
                value={
                  base.levy.eurPerYearBase != null
                    ? formatEur(base.levy.eurPerYearBase)
                    : "—"
                }
                unit={base.levy.eurPerYearBase != null ? "/ Jahr" : undefined}
                sub="BEHG / EU-ETS2"
                footnote={4}
              />
            )}
          </div>

          {/* Zweite Zeile: Status + Traeger-Split + Sanierungsvergleich */}
          <div
            style={{
              marginTop: "10px",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "8px 14px",
              fontSize: "11px",
            }}
          >
            <span>
              EU-Taxonomie{" "}
              {base.taxonomy.aligned ? (
                <StatusBadge tone="good">konform</StatusBadge>
              ) : (
                <StatusBadge tone="bad">nicht konform</StatusBadge>
              )}
            </span>
            <span>
              DNSH{" "}
              {dnsh.status === "konform" ? (
                <StatusBadge tone="good">erfüllt</StatusBadge>
              ) : dnsh.status === "massnahmen_erforderlich" ? (
                <StatusBadge tone="warn">
                  {dnsh.findings.length} Maßnahme(n)
                </StatusBadge>
              ) : (
                <StatusBadge tone="neutral">nicht bewertbar</StatusBadge>
              )}
            </span>
            {options.perzentilAnzeigen && percentile != null && (
              <span>
                Nationaler Bestand{" "}
                <StatusBadge tone={percentile <= 30 ? "good" : "neutral"}>
                  beste ~{percentile} %
                </StatusBadge>{" "}
                <span style={{ color: CI.muted }}>(Primärenergie, Näherung)</span>
              </span>
            )}
            {building.totalKwhM2a > 0 && building.perCarrier.length > 0 && (
              <span style={{ color: CI.muted }}>
                Energieträger:{" "}
                {building.perCarrier
                  .map(
                    (s) =>
                      `${formatNumber(((s.heatKwhM2a + s.electricityKwhM2a) / building.totalKwhM2a) * 100, 0)} % ${s.label}`,
                  )
                  .join(" · ")}
              </span>
            )}
          </div>

          {hasMeasures && (
            <div
              style={{
                marginTop: "10px",
                background: CI.panel,
                borderRadius: "8px",
                padding: "8px 12px",
                fontSize: "11px",
              }}
            >
              <span style={{ fontWeight: 700, color: CI.accentDark }}>
                Nach Sanierung ({selectedMeasures.length} Maßnahmen):
              </span>{" "}
              {formatNumber(scen.co2.intensityKgM2a, 1)} kg CO₂e/m²·a · Misalignment{" "}
              {strandingLabel(scen.crrem.strandingYear)} ·{" "}
              {formatNumber(scen.energy.totalKwhM2a, 0)} kWh/m²·a
              {showEur && scen.cost.eurPerYear != null
                ? ` · ${formatEur(scen.cost.eurPerYear)}/a Energiekosten`
                : ""}
            </div>
          )}
        </section>
      )}

      {/* CRREM */}
      {sections.crrem && (
        <section style={{ marginTop: "18px" }} className="report-chapter">
          <SectionHeading no={nextNo()}>
            CRREM-Pfad &amp; Misalignment
          </SectionHeading>
          <WithMargin
            note={
              "Der CRREM-Pfad übersetzt das 1,5-°C-Ziel in eine jährlich sinkende CO₂-Obergrenze je m². Das Misalignment-Jahr ist das Jahr, in dem das Gebäude den Pfad überschreitet."
            }
          >
            <div style={{ fontSize: "11px", marginBottom: "6px" }}>
              Misalignment im Ist-Zustand:{" "}
              <strong>{strandingLabel(base.crrem.strandingYear)}</strong>
              {hasMeasures && (
                <>
                  {" "}
                  → nach Sanierung:{" "}
                  <strong style={{ color: CI.success }}>
                    {strandingLabel(scen.crrem.strandingYear)}
                  </strong>
                </>
              )}
            </div>
            <LineChart
              width={CHART_W - 150}
              height={CHART_H}
              data={crremChartData}
              margin={{ top: 8, right: 16, bottom: 4, left: -8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={CI.rule} />
              <XAxis dataKey="year" tick={axisTick} interval={4} />
              <YAxis tick={axisTick} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="pfad" name="CRREM-Zielpfad (1,5 °C)" stroke="#64748b" strokeDasharray="5 4" dot={false} strokeWidth={2} isAnimationActive={false} />
              <Line type="monotone" dataKey="ist" name="Gebäude (Ist)" stroke={CI.danger} dot={false} strokeWidth={2.5} isAnimationActive={false} />
              {hasMeasures && (
                <Line type="monotone" dataKey="szenario" name="Nach Sanierung" stroke={CI.success} dot={false} strokeWidth={2.5} isAnimationActive={false} />
              )}
            </LineChart>
            {showTables && (
              <div style={{ marginTop: "8px" }}>
                <Table
                  head={["Jahr", "Zielpfad", "Gebäude (Ist)", "Nach Sanierung"]}
                  rows={crremRows.map((p) => [
                    p.year,
                    formatNumber(p.pfad, 1),
                    formatNumber(p.gebaeude, 1),
                    hasMeasures
                      ? formatNumber(scenCrremByYear.get(p.year) ?? 0, 1)
                      : "—",
                  ])}
                />
              </div>
            )}
          </WithMargin>
        </section>
      )}

      {/* CO2-Abgabe */}
      {sections.co2abgabe && (
        <section style={{ marginTop: "18px" }} className="print-avoid-break">
          <SectionHeading no={nextNo()}>CO₂-Abgabe-Projektion</SectionHeading>
          <WithMargin
            note={
              "Die CO₂-Abgabe bepreist fossile Energieträger (BEHG, ab 2027 EU-ETS2). Sie soll Anreize schaffen, den Verbrauch zu verringern bzw. auf klimafreundliche Technologien umzusteigen."
            }
          >
            <AreaChart
              width={CHART_W - 150}
              height={CHART_H}
              data={levyChartData}
              margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
            >
              <defs>
                <linearGradient id="pIst" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CI.danger} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={CI.danger} stopOpacity={0.03} />
                </linearGradient>
                <linearGradient id="pScen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CI.success} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={CI.success} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CI.rule} />
              <XAxis dataKey="year" tick={axisTick} interval={4} />
              <YAxis
                tick={axisTick}
                tickFormatter={(v) => {
                  const n = Number(v);
                  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="ist" name="CO₂-Abgabe (Ist)" stroke={CI.danger} fill="url(#pIst)" strokeWidth={2} isAnimationActive={false} />
              {hasMeasures && (
                <Area type="monotone" dataKey="szenario" name="Nach Sanierung" stroke={CI.success} fill="url(#pScen)" strokeWidth={2} isAnimationActive={false} />
              )}
            </AreaChart>
            {showTables && (
              <div style={{ marginTop: "8px" }}>
                <Table
                  head={["Jahr", "CO₂-Preis (€/t)", "Abgabe Ist", "Nach Sanierung"]}
                  rows={levyRows.map((p) => [
                    p.year,
                    formatNumber(p.priceEurPerT),
                    p.eurPerYear != null ? formatEur(p.eurPerYear) : "—",
                    hasMeasures && scenLevyByYear.get(p.year) != null
                      ? formatEur(scenLevyByYear.get(p.year) as number)
                      : "—",
                  ])}
                />
              </div>
            )}
          </WithMargin>
        </section>
      )}

      {/* Massnahmen */}
      {sections.massnahmen && hasMeasures && (
        <section style={{ marginTop: "18px" }} className="print-avoid-break">
          <SectionHeading no={nextNo()}>
            Sanierungsmaßnahmen &amp; Wirtschaftlichkeit
          </SectionHeading>
          <Table
            head={
              showEur
                ? ["Maßnahme", "Kosten (€/m²)", "BEG-Förderung"]
                : ["Maßnahme", "Kategorie"]
            }
            rows={selectedMeasures.map((m) =>
              showEur
                ? [m.label, formatNumber(m.costPerM2), `${Math.round(m.subsidyRate * 100)} %`]
                : [m.label, m.category],
            )}
          />
          {showEur && (
            <div
              style={{
                marginTop: "10px",
                display: "flex",
                gap: "14px",
              }}
            >
              <Kpi
                label="Investition (brutto)"
                value={
                  invest.totalInvestEur != null
                    ? formatEur(invest.totalInvestEur)
                    : `${formatNumber(invest.investPerM2)} €/m²`
                }
              />
              <Kpi
                label="BEG-Förderung"
                value={
                  invest.totalSubsidyEur != null
                    ? `− ${formatEur(invest.totalSubsidyEur)}`
                    : "—"
                }
              />
              <Kpi
                label="Netto-Investition"
                value={
                  invest.netInvestEur != null
                    ? formatEur(invest.netInvestEur)
                    : `${formatNumber(invest.netPerM2)} €/m²`
                }
              />
              <Kpi
                label="Einsparung / Jahr"
                value={annualSavingsEur != null ? formatEur(annualSavingsEur) : "—"}
              />
              <Kpi
                label="Amortisation"
                value={
                  paybackYears != null
                    ? `${formatNumber(paybackYears, 1)} Jahre`
                    : "—"
                }
              />
            </div>
          )}
        </section>
      )}

      {/* Fassade + Dach/PV */}
      {sections.fassade && (
        <section style={{ marginTop: "18px" }} className="print-avoid-break">
          <SectionHeading no={nextNo()}>
            Gebäudehülle, Fassade &amp; Dach
          </SectionHeading>
          <div style={{ display: "flex", gap: "12px", marginBottom: "8px" }}>
            {facade?.imageDataUrl && (
              <figure style={{ margin: 0 }}>
                <img
                  src={facade.imageDataUrl}
                  alt="Fassade (Street View)"
                  width={210}
                  height={150}
                  style={imgStyle}
                />
                <figcaption style={capStyle}>Straßenansicht</figcaption>
              </figure>
            )}
          </div>
          <p style={{ margin: 0, fontSize: "11.5px" }}>
            Fenster-zu-Wand-Anteil (WWR):{" "}
            <strong>{Math.round(building.wwrPercent)} %</strong> (Quelle:{" "}
            {building.wwrSource}
            {facade?.source === "bild" && facade.konfidenz
              ? `, Konfidenz ${facade.konfidenz}`
              : ""}
            ). {overheat.note}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: "11.5px" }}>
            PV-Potenzial:{" "}
            <strong>{Math.round(building.pvYieldKwhPerM2)} kWh/m²·a</strong>{" "}
            (Quelle:{" "}
            {building.pvSource === "solar"
              ? "Google Solar API"
              : building.pvSource}
            {facade?.solar?.status === "ok" ? (
              <>
                {facade.solar.roofAreaM2 != null
                  ? `, nutzbare Dachfläche ${formatNumber(facade.solar.roofAreaM2, 0)} m²`
                  : ""}
                {facade.solar.yearlyEnergyDcKwh != null
                  ? `, max. Jahresertrag ${formatNumber(facade.solar.yearlyEnergyDcKwh, 0)} kWh/a`
                  : ""}
                {facade.solar.imageryDate
                  ? `, Befliegung ${facade.solar.imageryDate}`
                  : ""}
              </>
            ) : (
              ""
            )}
            ).
          </p>
        </section>
      )}

      {/* EU-Taxonomie & DNSH */}
      {sections.taxonomie && (
        <section style={{ marginTop: "18px" }} className="report-chapter">
          <SectionHeading no={nextNo()}>
            EU-Taxonomie (Klimaschutz) &amp; DNSH
          </SectionHeading>
          <Table
            head={["Kriterium", "Bewertung"]}
            rows={[
              [
                "Substantial Contribution (Klimaschutz)",
                <span key="sc">
                  {base.taxonomy.aligned ? (
                    <StatusBadge tone="good">konform</StatusBadge>
                  ) : (
                    <StatusBadge tone="bad">nicht konform</StatusBadge>
                  )}{" "}
                  {base.taxonomy.criterion}
                </span>,
              ],
              ["Bewertungsdetail", base.taxonomy.detail],
              [
                "Angewandte PED-Schwelle",
                `${base.taxonomy.thresholdKwhM2a} kWh/(m²·a)` +
                  (base.taxonomy.primaryKwhM2a != null
                    ? ` · Gebäude: ${Math.round(base.taxonomy.primaryKwhM2a)} kWh/(m²·a)`
                    : ""),
              ],
              ...(options.perzentilAnzeigen && percentile != null
                ? [
                    [
                      "Einordnung im nationalen Bestand",
                      `Gehört zu den besten ~${percentile} % bez. auf den Primärenergiebedarf (Näherung auf Basis dokumentierter Verteilungs-Anker, dena/BBSR)`,
                    ] as React.ReactNode[],
                  ]
                : []),
              [
                "DNSH – Anpassung an den Klimawandel",
                <span key="dnsh">
                  {dnsh.status === "konform" ? (
                    <StatusBadge tone="good">näherungsweise erfüllt</StatusBadge>
                  ) : dnsh.status === "massnahmen_erforderlich" ? (
                    <StatusBadge tone="warn">Anpassungsmaßnahmen erforderlich</StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">nicht bewertbar</StatusBadge>
                  )}{" "}
                  {dnsh.detail}
                </span>,
              ],
            ]}
          />
          {dnsh.findings.length > 0 && (
            <div style={{ marginTop: "10px" }}>
              <Table
                head={[
                  "Zukunfts-Gefährdung (hoch)",
                  "Zeitraum",
                  "Stufe",
                  "Erforderliche Anpassungsmaßnahme",
                ]}
                rows={dnsh.findings.map((f) => [
                  f.label,
                  f.timeframe,
                  f.level,
                  f.adaptationMeasure,
                ])}
              />
            </div>
          )}
          <p style={{ margin: "6px 0 0", fontSize: "9.5px", color: CI.muted }}>
            Regelbasierte Näherung ({TAXONOMY.source}; Stand {TAXONOMY.version}).
            Kein Ersatz für eine testierte Taxonomie-Prüfung.
          </p>
        </section>
      )}

      {/* Klimarisiken */}
      {sections.klimarisiken && risk && (
        <section style={{ marginTop: "18px" }}>
          <SectionHeading no={nextNo()}>Klimarisiken am Standort</SectionHeading>
          <WithMargin
            note={
              "Gefährdungsindizes (0–100) je Naturgefahr aus GIS-ImmoRisk. Die Deltas zeigen die Veränderung gegenüber heute für die Zeiträume bis 2050 bzw. 2070+."
            }
          >
            <Table
              head={["Gefahr", "Heute", "Bis 2050", "Bis 2070+"]}
              rows={hazardDeltas(risk.hazards).map((d) => [
                d.gruppe,
                d.present ?? "—",
                <span key="n">
                  {d.near ?? "—"}
                  <Delta value={d.nearDelta} />
                </span>,
                <span key="f">
                  {d.far ?? "—"}
                  <Delta value={d.farDelta} />
                </span>,
              ])}
            />
            {showTables && (
              <div style={{ marginTop: "10px" }}>
                <Table
                  head={["Gefahr", "Kategorie", "Wert (0–100)", "Stufe"]}
                  rows={risk.hazards.map((h) => [
                    h.label,
                    h.category,
                    h.anzeigewert,
                    h.level,
                  ])}
                />
              </div>
            )}
          </WithMargin>
        </section>
      )}

      {/* Datenstand / Quellen (Fussnoten) */}
      {sections.datenstand && (
        <section style={{ marginTop: "18px" }} className="print-avoid-break">
          <SectionHeading no={nextNo()}>
            Datenstand &amp; Quellen (Version {REFERENCE_INFO.version})
          </SectionHeading>
          <Table
            head={["Datenblock", "Quelle", "Stand"]}
            rows={REFERENCE_INFO.sources.map((s) => [s.topic, s.source, s.asOf])}
          />
          <p style={{ margin: "8px 0 0", fontSize: "9.5px", color: CI.muted }}>
            [1] CRREM Global Pathways v2.05 (1,5 °C, Deutschland) · [2] Energieausweis
            gem. GEG · [3] BDEW/Statista-Durchschnittspreise · [4] BEHG-Festpreise,
            ab 2027 EU-ETS2-Szenario · Klimarisiken: GIS-ImmoRisk Naturgefahren.
          </p>
        </section>
      )}

      <p
        style={{
          marginTop: "20px",
          borderTop: `1px solid ${CI.rule}`,
          paddingTop: "8px",
          fontSize: "9px",
          color: CI.muted,
        }}
      >
        Proximum nutzt dokumentierte deutsche Standard-Referenzwerte (Version{" "}
        {REFERENCE_INFO.version}) als Näherungen. Der Report dient der Orientierung
        und ersetzt keine Energieberatung oder amtliche Bewertung.
      </p>
    </div>
  );
}
