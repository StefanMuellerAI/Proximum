"use client";

import type { EnergieausweisExtraction, NormalizedBuilding } from "@/lib/schema";

export interface AnalysisPayload {
  extraction: EnergieausweisExtraction;
  normalized: NormalizedBuilding;
}

const KEY = "proximum.analysis";

export function saveAnalysis(payload: AnalysisPayload): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors (e.g. private mode)
  }
}

export function loadAnalysis(): AnalysisPayload | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AnalysisPayload) : null;
  } catch {
    return null;
  }
}

export function clearAnalysis(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
