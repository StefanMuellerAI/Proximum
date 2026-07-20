/**
 * Recompute-DAG (Spez. 2.13-3): expliziter Abhaengigkeitsgraph
 *
 *   Gebaeudezustand (versioniert)
 *     -> thermische Skalierung
 *       -> Status-quo-KPIs
 *         -> Massnahmenplaene
 *           -> Szenario-Aggregate
 *             -> Portfolio-Aggregate
 *   Report-Snapshots haengen an KPIs + Assumption-Set, sind aber
 *   EINGEFROREN (nie automatisch invalidiert, Abnahme 4.9).
 *
 * Jede Kante traegt eine Invalidierungsregel:
 *   - recompute: abhaengiger Knoten wird neu berechnet
 *   - adapt:     abhaengiger Knoten wird angepasst (Prediums "adaptive
 *                Massnahmenplaene": Plaene bleiben, Werte werden neu bewertet)
 *   - delete_with_backup: abhaengiger Knoten wird geloescht, vorher Export
 *                (Prediums "Berechnungskonflikt"-Verhalten)
 *   - none:      eingefrorene Artefakte bleiben unveraendert
 *
 * Der DAG ist die deklarative Grundlage fuer die Job-Queue (2.13-12d);
 * bis dahin nutzen die API-Routen invalidationsFor(), um zu entscheiden,
 * was neu zu berechnen ist.
 */

export type DagNode =
  | "building_state" // normalized + Bauteile/Systeme (versioniert)
  | "thermal_scaling" // Kalibrierung (GAP-2)
  | "status_quo_kpis" // analyzeBase-Ergebnis / building_kpis_yearly
  | "measure_plans" // Massnahmenplaene (Szenario x Gebaeude)
  | "scenario_aggregates" // Szenario-Zeitverlaeufe
  | "portfolio_aggregates" // Portfolio-Aggregation
  | "report_snapshots"; // eingefrorene Reports (Hash-gesichert)

export type InvalidationAction =
  | "recompute"
  | "adapt"
  | "delete_with_backup"
  | "none";

export interface DagEdge {
  from: DagNode;
  to: DagNode;
  action: InvalidationAction;
  note: string;
}

export const RECOMPUTE_DAG: DagEdge[] = [
  {
    from: "building_state",
    to: "thermal_scaling",
    action: "recompute",
    note: "Geaenderte Gebaeudedaten machen die Kalibrierung ungueltig.",
  },
  {
    from: "thermal_scaling",
    to: "status_quo_kpis",
    action: "recompute",
    note: "KPIs basieren auf dem (skalierten) Gebaeudemodell.",
  },
  {
    from: "building_state",
    to: "status_quo_kpis",
    action: "recompute",
    note: "Top-down-KPIs haengen direkt am Ausweis-Zustand.",
  },
  {
    from: "status_quo_kpis",
    to: "measure_plans",
    action: "adapt",
    note: "Adaptive Massnahmenplaene: Plan bleibt, Wirkung wird neu bewertet.",
  },
  {
    from: "building_state",
    to: "measure_plans",
    action: "delete_with_backup",
    note: "Strukturbruch (z. B. Traegerwechsel im Bestand, neue Bauteile): Plan kollidiert -> Excel-Backup, dann loeschen (Berechnungskonflikt).",
  },
  {
    from: "measure_plans",
    to: "scenario_aggregates",
    action: "recompute",
    note: "Szenario-Zeitverlaeufe sind reine Ableitungen der Plaene.",
  },
  {
    from: "status_quo_kpis",
    to: "portfolio_aggregates",
    action: "recompute",
    note: "Portfolio-Aggregate sind flaechengewichtete KPI-Summen.",
  },
  {
    from: "scenario_aggregates",
    to: "portfolio_aggregates",
    action: "recompute",
    note: "Szenario-Kurven fliessen in die Portfolio-Sicht ein.",
  },
  {
    from: "status_quo_kpis",
    to: "report_snapshots",
    action: "none",
    note: "Abgeschlossene Reports sind eingefroren (Assumption-Set + Hash, Abnahme 4.9).",
  },
];

export interface Invalidation {
  node: DagNode;
  action: InvalidationAction;
  note: string;
}

/**
 * Transitive Invalidierungen fuer eine Aenderung an einem Knoten,
 * in topologischer Reihenfolge (Eltern vor Kindern). "none"-Kanten stoppen
 * die Ausbreitung (eingefrorene Artefakte).
 */
export function invalidationsFor(changed: DagNode): Invalidation[] {
  const result: Invalidation[] = [];
  const visited = new Set<DagNode>([changed]);
  let frontier: DagNode[] = [changed];

  while (frontier.length > 0) {
    const next: DagNode[] = [];
    for (const node of frontier) {
      for (const edge of RECOMPUTE_DAG) {
        if (edge.from !== node) continue;
        if (edge.action === "none") continue;
        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          next.push(edge.to);
        }
        // Strengste Aktion gewinnt, wenn mehrere Kanten denselben Knoten treffen
        const existing = result.find((r) => r.node === edge.to);
        if (!existing) {
          result.push({ node: edge.to, action: edge.action, note: edge.note });
        } else if (
          severity(edge.action) > severity(existing.action)
        ) {
          existing.action = edge.action;
          existing.note = edge.note;
        }
      }
    }
    frontier = next;
  }
  return result;
}

function severity(action: InvalidationAction): number {
  switch (action) {
    case "none":
      return 0;
    case "adapt":
      return 1;
    case "recompute":
      return 2;
    case "delete_with_backup":
      return 3;
  }
}
