"use client";

import type { NormalizedBuilding } from "@/lib/schema";
import {
  CARRIERS,
  CRREM_TYPE_LABELS,
  type CarrierKey,
  type CrremType,
} from "@/lib/data/reference";

interface Props {
  building: NormalizedBuilding;
  onPatch: (patch: Partial<NormalizedBuilding>) => void;
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

const inputCls =
  "h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ReviewPanel({ building, onPatch }: Props) {
  const num = (v: string): number => {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };
  const numOrNull = (v: string): number | null => {
    if (v.trim() === "") return null;
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Adresse">
        <input
          className={inputCls}
          value={building.adresse ?? ""}
          onChange={(e) => onPatch({ adresse: e.target.value })}
        />
      </Field>

      <Field label="CRREM-Nutzungsart" hint={building.crremApproximated ? "näherungsweise zugeordnet" : undefined}>
        <select
          className={inputCls}
          value={building.crremType}
          onChange={(e) =>
            onPatch({ crremType: e.target.value as CrremType, crremApproximated: false })
          }
        >
          {(Object.keys(CRREM_TYPE_LABELS) as CrremType[]).map((k) => (
            <option key={k} value={k}>
              {k} – {CRREM_TYPE_LABELS[k]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Bezugsfläche (m²)">
        <input
          className={inputCls}
          type="number"
          value={building.bezugsflaecheM2 ?? ""}
          onChange={(e) => onPatch({ bezugsflaecheM2: numOrNull(e.target.value) })}
        />
      </Field>

      <Field label="Endenergie Wärme (kWh/m²·a)">
        <input
          className={inputCls}
          type="number"
          value={building.heatKwhM2a}
          onChange={(e) => onPatch({ heatKwhM2a: num(e.target.value) })}
        />
      </Field>

      <Field label="Endenergie Strom (kWh/m²·a)">
        <input
          className={inputCls}
          type="number"
          value={building.electricityKwhM2a}
          onChange={(e) => onPatch({ electricityKwhM2a: num(e.target.value) })}
        />
      </Field>

      <Field label="Haupt-Energieträger Wärme">
        <select
          className={inputCls}
          value={building.heatCarrier}
          onChange={(e) =>
            onPatch({
              heatCarrier: e.target.value as CarrierKey,
              heatCarrierLabel: CARRIERS[e.target.value as CarrierKey].label,
            })
          }
        >
          {(Object.keys(CARRIERS) as CarrierKey[]).map((k) => (
            <option key={k} value={k}>
              {CARRIERS[k].label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Primärenergie (kWh/m²·a)">
        <input
          className={inputCls}
          type="number"
          value={building.primaryKwhM2a ?? ""}
          onChange={(e) => onPatch({ primaryKwhM2a: numOrNull(e.target.value) })}
        />
      </Field>

      <Field label="THG-Ausweiswert (kg CO₂e/m²·a)" hint="leer = aus Trägern berechnen">
        <input
          className={inputCls}
          type="number"
          value={building.thgKgM2a ?? ""}
          onChange={(e) => onPatch({ thgKgM2a: numOrNull(e.target.value) })}
        />
      </Field>

      <Field label="Baujahr">
        <input
          className={inputCls}
          type="number"
          value={building.baujahr ?? ""}
          onChange={(e) => onPatch({ baujahr: numOrNull(e.target.value) })}
        />
      </Field>

      <Field label="Effizienzklasse (WG)">
        <input
          className={inputCls}
          value={building.epcClass ?? ""}
          placeholder="z. B. C (nur Wohngebäude)"
          onChange={(e) =>
            onPatch({ epcClass: e.target.value.trim() === "" ? null : e.target.value })
          }
        />
      </Field>

      <Field label="Fenster-zu-Wand-Anteil (%)" hint={`Quelle: ${building.wwrSource}`}>
        <input
          className={inputCls}
          type="number"
          value={Math.round(building.wwrPercent)}
          onChange={(e) =>
            onPatch({ wwrPercent: num(e.target.value), wwrSource: "manuell" })
          }
        />
      </Field>
    </div>
  );
}
