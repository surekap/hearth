import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { limitRecentMarkers, type Marker } from "./marker-utils";

export type { Marker } from "./marker-utils";

const MARKER_DOC_TYPES = [
  "prescription",
  "imaging",
  "specialist_report",
  "discharge_summary",
  "genetic_report",
] as const;

/** Timeline markers (documents + medication changes) for chart overlays. */
export async function getMarkers(profileId: string, start: Date | null): Promise<Marker[]> {
  const docs = await db.query.documents.findMany({
    where: eq(schema.documents.profileId, profileId),
    orderBy: [asc(schema.documents.uploadedAt)],
  });
  const markers: Marker[] = docs
    .filter(
      (d) =>
        (MARKER_DOC_TYPES as readonly string[]).includes(d.documentType) ||
        d.extractionStatus === "confirmed"
    )
    .map((d) => ({
      date: (d.documentDate ? new Date(d.documentDate) : d.uploadedAt).toISOString(),
      label:
        d.documentType === "prescription"
          ? "Prescription"
          : d.documentType === "imaging"
            ? "Imaging"
            : d.documentType === "genetic_report"
            ? "Genetic report"
              : d.documentType === "other"
                ? "Clinical report"
                : "Specialist report",
      kind: d.documentType === "prescription" ? "prescription" : "report",
    }));

  const medEvents = await db.query.medicationEvents.findMany({
    where: eq(schema.medicationEvents.profileId, profileId),
    orderBy: [asc(schema.medicationEvents.eventTime)],
  });
  for (const m of medEvents) {
    if (m.eventType === "started" || m.eventType === "stopped" || m.eventType === "prescribed") {
      markers.push({
        date: m.eventTime.toISOString(),
        label: `${m.nameText} ${m.eventType}`,
        kind: "medication",
      });
    }
  }

  return limitRecentMarkers(
    markers.filter((marker) => !start || new Date(marker.date) >= start)
  );
}
