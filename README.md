# Proximum – ESG-Analyse für Energieausweise

Proximum liest einen deutschen Energieausweis (PDF) per KI-Vision aus und
berechnet daraus deterministisch die wichtigsten ESG-Kennzahlen eines Gebäudes:

- **CO₂-Ausstoß** (t/a und kg/m²·a)
- **CRREM-Stranding** – wann das Gebäude den 1,5-°C-Dekarbonisierungspfad überschreitet
- **Energiekosten** je Energieträger
- **CO₂-Abgabe** (BEHG / ab 2027 EU-ETS2) als Projektion bis 2050
- **Klimarisiken** (28 Naturgefahren am Standort)
- **EU-Taxonomie** (vereinfachte Konformitätsprüfung)
- **Fassaden-/WWR-Analyse** – Fenster-zu-Wand-Anteil aus einem Street-View-Bild
  (KI-Vision), sonst Typologie-Fallback

Zusätzlich lassen sich **Sanierungsmaßnahmen** durchspielen (Wärmepumpe, Dämmung,
PV, LED …) und deren Wirkung auf alle Kennzahlen inkl. Kosten, BEG-Förderung und
Amortisation live vergleichen (Nachbau der Kernfunktion von predium).

## Tech-Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Vercel AI SDK** + **Claude (Anthropic) Vision** für die PDF-Extraktion
- **Tailwind CSS v4** + shadcn-artige UI-Komponenten, **Recharts** für Diagramme
- **proj4** für WGS84 → UTM32-Konvertierung (Klimarisiko-API)
- Deterministische **ESG-Engine** (reine TS-Funktionen) in `lib/engine/`

## Setup

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY eintragen
npm run dev                  # http://localhost:3000
```

Ohne API-Key kann die App über „Mit Beispiel-Ausweis testen" (echter
Test-Energieausweis) vollständig ausprobiert werden.

## Fassaden-/WWR-Analyse (Street View)

Für eine Adresse wird ein Fassadenbild geholt und per Vision-KI der
Fenster-zu-Wand-Anteil (WWR) geschätzt. Der WWR verfeinert die Engine
(Transmissionsverluste Wand/Fenster, Fenster-/Fassaden-ROI, Beleuchtung) und
speist den Überhitzungsindikator (WWR × Hitze-Klimarisiko).

Ablauf in `[app/api/facade/route.ts](app/api/facade/route.ts)`:

1. **Metadata-Call (gratis)** an Street View → nur bei `status = OK` wird ein
   Bild geladen (spart alle Nicht-Treffer).
2. **Heading** = Peilung von der echten Kameraposition auf das Gebäude
   (`bearing()` in `lib/geocode.ts`).
3. **Bild (kostenpflichtig, 640×640)** laden.
4. **Vision-Modell** (günstig, `FACADE_MODEL`, Default `claude-haiku-4-5`)
   liefert WWR + Konfidenz + Bildqualität als JSON.
5. **Quality-Gate**: nur `Konfidenz = hoch` und `Fassade = voll` werden als
   Bildwert (`quelle = bild`) übernommen, sonst Fallback auf Typologie.

Kosten/Datenschutz: ~1–2 Cent pro Gebäude; in der Google Cloud Console ein
Tageslimit (QPD) und Budget-Alerts setzen. Ohne `GOOGLE_MAPS_API_KEY` läuft die
App normal weiter (Typologie-Standardwert). Street-View-ToS beachten;
Mapillary ist als lizenzseitig entspanntere Alternative möglich (nicht im MVP).
Der WWR wird pro Session zwischengespeichert (kein Doppelabruf); eine
Cross-Session-Persistenz (z. B. Vercel KV) ist ein optionaler Ausbau.

## Ablauf

1. **Upload** eines Energieausweis-PDFs auf der Startseite.
2. `POST /api/extract` → Claude liest das PDF und füllt das Zod-Schema
   (`lib/schema.ts`, Abbild von `energieausweis_schema_v2.json`).
3. Normalisierung (`engine_mapping`) → einheitliche Engine-Eingabe.
4. `/analyse`: Dashboard mit allen Modulen + Sanierungs-Simulator (Engine läuft
   clientseitig). `POST /api/risk` liefert die Standort-Klimarisiken.

## Datenquellen & Referenzdaten

- **CRREM-Pfade**: `CRREM-Global-Pathways-V2.04.xlsx` → per Build-Skript
  `npm run crrem:extract` nach `lib/data/crrem-de.json` (nur DE-Pfade).
- **Referenzwerte** (`lib/data/reference.ts`): CO₂-Faktoren (GEG/UBA),
  Energiepreise, CO₂-Preis-Pfad (BEHG/EU-ETS2), EU-Taxonomie-Schwellen,
  BEG-Sanierungskatalog, Mapping Gebäudekategorie → CRREM-Nutzungsart.
- **Klimarisiken**: GIS ImmoRisk Naturgefahren („Standortsteckbrief"),
  Geocoding via OpenStreetMap/Nominatim.
- **Fassade/WWR**: Google Street View (Metadata + Static), Vision-Modell (Claude);
  Fallback-WWR aus Typologie (`TYPICAL_WWR` in `lib/data/reference.ts`).

## Projektstruktur

```
app/
  page.tsx                 Landing + Upload
  analyse/page.tsx         Dashboard
  api/extract/route.ts     Claude-Vision-Extraktion
  api/risk/route.ts        Geocoding + UTM + Gefahren-API
  api/facade/route.ts      Street View + Vision (WWR)
components/
  upload-dropzone.tsx
  dashboard/               Charts, Risiko-Panel, Fassaden-Panel, Simulator, Review
  ui/                      Card, Button, Badge, Switch
lib/
  schema.ts                Zod-Schema + Normalisierung
  engine/                  co2, crrem, cost, co2levy, taxonomy, renovation, envelope
  data/                    reference.ts, crrem-de.json
  geocode.ts, risk.ts, facade.ts, overheating.ts, demo.ts, session.ts
scripts/crrem-extract.ts   CRREM-xlsx → JSON
```

## Deployment (Vercel via GitHub)

1. Repository zu GitHub pushen.
2. In Vercel „New Project" → Repository importieren (Next.js wird erkannt).
3. Environment-Variablen in Vercel setzen: `ANTHROPIC_API_KEY` (Pflicht),
   optional `GOOGLE_MAPS_API_KEY` (für die Fassaden-/WWR-Analyse), sonst
   `ANTHROPIC_MODEL` / `FACADE_MODEL`.
4. Deploy. `lib/data/crrem-de.json` ist eingecheckt und muss nicht neu erzeugt
   werden.

## Hinweis / Disclaimer

Alle Referenzwerte sind dokumentierte deutsche Standard-Näherungen und **keine
amtlich verbindlichen Werte**. Die Ergebnisse dienen der Orientierung und
ersetzen keine Energieberatung oder amtliche Bewertung. Insbesondere:

- CRREM V2.04 kennt keine eigene Bildungs-Nutzungsart → Schulen/Kitas werden als
  Büro (OFF) genähert.
- Wohngebäude-Ausweise enthalten meist keinen Haushaltsstrom (Stromlücke).
- Die EU-Taxonomie-Prüfung ist eine vereinfachte Näherung (Top-15%/NZEB).
- Das WWR-/Hüllenmodell (`lib/engine/envelope.ts`) ist eine WWR-sensitive
  Heuristik (kein DIN V 18599). Street View liefert nur die Fassade; Dach/PV aus
  echten Luftbildern ist bewusst nicht Teil dieses Umfangs.
