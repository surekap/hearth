"use client";

import { useState } from "react";
import { ChevronDown, Minus, TrendingDown, TrendingUp, HelpCircle } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnswerBlock, ChangeRow, ChangeTableBlock, SeriesChartBlock } from "@/lib/ai/blocks";
import { cn } from "@/lib/utils";

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
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
  const data = block.points.map((p) => ({ ...p, label: fmtDate(p.date) }));
  const values = data.map((p) => p.value);
  const lo = block.referenceLow;
  const hi = block.referenceHigh;
  const min = Math.min(...values, lo ?? Infinity);
  const max = Math.max(...values, hi ?? -Infinity);
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
            <span className="inline-block h-2 w-5 rounded-sm bg-primary/25" /> normal range
          </span>
        )}
      </figcaption>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis domain={[min - pad, max + pad]} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => fmt(Number(v))} />
            {(lo !== null || hi !== null) && (
              <ReferenceArea y1={lo ?? min - pad} y2={hi ?? max + pad} fill="var(--primary)" fillOpacity={0.12} stroke="none" />
            )}
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)" }}
              formatter={(value) => [`${fmt(Number(value))}${block.unit ? ` ${block.unit}` : ""}`, block.test]}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={{ r: 4, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="sr-only">
        {data.map((p) => `${p.label}: ${fmt(p.value)}`).join("; ")}
      </p>
    </figure>
  );
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
        ) : null
      )}
    </>
  );
}
