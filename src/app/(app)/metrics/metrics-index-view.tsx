"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import type { MetricIndexRow } from "@/lib/health/metric";

type ObsType = { id: string; canonicalName: string; category: string; normalUnit: string | null };

function interpBadge(interpretation: string) {
  if (interpretation === "high" || interpretation === "critical") {
    return <Badge className="bg-destructive/10 text-destructive">{interpretation}</Badge>;
  }
  if (interpretation === "low") return <Badge className="bg-primary/10 text-primary">low</Badge>;
  return null;
}

export function MetricsIndexView({
  profileId,
  index,
  allTypes,
}: {
  profileId: string;
  index: MetricIndexRow[];
  allTypes: ObsType[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newTypeId, setNewTypeId] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? index.filter(
          (r) => r.name.toLowerCase().includes(q) || r.categoryLabel.toLowerCase().includes(q)
        )
      : index;
    const byCategory = new Map<string, MetricIndexRow[]>();
    for (const row of rows) {
      const list = byCategory.get(row.categoryLabel) ?? [];
      list.push(row);
      byCategory.set(row.categoryLabel, list);
    }
    return [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [index, query]);

  async function addValue() {
    if (!newTypeId || !newValue) return;
    setSaving(true);
    try {
      const res = await fetch("/api/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          observationTypeId: newTypeId,
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

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge className="mb-2 bg-accent text-accent-foreground" variant="secondary">
            Measurements
          </Badge>
          <h1 className="text-3xl font-semibold">All measurements</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every confirmed value, searchable. Open any measurement for its full history.
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" /> Add value
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a value</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="add-type">Measurement</Label>
                <select
                  id="add-type"
                  className="h-9 rounded-md border bg-transparent px-3 text-sm"
                  value={newTypeId}
                  onChange={(e) => {
                    setNewTypeId(e.target.value);
                    const t = allTypes.find((x) => x.id === e.target.value);
                    if (t?.normalUnit) setNewUnit(t.normalUnit);
                  }}
                >
                  <option value="">Select…</option>
                  {allTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.canonicalName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="add-value">Value</Label>
                <Input
                  id="add-value"
                  type="number"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="add-unit">Unit</Label>
                <Input id="add-unit" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="add-date">Date</Label>
                <Input
                  id="add-date"
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </div>
              <Button disabled={saving || !newTypeId || !newValue} onClick={addValue}>
                {saving && <Loader2 className="size-4 animate-spin" />} Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search measurements or categories…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              mood="thinking"
              title={query ? "No matches" : "No confirmed values yet"}
              description={
                query
                  ? "Try a different search term."
                  : "Upload and confirm a report to start building this list."
              }
            />
          </CardContent>
        </Card>
      ) : (
        groups.map(([label, rows]) => (
          <section key={label} className="grid gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {label}
            </h2>
            <Card className="py-1">
              <CardContent className="divide-y px-0">
                {rows.map((row) => (
                  <Link
                    key={row.typeId}
                    href={`/metrics/${row.typeId}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{row.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {new Date(row.latestDate).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}{" "}
                        · {row.pointCount.toLocaleString("en-IN")} value{row.pointCount === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {interpBadge(row.interpretation)}
                      <span className="text-sm font-semibold tabular-nums">
                        {row.latestValue != null
                          ? row.latestValue.toLocaleString("en-IN")
                          : row.latestText}
                        {row.unit && (
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            {row.unit}
                          </span>
                        )}
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
