"use client";

/**
 * Laedt und speichert die Report-Konfiguration des aktiven Scopes
 * (Organisation oder persoenlicher Bereich).
 */
import * as React from "react";
import {
  DEFAULT_REPORT_CONFIG,
  mergeReportConfig,
  type ReportConfig,
} from "@/lib/report-config";

export interface UseReportConfigResult {
  config: ReportConfig;
  /** true = Konfiguration gilt fuer die aktive Organisation. */
  isOrg: boolean;
  /** false = nur lesend (kein Org-Admin). */
  canEdit: boolean;
  loaded: boolean;
  saving: boolean;
  update: (next: ReportConfig) => void;
}

export function useReportConfig(): UseReportConfigResult {
  const [config, setConfig] = React.useState<ReportConfig>(DEFAULT_REPORT_CONFIG);
  const [isOrg, setIsOrg] = React.useState(false);
  const [canEdit, setCanEdit] = React.useState(true);
  const [loaded, setLoaded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/report-settings")
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setConfig(mergeReportConfig(d.config));
        setIsOrg(Boolean(d.isOrg));
        setCanEdit(d.canEdit !== false);
      })
      .catch(() => {
        // Defaults behalten
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = React.useCallback((next: ReportConfig) => {
    setConfig(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(() => {
      fetch("/api/report-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: next }),
      })
        .catch(() => {
          // best effort – lokale Anzeige bleibt korrekt
        })
        .finally(() => setSaving(false));
    }, 600);
  }, []);

  return { config, isOrg, canEdit, loaded, saving, update };
}
