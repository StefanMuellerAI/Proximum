import Link from "next/link";
import {
  Leaf,
  Gauge,
  TrendingDown,
  Euro,
  CloudRain,
  ShieldCheck,
  LayoutGrid,
  Users,
  LogIn,
} from "lucide-react";
import { OrganizationSwitcher, SignInButton, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/auth";
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

export default async function Home() {
  const { userId } = await auth();
  const isAdmin = userId ? Boolean(await requireAdmin()) : false;

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
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              ESG-Analyse für Immobilien
            </span>
            {userId ? (
              <>
                <Link
                  href="/portfolio"
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm font-medium transition-colors hover:bg-accent"
                >
                  <LayoutGrid className="h-4 w-4" />
                  Portfolio
                </Link>
                {isAdmin && (
                  <Link
                    href="/admin"
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm font-medium transition-colors hover:bg-accent"
                  >
                    <Users className="h-4 w-4" />
                    Admin
                  </Link>
                )}
                <OrganizationSwitcher />
                <UserButton />
              </>
            ) : (
              <SignInButton mode="modal">
                <button className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
                  <LogIn className="h-4 w-4" />
                  Anmelden
                </button>
              </SignInButton>
            )}
          </div>
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
        {userId ? (
          <UploadDropzone />
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed p-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <LogIn className="h-8 w-8" />
            </div>
            <div>
              <p className="text-lg font-semibold">Anmeldung erforderlich</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Melden Sie sich an, um Energieausweise hochzuladen und Ihr
                Portfolio zu verwalten. Zugänge werden vom Administrator vergeben.
              </p>
            </div>
            <SignInButton mode="modal">
              <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
                <LogIn className="h-4 w-4" />
                Jetzt anmelden
              </button>
            </SignInButton>
          </div>
        )}
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
          (CO₂-Faktoren, Preise, BEG-Förderung, CRREM-Pfade v2.05) als
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
