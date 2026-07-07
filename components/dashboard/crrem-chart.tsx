"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import type { YearPoint } from "@/lib/engine/types";

export interface RoadmapMarker {
  year: number;
  label: string;
}

interface Props {
  baseSeries: YearPoint[];
  scenarioSeries: YearPoint[];
  strandingBase: number | null;
  strandingScenario: number | null;
  hasMeasures: boolean;
  /** Optionale Sanierungs-Roadmap: Massnahmen-Marker auf der Zeitachse. */
  roadmap?: RoadmapMarker[];
}

export function CrremChart({
  baseSeries,
  scenarioSeries,
  strandingBase,
  strandingScenario,
  hasMeasures,
  roadmap,
}: Props) {
  const data = baseSeries.map((p, i) => ({
    year: p.year,
    pfad: p.pfad,
    ist: p.gebaeude,
    szenario: hasMeasures ? scenarioSeries[i]?.gebaeude : undefined,
  }));

  return (
    <div className="chart-print h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            interval={4}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            label={{
              value: "kg CO₂e/m²·a",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 11, fill: "var(--muted-foreground)" },
            }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value) => [`${Number(value)} kg/m²·a`, ""]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="pfad"
            name="CRREM-Zielpfad (1,5 °C)"
            stroke="#64748b"
            strokeDasharray="5 4"
            dot={false}
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="ist"
            name="Gebäude (Ist)"
            stroke="#dc2626"
            dot={false}
            strokeWidth={2.5}
          />
          {hasMeasures && (
            <Line
              type="monotone"
              dataKey="szenario"
              name="Gebäude (nach Sanierung)"
              stroke="#059669"
              dot={false}
              strokeWidth={2.5}
            />
          )}
          {strandingBase && (
            <ReferenceLine
              x={strandingBase}
              stroke="#dc2626"
              strokeDasharray="2 2"
              label={{
                value: `Stranding ${strandingBase}`,
                fontSize: 10,
                fill: "#dc2626",
                position: "top",
              }}
            />
          )}
          {hasMeasures && strandingScenario && strandingScenario !== strandingBase && (
            <ReferenceLine
              x={strandingScenario}
              stroke="#059669"
              strokeDasharray="2 2"
              label={{
                value: `${strandingScenario}`,
                fontSize: 10,
                fill: "#059669",
                position: "top",
              }}
            />
          )}
          {(roadmap ?? [])
            .filter((m) => data.some((d) => d.year === m.year))
            .map((m, i) => (
              <ReferenceLine
                key={`${m.year}-${m.label}`}
                x={m.year}
                stroke="#2563eb"
                strokeDasharray="4 3"
                label={{
                  value: m.label,
                  fontSize: 9,
                  fill: "#2563eb",
                  position: "insideTopLeft",
                  angle: -90,
                  dy: 12 + (i % 2) * 10,
                }}
              />
            ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
