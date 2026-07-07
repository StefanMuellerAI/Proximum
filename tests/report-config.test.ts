import { describe, expect, it } from "vitest";
import {
  DEFAULT_REPORT_CONFIG,
  mergeReportConfig,
  reportConfigSchema,
  REPORT_SECTIONS,
} from "@/lib/report-config";

describe("mergeReportConfig", () => {
  it("liefert Defaults bei leerem/ungültigem Input", () => {
    expect(mergeReportConfig(null)).toEqual(DEFAULT_REPORT_CONFIG);
    expect(mergeReportConfig(undefined)).toEqual(DEFAULT_REPORT_CONFIG);
    expect(mergeReportConfig("unsinn")).toEqual(DEFAULT_REPORT_CONFIG);
  });

  it("übernimmt gespeicherte Werte und ergänzt fehlende mit Defaults", () => {
    const merged = mergeReportConfig({
      sections: { klimarisiken: false },
      options: { kostenAnzeigen: false },
    });
    expect(merged.sections.klimarisiken).toBe(false);
    expect(merged.sections.crrem).toBe(true);
    expect(merged.options.kostenAnzeigen).toBe(false);
    expect(merged.options.detailTabellen).toBe(true);
  });

  it("verwirft unbekannte Keys und Nicht-Boolean-Werte", () => {
    const merged = mergeReportConfig({
      sections: { klimarisiken: "ja", unbekannt: true },
      options: { fremd: false },
    });
    expect(merged).toEqual(DEFAULT_REPORT_CONFIG);
    expect("unbekannt" in merged.sections).toBe(false);
  });
});

describe("reportConfigSchema", () => {
  it("akzeptiert die Default-Config", () => {
    expect(reportConfigSchema.safeParse(DEFAULT_REPORT_CONFIG).success).toBe(true);
  });

  it("weist unvollständige Configs ab (API nutzt merge davor)", () => {
    expect(
      reportConfigSchema.safeParse({ sections: {}, options: {} }).success,
    ).toBe(false);
  });

  it("deckt alle Sections ab", () => {
    const parsed = reportConfigSchema.parse(DEFAULT_REPORT_CONFIG);
    expect(Object.keys(parsed.sections).sort()).toEqual(
      Object.keys(REPORT_SECTIONS).sort(),
    );
  });
});
