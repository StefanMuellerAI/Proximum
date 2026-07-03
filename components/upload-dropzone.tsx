"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FileText, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { saveAnalysis } from "@/lib/session";
import { getDemo } from "@/lib/demo";

export function UploadDropzone() {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setFileName(file.name);
    if (file.type && file.type !== "application/pdf") {
      setError("Bitte eine PDF-Datei hochladen.");
      return;
    }
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraktion fehlgeschlagen.");
      saveAnalysis({ extraction: data.extraction, normalized: data.normalized });
      router.push("/analyse");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
      setLoading(false);
    }
  }

  function loadDemo() {
    setError(null);
    setLoading(true);
    const demo = getDemo();
    saveAnalysis(demo);
    router.push("/analyse");
  }

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        onClick={() => !loading && inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-12 text-center transition-colors",
          dragOver
            ? "border-primary bg-accent/60"
            : "border-border bg-card hover:border-primary/60 hover:bg-accent/30",
          loading && "pointer-events-none opacity-70",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          {loading ? (
            <Loader2 className="h-8 w-8 animate-spin" />
          ) : (
            <UploadCloud className="h-8 w-8" />
          )}
        </div>
        <div>
          <p className="text-lg font-semibold">
            {loading ? "Energieausweis wird ausgelesen…" : "Energieausweis hochladen"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {fileName && !error ? (
              <span className="inline-flex items-center gap-1">
                <FileText className="h-4 w-4" /> {fileName}
              </span>
            ) : (
              "PDF hierher ziehen oder klicken zum Auswählen (max. 20 MB)"
            )}
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-6 flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-px w-16 bg-border" />
          oder
          <div className="h-px w-16 bg-border" />
        </div>
        <Button variant="outline" onClick={loadDemo} disabled={loading}>
          <Sparkles className="h-4 w-4" />
          Mit Beispiel-Ausweis testen (ohne Upload)
        </Button>
      </div>
    </div>
  );
}
