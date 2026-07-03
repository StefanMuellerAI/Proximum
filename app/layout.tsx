import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Proximum – ESG-Analyse für Energieausweise",
  description:
    "Energieausweis hochladen und automatisch CO₂, CRREM-Stranding, Energiekosten, CO₂-Abgabe, EU-Taxonomie und Klimarisiken analysieren – inkl. Sanierungs-Simulator.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
