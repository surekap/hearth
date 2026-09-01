export type Marker = {
  date: string;
  label: string;
  kind: "report" | "prescription" | "document" | "medication";
};

export function limitRecentMarkers(markers: Marker[], limit = 20): Marker[] {
  return [...markers]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-limit);
}
