"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, FileText, Loader2, Pill, Plus, Stethoscope, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/mascot";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MetricChart } from "@/components/health/metric-chart";
import { formatMetricNumber, RANGES, RANGE_LABELS } from "@/lib/health/series";
import type { MetricDetail } from "@/lib/health/metric";
import { cn } from "@/lib/utils";

function interpBadge(interpretation: string) {
  if (interpretation === "high" || interpretation === "critical") {
    return <Badge className="bg-destructive/10 text-destructive">{interpretation}</Badge>;
  }
  if (interpretation === "low") {
    return <Badge className="bg-primary/10 text-primary">low</Badge>;
  }
  if (interpretation === "normal") {
    return (
      <Badge className="bg-[var(--success)]/15 text-[color-mix(in_oklch,var(--success),black_28%)]">
        normal
      </Badge>
    );
  }
  return null;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function MetricView({ profileId, detail }: { profileId: string; detail: MetricDetail }) {
  const router = useRouter();
  const pathname = usePathname();
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [newValue, setNewValue] = useState("");
  const [newUnit, setNewUnit] = useState(detail.type.unit ?? "");
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));

  async function addValue() {
    if (!newValue) return;
    setSaving(true);
    try {
      const res = await fetch("/api/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          observationTypeId: detail.type.id,
          observedAt: new Date(newDate).toISOString(),
          valueNumeric: Number(newValue),
          unit: newUnit || undefined,
        }),
      });
      if (res.ok) {
        setAddOpen(false);
        setNewValue("");
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(id: string) {
    if (!confirm("Delete this value? This cannot be undone.")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/observations/${id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setDeleting(null);
    }
  }

  const { series, stats, markers } = detail;
  const singlePoint = series.points.length === 1;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/metrics"
            className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> All measurements
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-semibold">{detail.type.canonicalName}</h1>
            {stats && interpBadge(detail.history[0]?.interpretation ?? "unknown")}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {detail.type.categoryLabel}
            {detail.type.description ? ` · ${detail.type.description}` : ""}
          </p>
        </div>
        <div className="scrollbar-none flex max-w-full overflow-x-auto rounded-lg border bg-card/80 p-1 shadow-xs">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`${pathname}?range=${r}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-all",
                detail.range === r
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {RANGE_LABELS[r]}
            </Link>
          ))}
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="py-3">
            <CardContent className="px-4">
              <p className="text-xs text-muted-foreground">Latest</p>
              <p className="text-2xl font-semibold tabular-nums">
                {formatMetricNumber(stats.latest, stats.unit)}
                <span className="ml-1 text-sm font-normal text-muted-foreground">{stats.unit}</span>
              </p>
              <p className="text-xs text-muted-foreground">{fmtDate(stats.latestDate)}</p>
            </CardContent>
          </Card>
          <Card className="py-3">
            <CardContent className="px-4">
              <p className="text-xs text-muted-foreground">Lowest in range</p>
              <p className="text-2xl font-semibold tabular-nums">
                {formatMetricNumber(stats.min, stats.unit)}
              </p>
            </CardContent>
          </Card>
          <Card className="py-3">
            <CardContent className="px-4">
              <p className="text-xs text-muted-foreground">Highest in range</p>
              <p className="text-2xl font-semibold tabular-nums">
                {formatMetricNumber(stats.max, stats.unit)}
              </p>
            </CardContent>
          </Card>
          <Card className="py-3">
            <CardContent className="px-4">
              <p className="text-xs text-muted-foreground">Trend</p>
              <p className="text-2xl font-semibold capitalize">{stats.trend ?? "–"}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span>History</span>
            <span className="text-xs font-normal text-muted-foreground">{series.caption}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {series.points.length === 0 ? (
            <EmptyState
              mood="thinking"
              title="No confirmed values in this range"
              description="Try a longer range, or add a value below."
            />
          ) : singlePoint ? (
            <div className="grid gap-1 rounded-lg border bg-muted/30 p-6 text-center">
              <p className="text-4xl font-semibold tabular-nums">
                {formatMetricNumber(series.points[0].value, detail.type.unit)}
                <span className="ml-1 text-base font-normal text-muted-foreground">
                  {detail.type.unit}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                {fmtDate(series.points[0].date)}
                {series.points[0].referenceHigh != null &&
                  ` · reference ${series.points[0].referenceLow ?? 0}–${series.points[0].referenceHigh}`}
              </p>
              <p className="text-xs text-muted-foreground">
                Only one value on record — a trend needs at least two.
              </p>
            </div>
          ) : (
            <MetricChart series={series} unit={detail.type.unit} markers={markers} />
          )}
          {markers.length > 0 && series.points.length >= 2 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {markers.map((m, i) => (
                <span
                  key={`${m.date}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {m.kind === "medication" || m.kind === "prescription" ? (
                    <Pill className="size-3" />
                  ) : (
                    <Stethoscope className="size-3" />
                  )}
                  {fmtDate(m.date)} · {m.label}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center justify-between text-base">
            <span>
              Values{" "}
              <span className="text-xs font-normal text-muted-foreground">
                {detail.historyTotal > detail.history.length
                  ? `latest ${detail.history.length} of ${detail.historyTotal.toLocaleString("en-IN")}`
                  : `${detail.historyTotal}`}
              </span>
            </span>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus className="size-4" /> Add value
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add {detail.type.canonicalName} value</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="metric-value">Value</Label>
                    <Input
                      id="metric-value"
                      type="number"
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="metric-unit">Unit</Label>
                    <Input id="metric-unit" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="metric-date">Date</Label>
                    <Input
                      id="metric-date"
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                    />
                  </div>
                  <Button disabled={saving || !newValue} onClick={addValue}>
                    {saving && <Loader2 className="size-4 animate-spin" />} Save
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.history.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">{fmtDate(row.observedAt)}</TableCell>
                    <TableCell className="font-medium tabular-nums">
                      {row.valueNumeric != null ? row.valueNumeric.toLocaleString("en-IN") : row.valueText}
                      {row.unit && <span className="ml-1 text-xs text-muted-foreground">{row.unit}</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {row.referenceHigh != null ? `${row.referenceLow ?? 0}–${row.referenceHigh}` : "–"}
                    </TableCell>
                    <TableCell>{interpBadge(row.interpretation)}</TableCell>
                    <TableCell>
                      {row.documentId ? (
                        <Link
                          href={`/documents/${row.documentId}/review`}
                          className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                        >
                          <FileText className="size-3.5" />
                          <span className="max-w-40 truncate">{row.documentName ?? "Document"}</span>
                        </Link>
                      ) : (
                        <span className="text-muted-foreground capitalize">{row.source.replace("_", " ")}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={deleting === row.id}
                        onClick={() => deleteRow(row.id)}
                        aria-label="Delete value"
                      >
                        {deleting === row.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4 text-muted-foreground" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
