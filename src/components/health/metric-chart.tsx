"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Marker } from "@/lib/health/markers";
import type { MetricSeries } from "@/lib/health/series";

function fmt(value: number) {
  const abs = Math.abs(value);
  return Number(value.toFixed(abs > 0 && abs < 10 ? 1 : 0)).toLocaleString("en-IN");
}

function fmtDate(t: number) {
  return new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

type ChartPoint = {
  t: number;
  value: number;
  band?: [number, number];
  interpretation: string;
};

export function MetricChart({
  series,
  unit,
  markers = [],
  height = 320,
}: {
  series: MetricSeries;
  unit: string | null;
  markers?: Marker[];
  height?: number;
}) {
  const data: ChartPoint[] = series.points.map((p) => ({
    t: new Date(p.date).getTime(),
    value: p.value,
    band: p.min != null && p.max != null ? [p.min, p.max] : undefined,
    interpretation: p.interpretation,
  }));
  const first = data[0]?.t ?? 0;
  const last = data[data.length - 1]?.t ?? 1;
  const refPoint = series.points.find((p) => p.referenceLow != null || p.referenceHigh != null);
  const hasBand = data.some((d) => d.band);
  const markerTimes = markers
    .map((m) => ({ ...m, t: new Date(m.date).getTime() }))
    .filter((m) => m.t >= first && m.t <= last);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="currentColor" strokeDasharray="3 3" strokeOpacity={0.14} vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          domain={[first, last]}
          tickFormatter={(t) => fmtDate(Number(t))}
          tick={{ fill: "currentColor", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "currentColor", strokeOpacity: 0.24 }}
          tickCount={6}
        />
        <YAxis
          domain={["auto", "auto"]}
          tickFormatter={(v) => fmt(Number(v))}
          tick={{ fill: "currentColor", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <Tooltip
          formatter={(value, name) => {
            if (name === "band" && Array.isArray(value)) {
              return [
                `${fmt(Number(value[0]))} – ${fmt(Number(value[1]))}${unit ? ` ${unit}` : ""}`,
                "Range",
              ];
            }
            return [
              `${fmt(Number(value))}${unit ? ` ${unit}` : ""}`,
              series.mode === "rollup" ? "Average" : "Value",
            ];
          }}
          labelFormatter={(t) =>
            new Date(Number(t)).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          }
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            borderColor: "var(--border)",
            boxShadow: "0 12px 30px oklch(0.19 0.035 252 / 12%)",
          }}
        />
        {refPoint?.referenceLow != null && refPoint?.referenceHigh != null && (
          <ReferenceArea
            y1={refPoint.referenceLow}
            y2={refPoint.referenceHigh}
            fill="var(--success)"
            fillOpacity={0.08}
            ifOverflow="extendDomain"
          />
        )}
        {refPoint?.referenceHigh != null && (
          <ReferenceLine y={refPoint.referenceHigh} stroke="#ef4444" strokeDasharray="4 3" strokeOpacity={0.45} />
        )}
        {refPoint?.referenceLow != null && (
          <ReferenceLine y={refPoint.referenceLow} stroke="#3b82f6" strokeDasharray="4 3" strokeOpacity={0.35} />
        )}
        {markerTimes.map((m, i) => (
          <ReferenceLine
            key={`${m.date}-${i}`}
            x={m.t}
            stroke="var(--primary)"
            strokeDasharray="2 4"
            strokeOpacity={0.5}
          />
        ))}
        {hasBand && (
          <Area
            dataKey="band"
            stroke="none"
            fill="var(--primary)"
            fillOpacity={0.14}
            isAnimationActive={false}
          />
        )}
        <Line
          type="monotone"
          dataKey="value"
          stroke="var(--primary)"
          strokeWidth={2.5}
          dot={series.mode === "raw" ? { r: 3.5, strokeWidth: 2, fill: "var(--card)" } : false}
          activeDot={{ r: 5 }}
          isAnimationActive={series.points.length <= 60}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
