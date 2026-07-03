"use client";

import { RENOVATION_MEASURES, type RenovationMeasure } from "@/lib/data/reference";
import type { InvestmentSummary } from "@/lib/engine/renovation";
import { Switch } from "@/components/ui/switch";
import { formatEur, formatNumber } from "@/lib/utils";
import { Wallet, PiggyBank, Timer } from "lucide-react";

interface Props {
  selected: string[];
  onToggle: (id: string) => void;
  investment: InvestmentSummary;
  annualSavingsEur: number | null;
  paybackYears: number | null;
}

const categories: RenovationMeasure["category"][] = [
  "Gebäudehülle",
  "Anlagentechnik",
  "Erneuerbare Energien",
];

export function Simulator({
  selected,
  onToggle,
  investment,
  annualSavingsEur,
  paybackYears,
}: Props) {
  const hasSelection = selected.length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        {categories.map((cat) => (
          <div key={cat}>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {cat}
            </h4>
            <div className="space-y-2">
              {RENOVATION_MEASURES.filter((m) => m.category === cat).map((m) => {
                const active = selected.includes(m.id);
                return (
                  <div
                    key={m.id}
                    className={`flex items-start justify-between gap-4 rounded-lg border p-3 transition-colors ${
                      active ? "border-primary/50 bg-accent/40" : "border-border"
                    }`}
                  >
                    <div>
                      <div className="text-sm font-medium">{m.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {m.description}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {formatNumber(m.costPerM2)} €/m²
                        {m.subsidyRate > 0 &&
                          ` · ${Math.round(m.subsidyRate * 100)} % BEG-Förderung`}
                      </div>
                    </div>
                    <Switch checked={active} onCheckedChange={() => onToggle(m.id)} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="h-fit rounded-xl border bg-card p-5 shadow-sm">
        <h4 className="mb-4 font-semibold">Investition & Wirtschaftlichkeit</h4>
        {!hasSelection ? (
          <p className="text-sm text-muted-foreground">
            Wählen Sie Maßnahmen aus, um Kosten, Förderung und Amortisation zu
            berechnen.
          </p>
        ) : (
          <div className="space-y-4">
            <SummaryRow
              icon={<Wallet className="h-4 w-4" />}
              label="Investition (brutto)"
              value={
                investment.totalInvestEur != null
                  ? formatEur(investment.totalInvestEur)
                  : `${formatNumber(investment.investPerM2)} €/m²`
              }
            />
            <SummaryRow
              icon={<PiggyBank className="h-4 w-4" />}
              label="davon BEG-Förderung"
              value={
                investment.totalSubsidyEur != null
                  ? `– ${formatEur(investment.totalSubsidyEur)}`
                  : "–"
              }
              accent="success"
            />
            <div className="border-t pt-3">
              <SummaryRow
                icon={<Wallet className="h-4 w-4" />}
                label="Netto-Investition"
                value={
                  investment.netInvestEur != null
                    ? formatEur(investment.netInvestEur)
                    : `${formatNumber(investment.netPerM2)} €/m²`
                }
                bold
              />
            </div>
            <SummaryRow
              icon={<PiggyBank className="h-4 w-4" />}
              label="Einsparung / Jahr"
              value={
                annualSavingsEur != null ? formatEur(annualSavingsEur) : "–"
              }
              accent="success"
            />
            <SummaryRow
              icon={<Timer className="h-4 w-4" />}
              label="Amortisation"
              value={
                paybackYears != null
                  ? `${formatNumber(paybackYears, 1)} Jahre`
                  : "–"
              }
              bold
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  bold,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bold?: boolean;
  accent?: "success";
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span
        className={`${bold ? "font-semibold" : "font-medium"} ${
          accent === "success" ? "text-[var(--success)]" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
