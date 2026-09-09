import type { AiContext } from "./context";

/** Only unambiguous value lookups bypass reasoning. Mixed/interpretive requests
 * deliberately fall through, including trend, abnormal and broad review asks. */
export function tryRuleAnswer(
  question: string,
  context: AiContext,
): { answer: string; model: string } | null {
  const match = question.trim().match(/^(?:what(?:'s| is)|show(?: me)?|give me) (?:my |the )?(?:latest|last|most recent|current) (.+?)(?: value| result| reading)?[?.!]*$/i);
  if (!match) return null;
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const test = normalize(match[1]);
  const rows = context.observations.filter((o) => normalize(o.test) === test)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) return null;
  const latestDate = rows.at(-1)!.date;
  const latest = rows.filter((o) => o.date === latestDate);
  // Multiple protocol readings on one date need interpretation, not an arbitrary pick.
  if (latest.length !== 1) return null;
  const o = latest[0];
  if (o.value === null) return null;
  const range = o.referenceLow !== null || o.referenceHigh !== null
    ? ` Printed reference: ${o.referenceLow ?? "—"}–${o.referenceHigh ?? "—"}${o.unit ? ` ${o.unit}` : ""}.`
    : " No printed reference range is recorded.";
  const source = o.documentId ? ` [Source](/api/documents/${o.documentId}/file${o.page ? `#page=${o.page}` : ""})` : "";
  return {
    answer: `Your latest ${o.test} is **${o.value}${o.unit ? ` ${o.unit}` : ""}**, recorded on ${o.date}.${range}${source}`,
    model: "rules-engine",
  };
}
