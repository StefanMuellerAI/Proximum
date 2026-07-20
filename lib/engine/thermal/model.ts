/**
 * Thermisches Gebaeudemodell (GAP-2, Spez. 2.1):
 * EN ISO 13790 Heizperiodenbilanz (saisonale Methode) + EN 15316 Level B.
 *
 *   Q_final = (Q_H,nd - eta x Q_rec + Q_loss) x e
 *   Q_H,nd  = Q_ht - eta x Q_gn
 *   Q_ht    = Q_tr (Transmission) + Q_ve (Lueftung)
 *   Q_gn    = Q_sol (solar) + Q_int (intern)
 *
 * Alle Q-Groessen in kWh/(m2 EBF * a). Die Bauteilflaechen kommen aus den
 * building_components-Entitaeten oder werden aus EBF + Geometrie-Heuristik
 * + WWR (Vision, PLUS-2) abgeleitet - das ersetzt Prediums
 * TABULA-Fensterverteilungsannahme.
 */
import {
  uValue,
  type ComponentType,
  type Layer,
} from "@/lib/engine/thermal/u-value";
import {
  ageClassDefaults,
  EXPENDITURE_FACTORS,
  DEFAULT_BAUJAHR_WG,
  DEFAULT_BAUJAHR_NWG,
} from "@/lib/engine/thermal/tabula";

// ---------------------------------------------------------------------------
// Modellstruktur
// ---------------------------------------------------------------------------

export interface ThermalComponent {
  type: ComponentType;
  /** Flaeche in m2. */
  areaM2: number;
  /** Grundkonstruktion (opak). */
  base?: Layer;
  /** Daemmschicht (ersetzt Bestand bei Sanierung). */
  insulation?: Layer | null;
  /** Fenster/Tuer: direkter U-Wert. */
  directU?: number;
  /** Temperatur-Korrekturfaktor (0..1) fuer Bauteile an unbeheizt/Erdreich. */
  bFactor: number;
}

export interface ThermalParams {
  /** Waermebruecken-Zuschlag Delta-U (W/m2K auf die Huellflaeche). */
  thermalBridgeDeltaU: number;
  /** Infiltrations-Luftwechselrate n_inf (1/h). */
  infiltrationAch: number;
  /** Heiztage pro Jahr. */
  heatingDays: number;
  /** Innentemperatur (Grad C). */
  indoorTempC: number;
  /** Mittlere Aussentemperatur der Heizperiode (Grad C). */
  outdoorTempC: number;
  /** Verteil-/Speicherverluste als Anteil von Q_H,nd + WW (0..1). */
  distributionLossShare: number;
  /** Erzeuger-Aufwandszahl e (gewichtet bei Mischsystemen). */
  expenditureFactor: number;
  /** Nutzungsgrad der Waermegewinne eta (0..1). */
  gainUtilization: number;
  /** Warmwasserbedarf (kWh/m2a Nutzenergie). */
  hotWaterKwhM2a: number;
  /** Interne Gewinne (kWh/m2a). */
  internalGainsKwhM2a: number;
  /** Solare Gewinne je m2 Fensterflaeche und Heizperiode (kWh/m2). */
  solarGainPerWindowM2: number;
  /** Waermerueckgewinnung Q_rec (kWh/m2a). */
  heatRecoveryKwhM2a: number;
}

export interface ThermalModel {
  ebfM2: number;
  /** Beheiztes Volumen (m3). */
  volumeM3: number;
  components: ThermalComponent[];
  params: ThermalParams;
}

// ---------------------------------------------------------------------------
// Modell-Aufbau (Geometrie-Heuristik + TABULA-Anreicherung)
// ---------------------------------------------------------------------------

export interface BuildModelInput {
  gebaeudetyp: "Wohngebäude" | "Nichtwohngebäude";
  baujahr: number | null;
  bezugsflaecheM2: number;
  /** Fenster-zu-Wand-Anteil in Prozent (Vision/Typologie, PLUS-2). */
  wwrPercent: number;
  /** Haupt-Waermetraeger (CarrierKey) fuer die Aufwandszahl. */
  heatCarrier: string;
  /** Geschosszahl (Default: 3 WG, 2 NWG). */
  storeys?: number;
  storeyHeightM?: number;
}

/**
 * Baut das Default-Modell aus EBF, Baualtersklasse (TABULA) und WWR.
 * Geometrie-Heuristik: quadratische Grundflaeche, EBF / Geschosse.
 */
export function buildThermalModel(input: BuildModelInput): ThermalModel {
  const baujahr =
    input.baujahr ??
    (input.gebaeudetyp === "Wohngebäude" ? DEFAULT_BAUJAHR_WG : DEFAULT_BAUJAHR_NWG);
  const age = ageClassDefaults(baujahr);
  const storeys = input.storeys ?? (input.gebaeudetyp === "Wohngebäude" ? 3 : 2);
  const storeyHeight = input.storeyHeightM ?? 2.5;

  const footprintM2 = input.bezugsflaecheM2 / storeys;
  const sideM = Math.sqrt(Math.max(footprintM2, 1));
  const perimeterM = 4 * sideM;
  const heightM = storeys * storeyHeight;
  const facadeGrossM2 = perimeterM * heightM;
  const windowM2 = facadeGrossM2 * (input.wwrPercent / 100);
  const wallM2 = facadeGrossM2 - windowM2;

  const components: ThermalComponent[] = [
    { type: "wand", areaM2: wallM2, base: age.wall, insulation: null, bFactor: 1 },
    { type: "fenster", areaM2: windowM2, directU: age.windowU, bFactor: 1 },
    { type: "dach", areaM2: footprintM2, base: age.roof, insulation: null, bFactor: 1 },
    {
      type: "kellerdecke",
      areaM2: footprintM2,
      base: age.floor,
      insulation: null,
      bFactor: 0.6, // an unbeheizten Keller/Erdreich
    },
  ];

  const isWG = input.gebaeudetyp === "Wohngebäude";
  const params: ThermalParams = {
    thermalBridgeDeltaU: 0.1, // Pauschalzuschlag (DIN 4108 Beiblatt 2)
    infiltrationAch: age.infiltrationAch,
    heatingDays: 222,
    indoorTempC: 20,
    outdoorTempC: 5.5, // Mittel der Heizperiode DE
    distributionLossShare: 0.12,
    expenditureFactor: EXPENDITURE_FACTORS[input.heatCarrier] ?? 1.1,
    gainUtilization: 0.95,
    hotWaterKwhM2a: isWG ? 12.5 : 6,
    internalGainsKwhM2a: isWG ? 22 : 30,
    solarGainPerWindowM2: 180, // g~0,6, Orientierungsmix, Verschattung
    heatRecoveryKwhM2a: 0,
  };

  return {
    ebfM2: input.bezugsflaecheM2,
    volumeM3: input.bezugsflaecheM2 * storeyHeight,
    components,
    params,
  };
}

// ---------------------------------------------------------------------------
// Heizperiodenbilanz
// ---------------------------------------------------------------------------

/** U-Wert eines Bauteils im Modell (direkt oder aus Schichten). */
export function componentU(c: ThermalComponent): number {
  if (c.directU != null) return c.directU;
  if (!c.base) return 0;
  return uValue(c.type, c.base, c.insulation ?? null);
}

export interface BalanceResult {
  /** Endenergie Heizung + WW (kWh/m2a) - vergleichbar mit dem Ausweiswert. */
  qFinalKwhM2a: number;
  qTransmissionKwhM2a: number;
  qVentilationKwhM2a: number;
  qSolarKwhM2a: number;
  qInternalKwhM2a: number;
  qHndKwhM2a: number;
}

/** Heizperiodenbilanz nach EN ISO 13790 (saisonale Methode). */
export function heatBalance(model: ThermalModel): BalanceResult {
  const p = model.params;
  // Gradtagstunden der Heizperiode (kKh/a)
  const degreeHoursKKh =
    (p.heatingDays * 24 * (p.indoorTempC - p.outdoorTempC)) / 1000;

  // Transmission: H_tr = Sum(U_i x A_i x b_i) + DeltaU_wb x A_huell (W/K)
  let htr = 0;
  let envelopeArea = 0;
  for (const c of model.components) {
    htr += componentU(c) * c.areaM2 * c.bFactor;
    envelopeArea += c.areaM2;
  }
  htr += p.thermalBridgeDeltaU * envelopeArea;

  // Lueftung: H_ve = 0,34 Wh/(m3K) x n x V (W/K)
  const hve = 0.34 * p.infiltrationAch * model.volumeM3;

  const qTr = (htr * degreeHoursKKh) / model.ebfM2; // kWh/m2a
  const qVe = (hve * degreeHoursKKh) / model.ebfM2;

  // Gewinne
  const windowArea = model.components
    .filter((c) => c.type === "fenster")
    .reduce((sum, c) => sum + c.areaM2, 0);
  const qSol = (windowArea * p.solarGainPerWindowM2) / model.ebfM2;
  const qInt = p.internalGainsKwhM2a;

  const qHt = qTr + qVe;
  const qGn = qSol + qInt;
  const qHnd = Math.max(0, qHt - p.gainUtilization * qGn);

  // Verluste der Technik + WW; Q_rec mindert den Bedarf
  const qLoss = (qHnd + p.hotWaterKwhM2a) * p.distributionLossShare;
  const qFinal =
    (qHnd +
      p.hotWaterKwhM2a -
      p.gainUtilization * p.heatRecoveryKwhM2a +
      qLoss) *
    p.expenditureFactor;

  return {
    qFinalKwhM2a: qFinal,
    qTransmissionKwhM2a: qTr,
    qVentilationKwhM2a: qVe,
    qSolarKwhM2a: qSol,
    qInternalKwhM2a: qInt,
    qHndKwhM2a: qHnd,
  };
}

// ---------------------------------------------------------------------------
// Thermische Skalierung (Kalibrierung, Spez. 2.1 + 2.13-11)
// ---------------------------------------------------------------------------

/** Fachlich akzeptierte Wertebereiche der Kalibrier-Parameter. */
export const CALIBRATION_RANGES: {
  param: keyof ThermalParams;
  min: number;
  max: number;
  label: string;
}[] = [
  { param: "thermalBridgeDeltaU", min: 0.0, max: 0.25, label: "Wärmebrücken-Zuschlag ΔU (W/m²K)" },
  { param: "infiltrationAch", min: 0.2, max: 1.2, label: "Infiltrations-Luftwechselrate (1/h)" },
  { param: "heatingDays", min: 180, max: 260, label: "Heiztage (d/a)" },
  { param: "indoorTempC", min: 18, max: 22, label: "Innentemperatur (°C)" },
  // Die letzten beiden nur, wenn die ersten vier nicht reichen (Predium-Reihenfolge)
  { param: "distributionLossShare", min: 0.05, max: 0.25, label: "Verteilungsverluste (Anteil)" },
  { param: "expenditureFactor", min: 0.25, max: 1.6, label: "Aufwandszahl e" },
];

/** Erfolgskriterium: relative Abweichung < 0,1 % (Spez. 2.1). */
export const CALIBRATION_TOLERANCE = 0.001;

export interface CalibrationStep {
  param: string;
  label: string;
  from: number;
  to: number;
  /** Abweichung nach diesem Schritt (relativ). */
  deviationAfter: number;
}

export interface CalibrationResult {
  success: boolean;
  /** Relative Abweichung zum Ausweiswert nach Kalibrierung. */
  deviation: number;
  /** Kalibriertes Modell (Kopie; Original bleibt unveraendert). */
  model: ThermalModel;
  /**
   * Kalibrierungs-Protokoll (2.13-11): welcher Parameter wurde wie weit
   * verschoben - Kompensationen sichtbar machen statt verstecken
   * (bewusste Differenzierung gegenueber Prediums Blackbox).
   */
  protocol: CalibrationStep[];
}

function relDeviation(model: ThermalModel, targetKwhM2a: number): number {
  const q = heatBalance(model).qFinalKwhM2a;
  return (q - targetKwhM2a) / targetKwhM2a;
}

/**
 * Bisektion: findet den Parameterwert innerhalb [min, max], der die
 * Abweichung minimiert (Q_final ist in jedem Kalibrier-Parameter monoton).
 */
function solveParam(
  model: ThermalModel,
  param: keyof ThermalParams,
  min: number,
  max: number,
  targetKwhM2a: number,
): number {
  const test = (v: number): number => {
    const m: ThermalModel = {
      ...model,
      params: { ...model.params, [param]: v },
    };
    return relDeviation(m, targetKwhM2a);
  };
  const devMin = test(min);
  const devMax = test(max);
  // Ziel liegt ausserhalb des erreichbaren Bereichs -> Randwert
  if (devMin > 0 && devMax > 0) return Math.abs(devMin) < Math.abs(devMax) ? min : max;
  if (devMin < 0 && devMax < 0) return Math.abs(devMin) < Math.abs(devMax) ? min : max;

  let lo = min;
  let hi = max;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const d = test(mid);
    if (Math.abs(d) < CALIBRATION_TOLERANCE / 10) return mid;
    // Q_final ist monoton steigend in allen Kalibrier-Parametern
    if ((test(lo) < 0) === (d < 0)) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Thermische Skalierung: passt die Parameter in der Predium-Reihenfolge an
 * (Waermebruecken -> Infiltration -> Heiztage -> Innentemperatur ->
 * Verteilverluste -> Aufwandszahl), bis der berechnete Endenergiebedarf dem
 * Ausweiswert entspricht. Scheitert die Skalierung (>= 0,1 % Abweichung),
 * ist die Massnahmenplanung fuer das Gebaeude zu sperren.
 */
export function calibrate(
  model: ThermalModel,
  targetKwhM2a: number,
): CalibrationResult {
  const work: ThermalModel = {
    ...model,
    components: model.components.map((c) => ({ ...c })),
    params: { ...model.params },
  };
  const protocol: CalibrationStep[] = [];

  if (targetKwhM2a <= 0) {
    return { success: false, deviation: NaN, model: work, protocol };
  }

  for (const range of CALIBRATION_RANGES) {
    const deviation = relDeviation(work, targetKwhM2a);
    if (Math.abs(deviation) < CALIBRATION_TOLERANCE) break;

    const from = work.params[range.param] as number;
    const to = solveParam(work, range.param, range.min, range.max, targetKwhM2a);
    if (Math.abs(to - from) < 1e-9) continue;

    (work.params[range.param] as number) = to;
    protocol.push({
      param: range.param,
      label: range.label,
      from,
      to,
      deviationAfter: relDeviation(work, targetKwhM2a),
    });
  }

  const deviation = relDeviation(work, targetKwhM2a);
  return {
    success: Math.abs(deviation) < CALIBRATION_TOLERANCE,
    deviation,
    model: work,
    protocol,
  };
}

// ---------------------------------------------------------------------------
// Bauteilscharfe Massnahmenwirkung
// ---------------------------------------------------------------------------

/**
 * Wendet eine Daemm-Massnahme auf ein Bauteil an (neue Daemmung ERSETZT
 * Bestand) bzw. setzt den Fenster-U-Wert und liefert die relative Minderung
 * der Endenergie Heizung + WW - bauteilscharf statt pauschal.
 */
export function measureHeatReduction(
  calibrated: ThermalModel,
  componentType: ComponentType,
  upgrade: { insulation?: Layer; windowU?: number },
): number {
  const before = heatBalance(calibrated).qFinalKwhM2a;
  const after: ThermalModel = {
    ...calibrated,
    components: calibrated.components.map((c) => {
      if (c.type !== componentType) return c;
      if (c.type === "fenster" && upgrade.windowU != null)
        return { ...c, directU: upgrade.windowU };
      if (upgrade.insulation)
        return { ...c, insulation: { ...upgrade.insulation } };
      return c;
    }),
    params: { ...calibrated.params },
  };
  const q = heatBalance(after).qFinalKwhM2a;
  if (before <= 0) return 0;
  return Math.max(0, (before - q) / before);
}

/**
 * Wirkungs-Priorisierung der Huellmassnahmen: Delta-U x Bauteilflaeche
 * (Spez. 2.9) - fuer Vorschlagslisten.
 */
export function componentImpactScore(
  c: ThermalComponent,
  targetU: number,
): number {
  return Math.max(0, componentU(c) - targetU) * c.areaM2;
}
