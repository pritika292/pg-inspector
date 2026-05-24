import { useEffect } from "react";

// Fire-and-forget visit beacon to the controlroom ingest endpoint (#125).
// Controlroom owns the pipeline (controlroom#87): it hashes the IP with a
// daily-rotating salt server-side and aggregates this-week / last-week
// counts for the family dashboard. The beacon body is empty — the slug
// in the URL and the source IP from the request are all the server needs.

const INGEST_URL = "https://controlroom.pritika.studio/api/visit/pg-inspector";

export function useVisitBeacon(): void {
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    try {
      navigator.sendBeacon?.(INGEST_URL);
    } catch {
      // Telemetry must never block the page.
    }
  }, []);
}
