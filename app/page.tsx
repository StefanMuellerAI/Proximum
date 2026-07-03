import {
  Leaf,
  Gauge,
  TrendingDown,
  Euro,
  CloudRain,
  ShieldCheck,
} from "lucide-react";
import { UploadDropzone } from "@/components/upload-dropzone";

const features = [
  {
    icon: Gauge,
    title: "CO₂ & Kennwerte",
    text: "Endenergie, Fläche und Energieträger werden erkannt und der CO₂-Ausstoß berechnet.",
  },
  {
    icon: TrendingDown,
    title: "CRREM-Stranding",
    text: "Wann überschreitet das Gebäude den 1,5-°C-Dekarbonisierungspfad?",
  },
  {
    icon: Euro,
    title: "Energiekosten",
    text: "Jährliche Energiekosten je Energieträger auf Basis aktueller Preise.",
  },
  {
    icon: Leaf,
    title: "CO₂-Abgabe",
    text: "Projektion der CO₂-Bepreisung (BEHG / EU-ETS2) bis 2050.",
  },
  {
    icon: CloudRain,
    title: "Klimarisiken",
    text: "28 Naturgefahren (Hitze, Sturm, Starkregen …) für den Standort.",
  },
  {
    icon: ShieldCheck,
    title: "EU-Taxonomie",
    text: "Prüfung der Taxonomiekonformität des Gebäudebetriebs.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen">
      <header className="border-b bg-card/50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Leaf className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">Proximum</span>
          </div>
          <span className="text-sm text-muted-foreground">
            ESG-Analyse für Immobilien
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 pt-16 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-accent/40 px-3 py-1 text-xs font-medium text-accent-foreground">
          <Sparkle /> Ein Energieausweis genügt
        </div>
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          Vom Energieausweis zur vollständigen ESG-Analyse
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-muted-foreground">
          Laden Sie einen Energieausweis hoch. Proximum liest die Kennwerte aus
          und berechnet CO₂-Ausstoß, CRREM-Stranding, Energiekosten, CO₂-Abgabe
          und Klimarisiken – inklusive Sanierungs-Simulator.
        </p>
      </section>

      <section className="mx-auto mt-10 max-w-2xl px-6">
        <UploadDropzone />
      </section>

      <section className="mx-auto mt-20 max-w-6xl px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border bg-card p-5 shadow-sm"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto mt-20 max-w-6xl px-6 pb-10">
        <p className="border-t pt-6 text-xs text-muted-foreground">
          Hinweis: Proximum nutzt dokumentierte deutsche Standard-Referenzwerte
          (CO₂-Faktoren, Preise, BEG-Förderung, CRREM-Pfade V2.04) als
          Näherungen. Die Ergebnisse dienen der Orientierung und ersetzen keine
          Energieberatung oder amtliche Bewertung.
        </p>
      </footer>
    </main>
  );
}

function Sparkle() {
  return <Leaf className="h-3.5 w-3.5" />;
}
