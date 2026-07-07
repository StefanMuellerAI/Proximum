import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getDemo } from "@/lib/demo";
import { analyzeBase, analyzeScenario, summarizeInvestment } from "@/lib/engine";
import { computeDnshAdaptation } from "@/lib/engine/taxonomy";
import { overheatingLevel } from "@/lib/overheating";
import {
  DEFAULT_REPORT_CONFIG,
  type ReportConfig,
} from "@/lib/report-config";
import { PrintReport } from "@/components/dashboard/print-report";

const { normalized: demo } = getDemo();
const base = analyzeBase(demo);
const scenario = analyzeScenario(demo, ["waermepumpe", "led"]);

function renderReport(config: ReportConfig, orgName: string | null = "PROXIMUS AG") {
  return renderToStaticMarkup(
    React.createElement(PrintReport, {
      building: demo,
      base,
      scen: scenario.result,
      hasMeasures: true,
      selected: ["waermepumpe", "led"],
      invest: summarizeInvestment(["waermepumpe", "led"], demo.bezugsflaecheM2),
      annualSavingsEur: scenario.annualSavingsEur,
      paybackYears: scenario.paybackYears,
      risk: null,
      facade: null,
      overheat: overheatingLevel(demo.wwrPercent, null),
      dnsh: computeDnshAdaptation(null),
      footprint: null,
      config,
      orgName,
    }),
  );
}

function withConfig(patch: {
  sections?: Partial<ReportConfig["sections"]>;
  options?: Partial<ReportConfig["options"]>;
}): ReportConfig {
  return {
    sections: { ...DEFAULT_REPORT_CONFIG.sections, ...patch.sections },
    options: { ...DEFAULT_REPORT_CONFIG.options, ...patch.options },
  };
}

describe("PrintReport (bedingtes Rendering)", () => {
  it("rendert mit Default-Config alle Abschnitte", () => {
    const html = renderReport(DEFAULT_REPORT_CONFIG);
    expect(html).toContain("Kennzahlen im Überblick");
    expect(html).toContain("CRREM-Pfad");
    expect(html).toContain("CO₂-Abgabe-Projektion");
    expect(html).toContain("Sanierungsmaßnahmen");
    expect(html).toContain("EU-Taxonomie");
    expect(html).toContain("Datenstand");
    expect(html).toContain("PROXIMUS AG");
  });

  it("deaktivierte Abschnitte fehlen im Markup", () => {
    const html = renderReport(
      withConfig({ sections: { crrem: false, taxonomie: false } }),
    );
    expect(html).not.toContain("CRREM-Pfad &amp; Misalignment");
    expect(html).not.toContain("EU-Taxonomie (Klimaschutz)");
    expect(html).toContain("CO₂-Abgabe-Projektion");
  });

  it("kostenAnzeigen=false blendet €-Angaben aus", () => {
    const html = renderReport(
      withConfig({ options: { kostenAnzeigen: false } }),
    );
    expect(html).not.toContain("Energiekosten");
    expect(html).not.toContain("Netto-Investition");
  });

  it("detailTabellen=false entfernt die Jahres-Tabellen", () => {
    const html = renderReport(
      withConfig({ options: { detailTabellen: false } }),
    );
    expect(html).not.toContain("Zielpfad");
  });

  it("orgNameImKopf=false blendet den Organisationsnamen aus", () => {
    const html = renderReport(
      withConfig({ options: { orgNameImKopf: false } }),
    );
    expect(html).not.toContain("PROXIMUS AG");
  });

  it("perzentilAnzeigen=false entfernt die Bestands-Einordnung", () => {
    const html = renderReport(
      withConfig({ options: { perzentilAnzeigen: false } }),
    );
    expect(html).not.toContain("nationalen Bestand");
  });

  it("Disclaimer bleibt immer sichtbar", () => {
    const off = Object.fromEntries(
      Object.keys(DEFAULT_REPORT_CONFIG.sections).map((k) => [k, false]),
    ) as ReportConfig["sections"];
    const html = renderReport({ sections: off, options: DEFAULT_REPORT_CONFIG.options });
    expect(html).toContain("ersetzt keine Energieberatung");
  });
});
