"use client";

/**
 * Report-Konfigurator: Popover am PDF-Export-Button. Steuert je Organisation
 * (bzw. je Konto), welche Abschnitte/Angaben im PDF-Report erscheinen.
 */
import * as React from "react";
import { Settings2, Loader2, Lock } from "lucide-react";
import {
  REPORT_SECTIONS,
  REPORT_OPTIONS,
  type ReportConfig,
  type ReportSectionKey,
  type ReportOptionKey,
} from "@/lib/report-config";
import type { UseReportConfigResult } from "@/hooks/use-report-config";
import { Switch } from "@/components/ui/switch";

export function ReportConfigPanel({
  state,
}: {
  state: UseReportConfigResult;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const { config, isOrg, canEdit, saving, update } = state;

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function toggleSection(key: ReportSectionKey) {
    update({
      ...config,
      sections: { ...config.sections, [key]: !config.sections[key] },
    });
  }

  function toggleOption(key: ReportOptionKey) {
    update({
      ...config,
      options: { ...config.options, [key]: !config.options[key] },
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Report konfigurieren"
        aria-label="Report konfigurieren"
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-2.5 text-sm font-medium transition-colors hover:bg-accent"
      >
        <Settings2 className="h-4 w-4" />
        Report
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-30 w-80 rounded-xl border bg-popover p-4 shadow-lg">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-semibold">PDF-Report konfigurieren</span>
            {saving && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            {isOrg
              ? "Gilt für alle Reports Ihrer Organisation."
              : "Gilt für alle Reports Ihres Kontos."}
            {!canEdit && (
              <span className="mt-1 flex items-center gap-1 text-[var(--warning)]">
                <Lock className="h-3 w-3" /> Nur Organisations-Admins können
                Änderungen speichern.
              </span>
            )}
          </p>

          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Abschnitte
          </div>
          <div className="space-y-2">
            {(Object.keys(REPORT_SECTIONS) as ReportSectionKey[]).map((key) => (
              <label
                key={key}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span>{REPORT_SECTIONS[key]}</span>
                <Switch
                  checked={config.sections[key]}
                  onCheckedChange={() => canEdit && toggleSection(key)}
                  disabled={!canEdit}
                />
              </label>
            ))}
          </div>

          <div className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Angaben
          </div>
          <div className="space-y-2">
            {(Object.keys(REPORT_OPTIONS) as ReportOptionKey[]).map((key) => (
              <label
                key={key}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span>{REPORT_OPTIONS[key]}</span>
                <Switch
                  checked={config.options[key]}
                  onCheckedChange={() => canEdit && toggleOption(key)}
                  disabled={!canEdit}
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
