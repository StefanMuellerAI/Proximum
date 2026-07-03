"use client";

/* eslint-disable @next/next/no-img-element */
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
import { CRREM_TYPE_LABELS, RENOVATION_MEASURES } from "@/lib/data/reference";
import type { RiskResult } from "@/lib/risk";
import type { FacadeResult } from "@/lib/facade";
import type { OverheatingResult } from "@/lib/overheating";
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
}

const CHART_W = 660;
const CHART_H = 220;

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

const th = "border border-gray-400 px-2 py-1 text-left font-semibold";
const td = "border border-gray-400 px-2 py-1";

const imgStyle: CSSProperties = {
  width: "210px",
  height: "150px",
  objectFit: "cover",
  borderRadius: "6px",
  border: "1px solid #cbd5e1",
  display: "block",
};
const capStyle: CSSProperties = {
  fontSize: "10px",
  color: "#64748b",
  textAlign: "center",
  marginTop: "2px",
};

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
}: Props) {
  const co2Value = (r: AnalysisResult) =>
    r.co2.tonnesPerYear != null
      ? `${formatNumber(r.co2.tonnesPerYear, 1)} t/a`
      : `${formatNumber(r.co2.intensityKgM2a, 1)} kg/m²·a`;

  const summaryRows = [
    { label: "CO₂-Ausstoß", ist: co2Value(base), szenario: co2Value(scen) },
    {
      label: "CO₂-Intensität",
      ist: `${formatNumber(base.co2.intensityKgM2a, 1)} kg/m²·a`,
      szenario: `${formatNumber(scen.co2.intensityKgM2a, 1)} kg/m²·a`,
    },
    {
      label: "CRREM-Stranding",
      ist: strandingLabel(base.crrem.strandingYear),
      szenario: strandingLabel(scen.crrem.strandingYear),
    },
    {
      label: "Endenergie",
      ist: `${formatNumber(base.energy.totalKwhM2a, 0)} kWh/m²·a`,
      szenario: `${formatNumber(scen.energy.totalKwhM2a, 0)} kWh/m²·a`,
    },
    {
      label: "Energiekosten",
      ist: base.cost.eurPerYear != null ? `${formatEur(base.cost.eurPerYear)}/a` : "—",
      szenario:
        scen.cost.eurPerYear != null ? `${formatEur(scen.cost.eurPerYear)}/a` : "—",
    },
    {
      label: "CO₂-Abgabe (heute)",
      ist:
        base.levy.eurPerYearBase != null
          ? `${formatEur(base.levy.eurPerYearBase)}/a`
          : "—",
      szenario:
        scen.levy.eurPerYearBase != null
          ? `${formatEur(scen.levy.eurPerYearBase)}/a`
          : "—",
    },
    {
      label: "EU-Taxonomie",
      ist: base.taxonomy.aligned ? "konform" : "nicht konform",
      szenario: scen.taxonomy.aligned ? "konform" : "nicht konform",
    },
  ];

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

  const axisTick = { fontSize: 10, fill: "#334155" };

  return (
    <div className="text-black">
      {/* Deckblatt */}
      <section className="mb-6 print-avoid-break">
        <div className="text-xs uppercase tracking-wide text-gray-500">
          Proximum · ESG-Analyse für Immobilien
        </div>
        <h1 className="mt-1 text-2xl font-bold">ESG-Report Energieausweis</h1>
        <div className="mt-2 text-sm">{building.adresse ?? "Unbekannte Adresse"}</div>
        <div className="mt-1 text-xs text-gray-600">
          Erstellt am {new Date().toLocaleDateString("de-DE")} · CRREM-Szenario 1,5 °C
        </div>

        <table className="mt-4 w-full border-collapse text-sm">
          <tbody>
            <tr>
              <td className={td}>Nutzung / Kategorie</td>
              <td className={td}>{building.hauptnutzung ?? "—"}</td>
              <td className={td}>Gebäudetyp</td>
              <td className={td}>{building.gebaeudetyp}</td>
            </tr>
            <tr>
              <td className={td}>CRREM-Nutzungsart</td>
              <td className={td}>
                {building.crremType} – {CRREM_TYPE_LABELS[building.crremType]}
              </td>
              <td className={td}>Ausweistyp</td>
              <td className={td}>{building.ausweistyp}</td>
            </tr>
            <tr>
              <td className={td}>Baujahr</td>
              <td className={td}>{building.baujahr ?? "—"}</td>
              <td className={td}>Bezugsfläche</td>
              <td className={td}>
                {building.bezugsflaecheM2 != null
                  ? `${formatNumber(building.bezugsflaecheM2)} m²`
                  : "—"}
              </td>
            </tr>
            <tr>
              <td className={td}>Fenster-zu-Wand-Anteil</td>
              <td className={td}>
                {Math.round(building.wwrPercent)}% ({building.wwrSource})
              </td>
              <td className={td}>Überhitzungsrisiko</td>
              <td className={td}>{overheat.level}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Executive Summary */}
      <section className="mb-6 print-avoid-break">
        <h2 className="mb-2 text-lg font-semibold">Zusammenfassung</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={th}>Kennzahl</th>
              <th className={th}>Ist-Zustand</th>
              <th className={th}>Nach Sanierung</th>
            </tr>
          </thead>
          <tbody>
            {summaryRows.map((r) => (
              <tr key={r.label}>
                <td className={td}>{r.label}</td>
                <td className={td}>{r.ist}</td>
                <td className={td}>{hasMeasures ? r.szenario : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!hasMeasures && (
          <p className="mt-1 text-xs text-gray-600">
            Keine Sanierungsmaßnahmen ausgewählt – Spalte „Nach Sanierung" ohne Werte.
          </p>
        )}
      </section>

      {/* CRREM-Kurve + Tabelle */}
      <section className="mb-6 print-avoid-break">
        <h2 className="mb-2 text-lg font-semibold">
          CRREM-Pfad vs. Gebäude (kg CO₂e/m²·a)
        </h2>
        <LineChart
          width={CHART_W}
          height={CHART_H}
          data={crremChartData}
          margin={{ top: 8, right: 16, bottom: 4, left: -8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="year" tick={axisTick} interval={4} />
          <YAxis tick={axisTick} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="pfad" name="CRREM-Zielpfad (1,5 °C)" stroke="#64748b" strokeDasharray="5 4" dot={false} strokeWidth={2} isAnimationActive={false} />
          <Line type="monotone" dataKey="ist" name="Gebäude (Ist)" stroke="#dc2626" dot={false} strokeWidth={2.5} isAnimationActive={false} />
          {hasMeasures && (
            <Line type="monotone" dataKey="szenario" name="Nach Sanierung" stroke="#059669" dot={false} strokeWidth={2.5} isAnimationActive={false} />
          )}
        </LineChart>
        <table className="mt-2 w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={th}>Jahr</th>
              <th className={th}>Zielpfad</th>
              <th className={th}>Gebäude (Ist)</th>
              <th className={th}>Nach Sanierung</th>
            </tr>
          </thead>
          <tbody>
            {crremRows.map((p) => (
              <tr key={p.year}>
                <td className={td}>{p.year}</td>
                <td className={td}>{formatNumber(p.pfad, 1)}</td>
                <td className={td}>{formatNumber(p.gebaeude, 1)}</td>
                <td className={td}>
                  {hasMeasures ? formatNumber(scenCrremByYear.get(p.year) ?? 0, 1) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* CO2-Abgabe-Kurve + Tabelle */}
      <section className="mb-6 print-avoid-break">
        <h2 className="mb-2 text-lg font-semibold">CO₂-Abgabe-Projektion (€/a)</h2>
        <AreaChart
          width={CHART_W}
          height={CHART_H}
          data={levyChartData}
          margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
        >
          <defs>
            <linearGradient id="pIst" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#dc2626" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#dc2626" stopOpacity={0.03} />
            </linearGradient>
            <linearGradient id="pScen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#059669" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#059669" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="year" tick={axisTick} interval={4} />
          <YAxis
            tick={axisTick}
            tickFormatter={(v) => {
              const n = Number(v);
              return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area type="monotone" dataKey="ist" name="CO₂-Abgabe (Ist)" stroke="#dc2626" fill="url(#pIst)" strokeWidth={2} isAnimationActive={false} />
          {hasMeasures && (
            <Area type="monotone" dataKey="szenario" name="Nach Sanierung" stroke="#059669" fill="url(#pScen)" strokeWidth={2} isAnimationActive={false} />
          )}
        </AreaChart>
        <table className="mt-2 w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={th}>Jahr</th>
              <th className={th}>CO₂-Preis (€/t)</th>
              <th className={th}>Abgabe Ist</th>
              <th className={th}>Nach Sanierung</th>
            </tr>
          </thead>
          <tbody>
            {levyRows.map((p) => (
              <tr key={p.year}>
                <td className={td}>{p.year}</td>
                <td className={td}>{formatNumber(p.priceEurPerT)}</td>
                <td className={td}>{p.eurPerYear != null ? formatEur(p.eurPerYear) : "—"}</td>
                <td className={td}>
                  {hasMeasures && scenLevyByYear.get(p.year) != null
                    ? formatEur(scenLevyByYear.get(p.year) as number)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Massnahmen */}
      {hasMeasures && (
        <section className="mb-6 print-avoid-break">
          <h2 className="mb-2 text-lg font-semibold">
            Sanierungsmaßnahmen & Wirtschaftlichkeit
          </h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={th}>Maßnahme</th>
                <th className={th}>Kosten (€/m²)</th>
                <th className={th}>BEG-Förderung</th>
              </tr>
            </thead>
            <tbody>
              {selectedMeasures.map((m) => (
                <tr key={m.id}>
                  <td className={td}>{m.label}</td>
                  <td className={td}>{formatNumber(m.costPerM2)}</td>
                  <td className={td}>{Math.round(m.subsidyRate * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="mt-3 w-full border-collapse text-sm">
            <tbody>
              <tr>
                <td className={td}>Investition (brutto)</td>
                <td className={td}>
                  {invest.totalInvestEur != null
                    ? formatEur(invest.totalInvestEur)
                    : `${formatNumber(invest.investPerM2)} €/m²`}
                </td>
              </tr>
              <tr>
                <td className={td}>BEG-Förderung</td>
                <td className={td}>
                  {invest.totalSubsidyEur != null ? `– ${formatEur(invest.totalSubsidyEur)}` : "—"}
                </td>
              </tr>
              <tr>
                <td className={td}>Netto-Investition</td>
                <td className={td}>
                  {invest.netInvestEur != null
                    ? formatEur(invest.netInvestEur)
                    : `${formatNumber(invest.netPerM2)} €/m²`}
                </td>
              </tr>
              <tr>
                <td className={td}>Einsparung / Jahr</td>
                <td className={td}>{annualSavingsEur != null ? formatEur(annualSavingsEur) : "—"}</td>
              </tr>
              <tr>
                <td className={td}>Amortisation</td>
                <td className={td}>
                  {paybackYears != null ? `${formatNumber(paybackYears, 1)} Jahre` : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {/* Fassade + Dach/PV */}
      <section className="mb-6 print-avoid-break">
        <h2 className="mb-2 text-lg font-semibold">Gebäudehülle, Fassade & Dach</h2>
        <div className="mb-3 flex items-start gap-3">
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
          {facade?.aerialImageDataUrl && (
            <figure style={{ margin: 0 }}>
              <img
                src={facade.aerialImageDataUrl}
                alt="Luftbild"
                width={210}
                height={150}
                style={imgStyle}
              />
              <figcaption style={capStyle}>
                {facade.aerialSource === "3d" ? "Schrägluftbild (3D)" : "Satellit"}
              </figcaption>
            </figure>
          )}
        </div>
        <p className="text-sm">
          Fenster-zu-Wand-Anteil (WWR):{" "}
          <strong>{Math.round(building.wwrPercent)}%</strong> (Quelle:{" "}
          {building.wwrSource}
          {facade?.source === "bild" && facade.konfidenz
            ? `, Konfidenz ${facade.konfidenz}`
            : ""}
          ). {overheat.note}
        </p>
        <p className="mt-1 text-sm">
          PV-Potenzial: <strong>{Math.round(building.pvYieldKwhPerM2)} kWh/m²·a</strong>{" "}
          (Quelle: {building.pvSource}
          {facade?.pvEignung ? `, Eignung ${facade.pvEignung}` : ""}
          {facade?.dachAusrichtung ? `, Dach ${facade.dachAusrichtung}` : ""}).
        </p>
      </section>

      {/* Klimarisiken (darf ueber Seiten umbrechen) */}
      {risk && (
        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">Klimarisiken am Standort</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={th}>Gefahr</th>
                <th className={th}>Kategorie</th>
                <th className={th}>Wert (0–100)</th>
                <th className={th}>Stufe</th>
              </tr>
            </thead>
            <tbody>
              {risk.hazards.map((h) => (
                <tr key={h.label}>
                  <td className={td}>{h.label}</td>
                  <td className={td}>{h.category}</td>
                  <td className={td}>{h.anzeigewert}</td>
                  <td className={td}>{h.level}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="mt-6 border-t border-gray-400 pt-3 text-[10px] text-gray-600">
        Proximum nutzt dokumentierte deutsche Standard-Referenzwerte (CRREM V2.04,
        GEG-CO₂-Faktoren, BEG-Förderung, BEHG/EU-ETS2) als Näherungen. Der Report
        dient der Orientierung und ersetzt keine Energieberatung oder amtliche
        Bewertung.
      </p>
    </div>
  );
}
