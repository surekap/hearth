type InsightRecord = {
  id: string;
  title: string;
  body: string;
  tone: "encouraging" | "neutral" | "warning" | "stern";
  category: string | null;
  model: string;
  createdAt: Date | string;
};

export type InsightForClient = {
  id: string;
  title: string;
  body: string;
  tone: "encouraging" | "neutral" | "warning" | "stern";
  category: string | null;
  model: string;
  createdAt: string;
  createdAtLabel: string;
};

const insightDateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

export function toInsightForClient(insight: InsightRecord): InsightForClient {
  const createdAt = toDate(insight.createdAt);
  return {
    id: insight.id,
    title: insight.title,
    body: insight.body,
    tone: insight.tone,
    category: insight.category,
    model: insight.model,
    createdAt: createdAt.toISOString(),
    createdAtLabel: insightDateFormatter.format(createdAt),
  };
}
