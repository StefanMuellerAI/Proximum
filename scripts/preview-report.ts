/**
 * Visuelle Verifikation des PDF-Reports: rendert die echte PrintReport-
 * Komponente mit dem Demo-Datensatz serverseitig und schreibt eine
 * HTML-Vorschau nach /tmp/proximum-report-preview.html.
 *
 * Aufruf: npx vitest run --config vitest.preview.config.ts
 */
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getDemo } from "@/lib/demo";
import { analyzeBase, analyzeScenario, summarizeInvestment } from "@/lib/engine";
import { computeDnshAdaptation } from "@/lib/engine/taxonomy";
import { overheatingLevel } from "@/lib/overheating";
import { DEFAULT_REPORT_CONFIG } from "@/lib/report-config";
import { PrintReport } from "@/components/dashboard/print-report";

it("rendert den Report als HTML-Vorschau", () => {
  const { normalized: demo } = getDemo();
  const base = analyzeBase(demo);
  const selected = ["waermepumpe", "led", "pv"];
  const scen = analyzeScenario(demo, selected);

  const markup = renderToStaticMarkup(
    React.createElement(PrintReport, {
      building: demo,
      base,
      scen: scen.result,
      hasMeasures: true,
      selected,
      invest: summarizeInvestment(selected, demo.bezugsflaecheM2),
      annualSavingsEur: scen.annualSavingsEur,
      paybackYears: scen.paybackYears,
      risk: null,
      facade: null,
      overheat: overheatingLevel(demo.wwrPercent, null),
      dnsh: computeDnshAdaptation(null),
      footprint: null,
      config: DEFAULT_REPORT_CONFIG,
      orgName: "PROXIMUS Real Estate AG",
    }),
  );

  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<style>
  body { margin: 0; background: #e5e7eb; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }
  .page { width: 794px; margin: 24px auto; background: #fff; padding: 53px; box-shadow: 0 2px 12px rgba(0,0,0,.15); }
  .report-page-footer { display: none; }
</style></head>
<body><div class="page">${markup}</div></body></html>`;
  writeFileSync("/tmp/proximum-report-preview.html", html);
  console.log("Vorschau: /tmp/proximum-report-preview.html");
});
