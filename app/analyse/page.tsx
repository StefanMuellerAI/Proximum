import { Suspense } from "react";
import { AnalyseClient } from "@/components/dashboard/analyse-client";

export default function AnalysePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-muted-foreground">
          Analyse wird geladen…
        </div>
      }
    >
      <AnalyseClient />
    </Suspense>
  );
}
