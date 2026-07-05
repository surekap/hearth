"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/mascot";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  observedAt: string;
  valueNumeric: number | null;
  valueText: string | null;
  unit: string | null;
  referenceLow: number | null;
  referenceHigh: number | null;
  interpretation: string;
  source: string;
  typeId: string;
  typeName: string;
  category: string;
};

type ObsType = {
  id: string;
  canonicalName: string;
  category: string;
  normalUnit: string | null;
};

function interpBadge(interpretation: string) {
  switch (interpretation) {
    case "high":
    case "critical":
      return <Badge className="bg-destructive/10 text-destructive">{interpretation}</Badge>;
    case "low":
      return <Badge className="bg-primary/10 text-primary">low</Badge>;
    case "normal":
      return <Badge className="bg-[var(--success)]/15 text-[color-mix(in_oklch,var(--success),black_28%)]">normal</Badge>;
    default:
      return null;
  }
}

export function LabsView({
  profileId,
  profileName,
  rows,
  allTypes,
}: {
  profileId: string;
  profileName: string;
  rows: Row[];
  allTypes: ObsType[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add-value form state
  const [newTypeId, setNewTypeId] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));

  const groups = useMemo(() => {
    const byType = new Map<string, { type: Row; history: Row[] }>();
    for (const r of rows) {
      const g = byType.get(r.typeId);
      if (g) g.history.push(r);
      else byType.set(r.typeId, { type: r, history: [r] });
    }
    let list = [...byType.values()];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (g) =>
          g.type.typeName.toLowerCase().includes(q) ||
          g.type.category.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => a.type.typeName.localeCompare(b.type.typeName));
    return list;
  }, [rows, query]);

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

  async function deleteObservation(id: string) {
    if (!confirm("Delete this value?")) return;
    await fetch(`/api/observations/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge className="mb-2 bg-accent text-accent-foreground" variant="secondary">
            Labs
          </Badge>
          <h1 className="text-3xl font-semibold">Lab values</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirmed values for {profileName}
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              Add value
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a value manually</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>Test</Label>
                <select
                  value={newTypeId}
                  onChange={(e) => {
                    setNewTypeId(e.target.value);
                    const t = allTypes.find((t) => t.id === e.target.value);
                    if (t?.normalUnit) setNewUnit(t.normalUnit);
                  }}
                  className="border-input h-9 rounded-lg border bg-background/75 px-3 text-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="">Choose test…</option>
                  {allTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.canonicalName} ({t.category})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Value</Label>
                  <Input
                    type="number"
                    step="any"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Unit</Label>
                  <Input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </div>
              <Button onClick={addValue} disabled={saving || !newTypeId || !newValue}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative rounded-lg border bg-card/80 p-1 shadow-xs">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search tests — ALT, HbA1c, LDL, Vitamin D…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              mood={rows.length === 0 ? "thinking" : "concerned"}
              title={rows.length === 0 ? "No confirmed values yet" : "No tests match"}
              description={
                rows.length === 0
                  ? "Upload a lab report or add one manually to start building this profile's lab history."
                  : "Try a different test name, category, or abbreviation."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {groups.map(({ type, history }) => {
            const latest = history[0];
            const isOpen = !!open[type.typeId];
            return (
              <Card key={type.typeId} className="interactive-card py-0">
                <CardContent className="px-0">
                  <button
                    className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50"
                    onClick={() =>
                      setOpen((prev) => ({ ...prev, [type.typeId]: !prev[type.typeId] }))
                    }
                  >
                    {isOpen ? (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{type.typeName}</p>
                      <p className="text-xs capitalize text-muted-foreground">
                        {type.category} · {history.length} value
                        {history.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums">
                        {latest.valueNumeric ?? latest.valueText}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          {latest.unit}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(latest.observedAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    {interpBadge(latest.interpretation)}
                  </button>

                  {isOpen && (
                    <div className="overflow-x-auto border-t px-4 py-2">
                      <table className="w-full min-w-[620px] text-sm">
                        <thead>
                          <tr className="text-left text-xs text-muted-foreground">
                            <th className="py-1.5 font-medium">Date</th>
                            <th className="py-1.5 font-medium">Value</th>
                            <th className="py-1.5 font-medium">Reference</th>
                            <th className="py-1.5 font-medium">Flag</th>
                            <th className="py-1.5 font-medium">Source</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((h) => (
                            <tr key={h.id} className="border-t border-muted/50">
                              <td className="py-1.5 tabular-nums">
                                {new Date(h.observedAt).toLocaleDateString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </td>
                              <td
                                className={cn(
                                  "py-1.5 font-medium tabular-nums",
                                  (h.interpretation === "high" ||
                                    h.interpretation === "critical") &&
                                    "text-red-600",
                                  h.interpretation === "low" && "text-blue-600"
                                )}
                              >
                                {h.valueNumeric ?? h.valueText} {h.unit}
                              </td>
                              <td className="py-1.5 text-muted-foreground tabular-nums">
                                {h.referenceLow ?? "–"}–{h.referenceHigh ?? "–"}
                              </td>
                              <td className="py-1.5">{interpBadge(h.interpretation)}</td>
                              <td className="py-1.5 text-xs text-muted-foreground">
                                {h.source}
                              </td>
                              <td className="py-1.5 text-right">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => deleteObservation(h.id)}
                                  title="Delete"
                                >
                                  <Trash2 className="size-3.5 text-muted-foreground" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
