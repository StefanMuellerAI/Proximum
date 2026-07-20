# NUMERICS.md — Verbindliche Numerik-Konvention

Diese Konvention gilt für den gesamten Rechenkern (`lib/engine/`) und alle
darauf aufbauenden Schichten (API, UI, Reports). Sie setzt Abschnitt 2.13-1
und 2.13-10 der Entwickler-Anweisung um. Abweichungen sind nur mit
dokumentierter Begründung zulässig.

## 1. Einheiten

- Gerechnet wird ausschließlich in **SI-Basiseinheiten bzw. den fachlich
  etablierten Bezugseinheiten** — ohne implizite Umrechnung in Zwischenschritten:
  - Energie: kWh bzw. kWh/(m²·a)
  - CO₂: kg bzw. kg CO₂e/(m²·a); Tonnen (t) **nur** an Darstellungs-/
    Preisgrenzen (CO₂-Abgabe: €/t × t)
  - Fläche: m²
  - U-Wert: W/(m²·K); Schichtdicke: m; Wärmeleitfähigkeit λ: W/(m·K)
  - Geld: EUR (netto, sofern nicht explizit „brutto" gekennzeichnet)
- Einheitenwechsel (kg → t: ÷ 1000) passieren genau einmal, an der Stelle,
  an der die Zieleinheit gebraucht wird.

## 2. Rundung

- **Keine Zwischenrundung.** Alle Engine-Funktionen rechnen mit voller
  `number`-Präzision und geben ungerundete Werte zurück.
- Rundung passiert **nur bei Darstellung und Export** (UI-Formatierung,
  Report, Excel). Dafür stehen `formatRound`/`roundTo` aus
  `lib/engine/numerics.ts` bereit.
- Bekannte Alt-Ausnahme: die CRREM-Serie rundet Punktwerte auf 2 Nachkommastellen
  für die Chart-Ausgabe (`crrem.ts`). Neue Module dürfen dieses Muster nicht
  übernehmen; Serien werden ungerundet gehalten und erst im Chart formatiert.
- **Gesetzlich vorgeschriebene Rundung** ist Teil der Fachlogik, nicht der
  Darstellung, und wird explizit implementiert:
  - CO2KostAufG § 5 Abs. 1: Der CO₂-Ausstoß pro m² Wohnfläche wird auf **eine
    Nachkommastelle** gerundet (kaufmännisch), **bevor** die Stufe des
    10-Stufenmodells bestimmt wird → `roundCo2KostAufG()`.

## 3. Grenzwert-Inklusivität (Klassensysteme)

- Ob eine Klassengrenze inklusiv (≤) oder exklusiv (<) ist, ist **ein
  Datenfeld des Klassensystems**, nie Code-Konvention:
  `boundary: "lte" | "lt"` (`lib/engine/numerics.ts`).
  - DE (GEG-Wohngebäude): `lte` — „A+ ≤ 30" heißt 30,0 ist noch A+.
  - AT (OIB): `lt` — „A < 25" heißt 25,0 ist bereits B.
- Klassifizierung erfolgt ausschließlich über `classifyByBands()`; eigene
  `if (value <= x)`-Ketten in Fachmodulen sind verboten.
- Jede Klassengrenze wird beidseitig getestet (Wert ± 0,001) — Property-Tests
  in `tests/engine/numerics.test.ts` (generisch) und je Klassensystem in den
  Effizienzklassen-Tests (Abnahmekriterium 4.10).

## 4. Zeitanteiligkeit und Interpolation (2.13-10)

- **Maßnahmenwirkung:** Eine Maßnahme mit Umsetzungsdatum im Jahr *t* wirkt
  ab dem **Folgejahr** (*t + 1*). Im Umsetzungsjahr gilt der Zustand vor der
  Maßnahme.
- **Exklusion (Verkauf/Rückbau):** Flächengewichte werden **monatsanteilig**
  im Exklusionsjahr reduziert (Auszug Ende März → 3/12 Gewicht im Jahr).
- **Pfad-Interpolation:** Fehlende Jahreswerte in Zeitreihen (CRREM-Pfade,
  Emissionsfaktor-Zeitreihen, Preispfade) werden **linear** interpoliert
  (`interpolateSeries()`); außerhalb des Definitionsbereichs gilt der
  Randwert (konstant fortgeschrieben, keine Extrapolation).

## 5. Faktorwelten (Hygiene-Regel)

Drei Emissionsfaktor-Welten, strikt nach Rechenzweck getrennt (Spez. 2.5):

| Rechenzweck | Faktorquelle |
|---|---|
| CRREM-Stranding, CO₂e-Intensität (CRREM-Modus) | CRREM (Basisjahr 2020, zeitvariabel für Netzträger) |
| Ausweis-Logik, CO₂e-Intensität (GEG-Modus) | GEG Anlage 9 / nationale Verordnung (mit Vorkette) |
| CO₂-Abgabe (BEHG/ETS2) + CO2KostAufG | EBeV (ohne Vorkette) |

Kein Modul darf Faktoren aus einer fremden Welt beziehen. Ein statischer
Audit-Test (`tests/engine/factor-hygiene.test.ts`) erzwingt das.

## 6. Ungültige/fehlende Werte

- Fehlende Eingaben sind `null`, nie `0` und nie `NaN`. Abgeleitete Werte,
  die ohne die Eingabe nicht berechenbar sind, sind ebenfalls `null`
  (Muster: `tonnesPerYear: number | null`).
- Division durch 0 ist vor der Division abzufangen (Ergebnis `null` bzw.
  dokumentierter Sonderwert, z. B. CO₂-Vermeidungskosten „N/A" bei
  0-Einsparung).

## 7. Determinismus

- Engine-Funktionen sind pure Functions: gleiche Inputs ⇒ bit-identische
  Outputs. Kein `Date.now()`/`Math.random()` in Rechenpfaden; das Bezugsjahr
  (`BASE_YEAR`) wird als Parameter durchgereicht bzw. zentral in
  `lib/engine/types.ts` bestimmt.
- Report-Snapshots frieren Eingangsdaten + Annahmen-Set ein; ihr Hash muss
  nach Faktor-/Preisänderungen stabil bleiben (Abnahmekriterium 4.9).
