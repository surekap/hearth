import { z } from "zod";
import { reviewBlockSchema, type ReviewBlock } from "./review-schema";

/**
 * Structured parts of an answer. Prose is the wrong shape for a 78-row
 * comparison; the rules engine emits these blocks alongside a short summary
 * and the Ask screen renders them as tables and small diagrams.
 *
 * Blocks travel inside the answer text as a fenced ```hearth-blocks JSON
 * section, so stored conversations render the same way as live ones and no
 * schema change is needed. `stripBlocks` removes them for the model's own
 * history and for plain-text fallbacks.
 */

export type ChangeRow = {
  test: string;
  unit: string | null;
  from: { date: string; value: number };
  to: { date: string; value: number };
  deltaPercent: number;
  referenceLow: number | null;
  referenceHigh: number | null;
  direction: "improved" | "worsened" | "stable" | "unclear";
};

export type ChangeTableBlock = {
  type: "change-table";
  windowLabel: string;
  since: string | null;
  rows: ChangeRow[];
  singleValueTests: string[];
};

export type SeriesPoint = { date: string; value: number; interpretation: string };

export type SeriesChartBlock = {
  type: "series-chart";
  test: string;
  unit: string | null;
  referenceLow: number | null;
  referenceHigh: number | null;
  points: SeriesPoint[];
};

export type AnswerBlock = ChangeTableBlock | SeriesChartBlock | ReviewBlock;

const datedValue = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), value: z.number() });
const range = { referenceLow: z.number().nullable(), referenceHigh: z.number().nullable() };
const legacyBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("series-chart"), test: z.string(), unit: z.string().nullable(), ...range,
    points: z.array(datedValue.extend({ interpretation: z.string() })).min(1).max(2000) }),
  z.object({ type: z.literal("change-table"), windowLabel: z.string(), since: z.string().nullable(),
    rows: z.array(z.object({ test: z.string(), unit: z.string().nullable(), ...range,
      from: datedValue, to: datedValue, deltaPercent: z.number(),
      direction: z.enum(["improved", "worsened", "stable", "unclear"]) })), singleValueTests: z.array(z.string()) }),
]);

const FENCE_OPEN = "```hearth-blocks";
const FENCE_RE = /```hearth-blocks\n([\s\S]*?)\n```/;

export function encodeBlocks(markdown: string, blocks: AnswerBlock[]): string {
  if (blocks.length === 0) return markdown;
  return `${markdown.trimEnd()}\n\n${FENCE_OPEN}\n${JSON.stringify(blocks)}\n\`\`\``;
}

export function parseAnswer(answer: string): { markdown: string; blocks: AnswerBlock[] } {
  const match = FENCE_RE.exec(answer);
  if (!match) return { markdown: answer, blocks: [] };
  let blocks: AnswerBlock[] = [];
  try {
    const parsed = JSON.parse(match[1]);
    if (Array.isArray(parsed)) blocks = parsed.flatMap((block) => {
      const result = z.union([legacyBlockSchema, reviewBlockSchema]).safeParse(block);
      return result.success ? [result.data] : [];
    });
  } catch {
    blocks = [];
  }
  return { markdown: answer.replace(FENCE_RE, "").trimEnd(), blocks };
}

export function stripBlocks(answer: string): string {
  const { markdown, blocks } = parseAnswer(answer);
  const review = blocks.find((b): b is ReviewBlock => b.type === "review");
  if (!review) return markdown;
  // Preserve the actual findings and comparison selection for follow-ups;
  // compact prose avoids replaying large chart JSON or stale evidence IDs.
  return [markdown, ...review.findings.map((f) => `${f.title}: ${f.text}${f.uncertainty ? ` (${f.uncertainty})` : ""}`),
    ...review.visuals.map((v) => `${v.title}: ${v.points.map((p) => `${p.label} ${p.date}: ${p.value} ${p.unit ?? ""}`).join("; ")}`),
    ...review.nextSteps.map((s) => s.text), ...review.limitations].join("\n");
}
