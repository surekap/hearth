"use client";

import { useState } from "react";
import { ChevronDown, Minus, TrendingDown, TrendingUp, HelpCircle } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  LabelList,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnswerBlock, ChangeRow, ChangeTableBlock, SeriesChartBlock } from "@/lib/ai/blocks";
import { cn } from "@/lib/utils";
import type { ReviewBlock } from "@/lib/ai/review-schema";
import { AnswerMarkdown } from "./answer-markdown";

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 6 }).format(n);
}

function fmtDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

/**
 * Direction is shown with an icon and a word as well as a colour, so it reads
 * in greyscale and for colour-blind readers.
 */
const DIRECTION: Record<
  ChangeRow["direction"],
  { label: string; icon: typeof TrendingUp; mark: string; text: string }
> = {
  worsened: { label: "Worse", icon: TrendingUp, mark: "var(--destructive)", text: "text-destructive" },
  improved: {
    label: "Improved",
    icon: TrendingDown,
    mark: "var(--success)",
    text: "text-[color-mix(in_oklch,var(--success),black_25%)]",
  },
  stable: { label: "Steady", icon: Minus, mark: "var(--muted-foreground)", text: "text-muted-foreground" },
  unclear: { label: "No range", icon: HelpCircle, mark: "var(--muted-foreground)", text: "text-muted-foreground" },
};

/**
 * Dumbbell on a reference band: the shaded band is the normal range, the
 * hollow dot is "before", the filled dot is "after". One glance says whether
 * a value moved into or out of range.
 */
function RangeShift({ row }: { row: ChangeRow }) {
  const lo = row.referenceLow;
  const hi = row.referenceHigh;
  const values = [row.from.value, row.to.value, lo ?? row.from.value, hi ?? row.to.value];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max === min) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.12;
  min -= pad;
  max += pad;
  const x = (v: number) => ((v - min) / (max - min)) * 100;
  const bandStart = lo === null ? 0 : x(lo);
  const bandEnd = hi === null ? 100 : x(hi);
  const mark = DIRECTION[row.direction].mark;
  const a = x(row.from.value);
  const b = x(row.to.value);
  return (
    <div className="relative h-4 w-full" aria-hidden>
      <div className="absolute inset-x-0 top-1.5 h-1 rounded-full bg-muted" />
      {(lo !== null || hi !== null) && (
        <div
          className="absolute top-[5px] h-1.5 rounded-full bg-primary/25"
          style={{ left: `${bandStart}%`, width: `${Math.max(0, bandEnd - bandStart)}%` }}
        />
      )}
      <div
        className="absolute top-[7px] h-0.5 rounded-full"
        style={{ left: `${Math.min(a, b)}%`, width: `${Math.abs(b - a)}%`, background: mark }}
      />
      <span
        className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-card"
        style={{ left: `${a}%`, borderColor: mark }}
      />
      <span
        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card"
        style={{ left: `${b}%`, background: mark }}
      />
    </div>
  );
}

function ChangeRowView({ row }: { row: ChangeRow }) {
  const d = DIRECTION[row.direction];
  const Icon = d.icon;
  const range =
    row.referenceLow !== null || row.referenceHigh !== null
      ? `ref ${row.referenceLow ?? "–"}–${row.referenceHigh ?? "–"}`
      : "no reference range";
  return (
    <li className="grid gap-1 border-b py-2 last:border-b-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-medium">{row.test}</span>
        <span className={cn("flex shrink-0 items-center gap-1 text-xs font-medium", d.text)}>
          <Icon className="size-3.5" />
          {d.label}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground tabular-nums">
        <span>
          <span className="text-foreground">{fmt(row.from.value)}</span>
          <span className="mx-1">→</span>
          <span className="font-semibold text-foreground">{fmt(row.to.value)}</span>
          {row.unit ? ` ${row.unit}` : ""}
          {row.deltaPercent !== 0 ? ` (${row.deltaPercent > 0 ? "+" : ""}${row.deltaPercent}%)` : ""}
        </span>
        <span className="shrink-0">{range}</span>
      </div>
      <RangeShift row={row} />
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{fmtDate(row.from.date)}</span>
        <span>{fmtDate(row.to.date)}</span>
      </div>
    </li>
  );
}

function Group({
  title,
  rows,
  defaultOpen,
}: {
  title: string;
  rows: ChangeRow[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (rows.length === 0) return null;
  return (
    <section className="rounded-lg border bg-background/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold"
      >
        <span>
          {title} <span className="font-normal text-muted-foreground">({rows.length})</span>
        </span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="px-3 pb-1">
          {rows.map((row) => (
            <ChangeRowView key={row.test} row={row} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ChangeTable({ block }: { block: ChangeTableBlock }) {
  const by = (dir: ChangeRow["direction"]) => block.rows.filter((r) => r.direction === dir);
  const stable = by("stable");
  return (
    <div className="mt-3 grid gap-2">
      <p className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Before → after over {block.windowLabel}</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-5 rounded-sm bg-primary/25" /> normal range
        </span>
      </p>
      <Group title="Getting worse" rows={by("worsened")} defaultOpen />
      <Group title="Improved" rows={by("improved")} defaultOpen />
      <Group title="Moved, no reference range" rows={by("unclear")} defaultOpen={false} />
      {stable.length > 0 && (
        <details className="rounded-lg border bg-background/60 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-semibold">
            Steady <span className="font-normal text-muted-foreground">({stable.length})</span>
          </summary>
          <p className="mt-1.5 text-xs text-muted-foreground">{stable.map((r) => r.test).join(", ")}</p>
        </details>
      )}
      {block.singleValueTests.length > 0 && (
        <details className="rounded-lg border bg-background/60 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-semibold">
            Only one reading in the window{" "}
            <span className="font-normal text-muted-foreground">({block.singleValueTests.length})</span>
          </summary>
          <p className="mt-1.5 text-xs text-muted-foreground">{block.singleValueTests.join(", ")}</p>
        </details>
      )}
    </div>
  );
}

function SeriesChart({ block }: { block: SeriesChartBlock }) {
  const data = block.points.map((p) => ({ ...p, time: new Date(`${p.date}T00:00:00Z`).getTime(), label: fmtDate(p.date) }));
  const values = data.map((p) => p.value);
  const lo = block.referenceLow;
  const hi = block.referenceHigh;
  const min = Math.min(...values, lo ?? Infinity, hi ?? Infinity);
  const max = Math.max(...values, lo ?? -Infinity, hi ?? -Infinity);
  const pad = (max - min || 1) * 0.15;
  return (
    <figure className="mt-3 rounded-lg border bg-background/60 p-2">
      <figcaption className="mb-1 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
        <span>
          {block.test}
          {block.unit ? ` (${block.unit})` : ""}
        </span>
        {(lo !== null || hi !== null) && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-5 rounded-sm bg-primary/25" /> printed range
          </span>
        )}
      </figcaption>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 18, right: 18, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
            <XAxis dataKey="time" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(v) => fmtDate(new Date(Number(v)).toISOString().slice(0, 10))} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis domain={[min - pad, max + pad]} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => fmt(Number(v))} />
            {(lo !== null || hi !== null) && (
              <ReferenceArea y1={lo ?? min - pad} y2={hi ?? max + pad} fill="var(--primary)" fillOpacity={0.12} stroke="none" />
            )}
            <Tooltip
              labelFormatter={(value) => fmtDate(new Date(Number(value)).toISOString().slice(0, 10))}
              cursor={{ stroke: "var(--border)" }}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)" }}
              formatter={(value) => [`${fmt(Number(value))}${block.unit ? ` ${block.unit}` : ""}`, block.test]}
            />
            <Line
              type="linear"
              dataKey="value"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={{ r: 4, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            >
              {data.length <= 6 && <LabelList dataKey="value" position="top" fontSize={10} fill="var(--foreground)" formatter={(v) => fmt(Number(v))} />}
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="sr-only">
        {data.map((p) => `${p.label}: ${fmt(p.value)}`).join("; ")}
      </p>
    </figure>
  );
}

function SourceLinks({ ids, sources }: { ids: string[]; sources: ReviewBlock["sources"] }) {
  return <span className="ml-1 inline-flex flex-wrap gap-1 text-xs text-muted-foreground">
    {[...new Set(ids)].map((id) => {
      const source = sources.find((s) => s.id === id);
      if (!source) return null;
      const label = `${source.label}${source.date ? ` · ${source.date}` : ""}${source.page ? ` · page ${source.page}` : ""}`;
      return source.documentId ? <a key={id} title={label} aria-label={`Source: ${label}`}
        className="rounded border px-1.5 py-0.5 hover:bg-muted underline-offset-2 hover:underline"
        href={`/api/documents/${source.documentId}/file${source.page ? `#page=${source.page}` : ""}`} target="_blank" rel="noreferrer">
        {sources.indexOf(source) + 1}
      </a> : <span key={id} title={label} className="rounded border px-1.5 py-0.5">{sources.indexOf(source) + 1}</span>;
    })}
  </span>;
}

function ReviewAnswer({ block }: { block: ReviewBlock }) {
  const generalLimitations = block.limitations.filter((note) => !block.visuals.some((v) => v.caveat === note));
  return <div className="mt-2 grid min-w-0 gap-3">
    <div className="text-xs text-muted-foreground">Sources <SourceLinks ids={block.overviewEvidenceIds} sources={block.sources} /></div>
    {block.visuals.map((visual, index) => {
      const first = visual.points[0];
      if (!first) return null;
      const sameRange = visual.points.every((p) => p.referenceLow === first.referenceLow && p.referenceHigh === first.referenceHigh);
      return <section key={index} className="min-w-0 rounded-lg border p-3">
        <h4 className="mb-2 text-sm font-semibold">{visual.title}</h4>
        {visual.type === "trend" ? <SeriesChart block={{
          type: "series-chart", test: first.label, unit: first.unit,
          referenceLow: sameRange ? first.referenceLow : null, referenceHigh: sameRange ? first.referenceHigh : null,
          points: visual.points.map((p) => ({ date: p.date!, value: Number(p.value), interpretation: "unknown" })),
        }} /> : visual.type === "timeline" ? <ol className="grid gap-3 border-l-2 pl-3">
          {visual.points.map((p) => <li key={p.id} className="text-sm">
            <div className="text-xs text-muted-foreground">{p.date ?? "Date not recorded"}</div>
            <div className="font-medium">{p.label}<SourceLinks ids={[p.id]} sources={block.sources} /></div>
            <p className="mt-1">{p.value}</p>
          </li>)}
        </ol> : <div className="overflow-x-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <thead><tr className="border-b text-muted-foreground"><th className="p-2">Measurement</th><th className="p-2">Date</th><th className="p-2">Value</th><th className="p-2">Printed range</th></tr></thead>
            <tbody>{visual.points.map((p) => <tr key={p.id} className="border-b last:border-0">
              <th scope="row" className="p-2 font-medium">{p.label}<SourceLinks ids={[p.id]} sources={block.sources} /></th>
              <td className="whitespace-nowrap p-2">{p.date ?? "Unknown"}</td>
              <td className="whitespace-nowrap p-2 font-medium">{p.value ?? "—"} {p.unit}</td>
              <td className="whitespace-nowrap p-2">{p.referenceLow === null && p.referenceHigh === null ? "Not recorded" : `${p.referenceLow ?? "—"}–${p.referenceHigh ?? "—"}`}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        {visual.type === "trend" && <SourceLinks ids={visual.points.map((p) => p.id)} sources={block.sources} />}
        {visual.caveat && <p className="mt-2 text-xs text-muted-foreground">{visual.caveat}</p>}
      </section>;
    })}
    {generalLimitations.length > 0 && <div className="rounded-lg border bg-muted/40 p-3 text-xs">
      <p className="mb-1 font-semibold">Keep in mind</p>
      <ul className="list-disc space-y-1 pl-4">{generalLimitations.map((note, i) => <li key={i}>{note}</li>)}</ul>
    </div>}
    {block.nextSteps.length > 0 && <section>
      <h4 className="mb-2 text-sm font-semibold">Next steps</h4>
      <ul className="list-disc space-y-2 pl-4 text-sm">{block.nextSteps.map((step, i) => <li key={i}>
        {step.text}<SourceLinks ids={step.evidenceIds} sources={block.sources} />
      </li>)}</ul>
    </section>}
    {block.findings.length > 0 && <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-semibold">Full analysis · {block.findings.length} findings</summary>
      <div className="mt-3 grid gap-4">{block.findings.map((f, i) => <section key={i}>
        <h4 className="mb-1 text-sm font-semibold">{f.title}<SourceLinks ids={f.evidenceIds} sources={block.sources} /></h4>
        <AnswerMarkdown text={f.text} />
        {f.uncertainty && <p className="mt-1 text-xs text-muted-foreground">{f.uncertainty}</p>}
      </section>)}</div>
    </details>}
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer">Evidence and coverage</summary>
      <p className="my-2">{block.coverage}</p>
      <ol className="list-decimal space-y-1 pl-5">{block.sources.map((s) => <li key={s.id}>
        {s.label} · {s.date ?? "date unknown"}{s.page ? ` · page ${s.page}` : ""}<SourceLinks ids={[s.id]} sources={block.sources} />
      </li>)}</ol>
    </details>
  </div>;
}

export function AnswerBlocks({ blocks }: { blocks: AnswerBlock[] }) {
  if (blocks.length === 0) return null;
  return (
    <>
      {blocks.map((block, i) =>
        block.type === "change-table" ? (
          <ChangeTable key={i} block={block} />
        ) : block.type === "series-chart" ? (
          <SeriesChart key={i} block={block} />
        ) : block.type === "review" ? <ReviewAnswer key={i} block={block} /> : null
      )}
    </>
  );
}
