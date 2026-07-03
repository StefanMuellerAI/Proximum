"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { Co2LevyResult } from "@/lib/engine/types";
import { formatEur } from "@/lib/utils";

interface Props {
  base: Co2LevyResult;
  scenario: Co2LevyResult;
  hasMeasures: boolean;
}

export function LevyChart({ base, scenario, hasMeasures }: Props) {
  const data = base.series.map((p, i) => ({
    year: p.year,
    ist: p.eurPerYear ?? 0,
    szenario: hasMeasures ? scenario.series[i]?.eurPerYear ?? 0 : undefined,
  }));

  return (
    <div className="chart-print h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="levyIst" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#dc2626" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#dc2626" stopOpacity={0.03} />
            </linearGradient>
            <linearGradient id="levyScen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#059669" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#059669" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            interval={4}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(value) => {
              const v = Number(value);
              return v >= 1000 ? `${Math.round(v / 1000)}k` : String(v);
            }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value) => [formatEur(Number(value)), ""]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area
            type="monotone"
            dataKey="ist"
            name="CO₂-Abgabe (Ist)"
            stroke="#dc2626"
            fill="url(#levyIst)"
            strokeWidth={2}
          />
          {hasMeasures && (
            <Area
              type="monotone"
              dataKey="szenario"
              name="nach Sanierung"
              stroke="#059669"
              fill="url(#levyScen)"
              strokeWidth={2}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
