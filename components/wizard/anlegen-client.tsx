"use client";

/**
 * Anlage-Wizard (A6): Multi-Upload -> Pruefen -> Karten-Selektion ->
 * Bestaetigen. Gebaeude entstehen erst im letzten Schritt (Entwurfs-Tabelle
 * building_drafts); die Session ueberlebt Reload/Geraetewechsel.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  FileText,
  Loader2,
  MapPin,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type { EnergieausweisExtraction, NormalizedBuilding } from "@/lib/schema";
import type { FootprintResult } from "@/lib/footprint";
import { isSelected } from "@/lib/footprint";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ReviewPanel } from "@/components/dashboard/review-panel";
import { FootprintSelect } from "@/components/wizard/footprint-select";

interface Draft {
  id: string;
  name: string | null;
  extraction: EnergieausweisExtraction;
  normalized: NormalizedBuilding;
  footprint: FootprintResult | null;
}

interface UploadItem {
  fileName: string;
  status: "wartet" | "liest" | "fertig" | "fehler";
  error?: string;
}

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<Step, string> = {
  1: "Hochladen",
  2: "Prüfen",
  3: "Karte",
  4: "Bestätigen",
};

export function AnlegenClient() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(1);
  const [drafts, setDrafts] = React.useState<Draft[]>([]);
  const [uploads, setUploads] = React.useState<UploadItem[]>([]);
  const [active, setActive] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [euName, setEuName] = React.useState("");
  const [mapLoading, setMapLoading] = React.useState(false);
  const [mapError, setMapError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Offene Entwuerfe wieder aufnehmen (Session-Persistenz)
  React.useEffect(() => {
    fetch("/api/drafts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.drafts?.length) setDrafts(d.drafts);
      })
      .catch(() => {});
  }, []);

  // -------------------------------------------------------------------------
  // Schritt 1: Multi-Upload (sequenzielle Warteschlange, Fehler je Datei)
  // -------------------------------------------------------------------------

  async function handleFiles(files: FileList | File[]) {
    const list = [...files].filter(
      (f) => !f.type || f.type === "application/pdf",
    );
    if (list.length === 0) {
      setError("Bitte PDF-Dateien hochladen.");
      return;
    }
    setError(null);
    setBusy(true);
    setUploads(list.map((f) => ({ fileName: f.name, status: "wartet" })));

    for (let i = 0; i < list.length; i++) {
      setUploads((prev) =>
        prev.map((u, j) => (j === i ? { ...u, status: "liest" } : u)),
      );
      try {
        const form = new FormData();
        form.append("file", list[i]);
        const res = await fetch("/api/extract", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Extraktion fehlgeschlagen.");

        const save = await fetch("/api/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            extraction: data.extraction,
            normalized: data.normalized,
          }),
        });
        const saved = await save.json();
        if (!save.ok) throw new Error(saved.error || "Entwurf konnte nicht gespeichert werden.");

        const draft: Draft = {
          id: saved.draft.id,
          name: data.normalized.adresse ?? list[i].name,
          extraction: data.extraction,
          normalized: data.normalized,
          footprint: null,
        };
        setDrafts((prev) => [...prev, draft]);
        setUploads((prev) =>
          prev.map((u, j) => (j === i ? { ...u, status: "fertig" } : u)),
        );
      } catch (e) {
        setUploads((prev) =>
          prev.map((u, j) =>
            j === i
              ? {
                  ...u,
                  status: "fehler",
                  error: e instanceof Error ? e.message : "Fehler",
                }
              : u,
          ),
        );
      }
    }
    setBusy(false);
  }

  // -------------------------------------------------------------------------
  // Schritt 2: Pruefen (ReviewPanel je Entwurf, Korrekturen -> PATCH)
  // -------------------------------------------------------------------------

  function patchDraft(idx: number, patch: Partial<NormalizedBuilding>) {
    setDrafts((prev) => {
      const next = [...prev];
      const merged = { ...next[idx].normalized, ...patch };
      next[idx] = { ...next[idx], normalized: merged };
      // Persistenz best effort (kein UI-Blocking)
      fetch(`/api/drafts/${next[idx].id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ normalized: merged }),
      }).catch(() => {});
      return next;
    });
  }

  async function removeDraft(idx: number) {
    const d = drafts[idx];
    if (!window.confirm(`Entwurf „${d.name ?? "Unbenannt"}" verwerfen?`)) return;
    await fetch(`/api/drafts/${d.id}`, { method: "DELETE" }).catch(() => {});
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
    setActive((a) => Math.max(0, Math.min(a, drafts.length - 2)));
  }

  // -------------------------------------------------------------------------
  // Schritt 3: Karten-Selektion (Geocode -> Footprint -> Klick-Auswahl)
  // -------------------------------------------------------------------------

  const loadFootprint = React.useCallback(
    async (idx: number) => {
      const d = drafts[idx];
      if (!d || d.footprint || !d.normalized.adresse) return;
      setMapLoading(true);
      setMapError(null);
      try {
        const geo = await fetch("/api/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: d.normalized.adresse }),
        });
        const geoData = await geo.json();
        if (!geo.ok) throw new Error(geoData.error || "Adresse nicht auflösbar.");

        const fp = await fetch("/api/footprint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: geoData.lat, lon: geoData.lon }),
        });
        const fpData = (await fp.json()) as FootprintResult & { error?: string };
        if (!fp.ok) throw new Error(fpData.error || "Grundrisse nicht verfügbar.");

        // Initiale Selektion = erkanntes Hauptgebaeude
        fpData.buildings = fpData.buildings.map((b) => ({
          ...b,
          selected: b.main,
        }));
        setDrafts((prev) => {
          const next = [...prev];
          next[idx] = { ...next[idx], footprint: fpData };
          return next;
        });
        fetch(`/api/drafts/${d.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ footprint: fpData }),
        }).catch(() => {});
      } catch (e) {
        setMapError(e instanceof Error ? e.message : "Karte nicht verfügbar.");
      } finally {
        setMapLoading(false);
      }
    },
    [drafts],
  );

  React.useEffect(() => {
    if (step === 3) loadFootprint(active);
  }, [step, active, loadFootprint]);

  function toggleFootprint(idx: number, buildingIdx: number) {
    setDrafts((prev) => {
      const next = [...prev];
      const fp = next[idx].footprint;
      if (!fp) return prev;
      const buildings = fp.buildings.map((b, i) =>
        i === buildingIdx ? { ...b, selected: !isSelected(b) } : b,
      );
      const updated = { ...fp, buildings };
      next[idx] = { ...next[idx], footprint: updated };
      fetch(`/api/drafts/${next[idx].id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ footprint: updated }),
      }).catch(() => {});
      return next;
    });
  }

  // -------------------------------------------------------------------------
  // Schritt 4: Bestaetigen (Commit -> buildings)
  // -------------------------------------------------------------------------

  async function commit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/drafts/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftIds: drafts.map((d) => d.id),
          economicUnitName: euName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Anlegen fehlgeschlagen.");
      router.push("/portfolio");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Anlegen fehlgeschlagen.");
      setBusy(false);
    }
  }

  const activeDraft = drafts[active] ?? null;

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Gebäude anlegen</h1>
        <Link href="/portfolio" className="text-sm text-muted-foreground hover:underline">
          Zum Portfolio
        </Link>
      </div>

      {/* Schritt-Anzeige */}
      <ol className="flex items-center gap-2 text-sm">
        {([1, 2, 3, 4] as Step[]).map((s) => (
          <li key={s} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => drafts.length > 0 && setStep(s)}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                s === step
                  ? "bg-primary text-primary-foreground"
                  : s < step
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {s < step ? <Check className="h-3.5 w-3.5" /> : s}
            </button>
            <span className={s === step ? "font-medium" : "text-muted-foreground"}>
              {STEP_LABELS[s]}
            </span>
            {s < 4 && <span className="mx-1 h-px w-6 bg-border" />}
          </li>
        ))}
      </ol>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Schritt 1: Multi-Upload */}
      {step === 1 && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
              }}
              onClick={() => !busy && inputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 text-center hover:border-primary/60"
            >
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <UploadCloud className="h-8 w-8 text-primary" />
              <div>
                <p className="font-semibold">
                  Einen oder mehrere Energieausweise hochladen
                </p>
                <p className="text-sm text-muted-foreground">
                  PDFs hierher ziehen oder klicken (mehrfach auswählbar)
                </p>
              </div>
            </div>

            {uploads.length > 0 && (
              <ul className="space-y-1 text-sm">
                {uploads.map((u, i) => (
                  <li key={i} className="flex items-center gap-2">
                    {u.status === "liest" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : u.status === "fertig" ? (
                      <Check className="h-4 w-4 text-[var(--success)]" />
                    ) : u.status === "fehler" ? (
                      <span className="text-destructive">✕</span>
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{u.fileName}</span>
                    {u.error && (
                      <span className="text-xs text-destructive">{u.error}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {drafts.length > 0 && (
              <div className="flex items-center justify-between border-t pt-4">
                <span className="text-sm text-muted-foreground">
                  {drafts.length} Entwurf/Entwürfe bereit
                </span>
                <Button onClick={() => setStep(2)} disabled={busy}>
                  Weiter: Prüfen <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Schritt 2: Pruefen */}
      {step === 2 && activeDraft && (
        <div className="space-y-4">
          <DraftNav
            drafts={drafts}
            active={active}
            onSelect={setActive}
            onRemove={removeDraft}
          />
          <Card>
            <CardContent className="p-6">
              <ReviewPanel
                building={activeDraft.normalized}
                onPatch={(patch) => patchDraft(active, patch)}
              />
            </CardContent>
          </Card>
          <WizardNav
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
            nextLabel="Weiter: Karte"
          />
        </div>
      )}

      {/* Schritt 3: Karten-Selektion */}
      {step === 3 && activeDraft && (
        <div className="space-y-4">
          <DraftNav
            drafts={drafts}
            active={active}
            onSelect={setActive}
            onRemove={removeDraft}
          />
          <Card>
            <CardContent className="space-y-3 p-6">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                Wählen Sie per Klick die Gebäudeteile aus, die zu diesem
                Energieausweis gehören (grün = zugehörig).
              </p>
              {mapLoading ? (
                <div className="flex items-center gap-2 py-12 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" /> Karte wird geladen…
                </div>
              ) : activeDraft.footprint ? (
                <>
                  <FootprintSelect
                    footprint={activeDraft.footprint}
                    onToggle={(i) => toggleFootprint(active, i)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {activeDraft.footprint.buildings.filter(isSelected).length}{" "}
                    Polygon(e) ausgewählt · Quelle: OpenStreetMap
                  </p>
                </>
              ) : (
                <p className="py-8 text-sm text-muted-foreground">
                  {mapError ??
                    "Keine Grundrisse verfügbar (Adresse fehlt oder nicht auflösbar) – Schritt kann übersprungen werden."}
                </p>
              )}
            </CardContent>
          </Card>
          <WizardNav
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
            nextLabel="Weiter: Bestätigen"
          />
        </div>
      )}

      {/* Schritt 4: Bestaetigen */}
      {step === 4 && (
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="flex items-center gap-2 font-semibold">
                <Building2 className="h-4 w-4" />
                {drafts.length} Gebäude werden angelegt
              </h2>
              <ul className="space-y-1 text-sm">
                {drafts.map((d, i) => (
                  <li key={d.id} className="flex items-center justify-between border-b pb-1 last:border-0">
                    <span>
                      {d.name ?? d.normalized.adresse ?? `Entwurf ${i + 1}`}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {d.normalized.gebaeudetyp} ·{" "}
                        {Math.round(d.normalized.totalKwhM2a)} kWh/m²·a
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeDraft(i)}
                      className="text-destructive hover:opacity-70"
                      aria-label="Entwurf verwerfen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>

              {drafts.length > 1 && (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">
                    Als Wirtschaftseinheit zusammenfassen (optional)
                  </span>
                  <input
                    value={euName}
                    onChange={(e) => setEuName(e.target.value)}
                    placeholder="Name der Wirtschaftseinheit, z. B. „Quartier Nord“"
                    className="h-9 rounded-md border border-input bg-background px-3"
                  />
                </label>
              )}

              <p className="text-xs text-muted-foreground">
                Erst mit „Anlegen" werden die Gebäude erzeugt. Entwürfe können
                bis dahin jederzeit verworfen werden.
              </p>
            </CardContent>
          </Card>
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep(3)}>
              <ArrowLeft className="h-4 w-4" /> Zurück
            </Button>
            <Button onClick={commit} disabled={busy || drafts.length === 0}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {drafts.length > 1 ? `${drafts.length} Gebäude anlegen` : "Gebäude anlegen"}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}

function DraftNav({
  drafts,
  active,
  onSelect,
  onRemove,
}: {
  drafts: Draft[];
  active: number;
  onSelect: (i: number) => void;
  onRemove: (i: number) => void;
}) {
  if (drafts.length <= 1) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {drafts.map((d, i) => (
        <button
          key={d.id}
          type="button"
          onClick={() => onSelect(i)}
          onDoubleClick={() => onRemove(i)}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            i === active
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
          title={d.name ?? undefined}
        >
          {i + 1}. {(d.name ?? "Unbenannt").slice(0, 28)}
        </button>
      ))}
    </div>
  );
}

function WizardNav({
  onBack,
  onNext,
  nextLabel,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <Button variant="outline" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" /> Zurück
      </Button>
      <Button onClick={onNext}>
        {nextLabel} <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
