"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  itemType: string;
  status: string;
  rawJson: Record<string, unknown>;
  confidence: number | null;
  userCorrected: boolean;
};

type ObsType = { id: string; canonicalName: string; category: string };

type Decision = "accept" | "reject";

type RowEdit = {
  value?: number | null;
  unit?: string | null;
  report_date?: string | null;
  observation_type_id?: string | null;
};

const HIGH_CONFIDENCE = 0.8;

function confBadge(c: number | null) {
  if (c == null) return <Badge variant="outline">–</Badge>;
  const pct = Math.round(c * 100);
  if (c >= HIGH_CONFIDENCE)
    return <Badge className="bg-emerald-600 text-white">{pct}%</Badge>;
  if (c >= 0.5) return <Badge className="bg-amber-500 text-white">{pct}%</Badge>;
  return <Badge variant="destructive">{pct}%</Badge>;
}

export function ReviewPanel({
  document: doc,
  profileName,
  job,
  items,
  observationTypes,
}: {
  document: {
    id: string;
    filename: string;
    mimeType: string;
    documentType: string;
    documentDate: string | null;
    extractionStatus: string;
  };
  profileName: string;
  job: { id: string; status: string; model: string | null; error: string | null } | null;
  items: Item[];
  observationTypes: ObsType[];
}) {
  const router = useRouter();
  const [decisions, setDecisions] = useState<Record<string, Decision>>(() =>
    Object.fromEntries(
      items.filter((i) => i.status === "draft").map((i) => [i.id, "accept" as Decision])
    )
  );
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const draftItems = items.filter((i) => i.status === "draft");
  const labItems = draftItems.filter((i) => i.itemType === "lab_observation");
  const otherItems = draftItems.filter((i) => i.itemType !== "lab_observation");
  const acceptedCount = items.filter((i) => i.status === "accepted").length;

  const typeByName = useMemo(() => {
    const m = new Map<string, ObsType>();
    for (const t of observationTypes) m.set(t.canonicalName.toLowerCase(), t);
    return m;
  }, [observationTypes]);

  function field<T>(item: Item, key: string): T {
    const edit = edits[item.id] as Record<string, unknown> | undefined;
    if (edit && key in edit) return edit[key] as T;
    return item.rawJson[key] as T;
  }

  function mappedTypeId(item: Item): string | null {
    const explicit = field<string | null>(item, "observation_type_id");
    if (explicit) return explicit;
    const canonical = (item.rawJson.canonical_name as string | null)?.toLowerCase();
    const testName = (item.rawJson.test_name as string | null)?.toLowerCase();
    return (
      (canonical && typeByName.get(canonical)?.id) ||
      (testName && typeByName.get(testName)?.id) ||
      null
    );
  }

  function setDecision(id: string, d: Decision) {
    setDecisions((prev) => ({ ...prev, [id]: d }));
  }

  function acceptAllHighConfidence() {
    setDecisions((prev) => {
      const next = { ...prev };
      for (const i of draftItems) {
        next[i.id] = (i.confidence ?? 0) >= HIGH_CONFIDENCE ? "accept" : "reject";
      }
      return next;
    });
  }

  async function reprocess() {
    setReprocessing(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/documents/${doc.id}/process`, { method: "POST" });
      if (!res.ok) throw new Error("Extraction failed again");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setReprocessing(false);
    }
  }

  async function save() {
    if (!job) return;
    setSaving(true);
    setMessage(null);
    try {
      // 1. Persist row edits
      for (const [itemId, edit] of Object.entries(edits)) {
        if (Object.keys(edit).length === 0) continue;
        const res = await fetch(`/api/extracted-items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patch: edit }),
        });
        if (!res.ok) throw new Error("Failed to save edits");
      }
      // 2. Accept / reject
      const acceptItemIds = draftItems
        .filter((i) => decisions[i.id] === "accept")
        .map((i) => i.id);
      const rejectItemIds = draftItems
        .filter((i) => decisions[i.id] === "reject")
        .map((i) => i.id);
      const res = await fetch(`/api/extractions/${job.id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptItemIds, rejectItemIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Save failed");

      if (data.unmapped?.length) {
        setMessage(
          `Confirmed ${data.accepted} values. Unmapped tests kept as drafts: ${data.unmapped.join(", ")} — map them to a canonical test and save again.`
        );
        router.refresh();
      } else {
        router.push("/labs?confirmed=" + data.accepted);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const fileUrl = `/api/documents/${doc.id}/file`;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Review extraction</h1>
          <p className="text-sm text-muted-foreground">
            {doc.filename} · {profileName} · {doc.documentDate ?? "date unknown"}
            {job?.model ? ` · model: ${job.model}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {draftItems.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={acceptAllHighConfidence}>
                Accept all high-confidence
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                Save confirmed records
              </Button>
            </>
          )}
        </div>
      </div>

      {message && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {message}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Original document */}
        <Card className="overflow-hidden py-0">
          <CardContent className="p-0">
            {doc.mimeType === "application/pdf" ? (
              <iframe src={fileUrl} className="h-[75vh] w-full" title="Document preview" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl} alt="Document" className="max-h-[75vh] w-full object-contain" />
            )}
          </CardContent>
        </Card>

        {/* Extracted values */}
        <div className="grid content-start gap-4">
          {!job && doc.extractionStatus === "pending" && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                This document hasn&apos;t been processed yet.
                <div className="mt-3">
                  <Button onClick={reprocess} disabled={reprocessing}>
                    {reprocessing && <Loader2 className="size-4 animate-spin" />}
                    Extract values
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {job?.status === "failed" && (
            <Card>
              <CardContent className="grid gap-3 py-6 text-sm">
                <p className="text-destructive">Extraction failed: {job.error}</p>
                <Button onClick={reprocess} disabled={reprocessing} className="justify-self-start">
                  {reprocessing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RotateCcw className="size-4" />
                  )}
                  Retry extraction
                </Button>
              </CardContent>
            </Card>
          )}

          {acceptedCount > 0 && draftItems.length === 0 && (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                ✅ {acceptedCount} item{acceptedCount === 1 ? "" : "s"} confirmed from this
                document. View them in{" "}
                <a className="underline" href="/labs">
                  Labs
                </a>{" "}
                and the{" "}
                <a className="underline" href="/dashboard">
                  Dashboard
                </a>
                .
              </CardContent>
            </Card>
          )}

          {labItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Lab values ({labItems.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1.5">
                {labItems.map((item) => {
                  const decision = decisions[item.id];
                  const isEditing = editing === item.id;
                  const typeId = mappedTypeId(item);
                  const value = field<number | null>(item, "value");
                  const unit = field<string | null>(item, "unit");
                  const date = field<string | null>(item, "report_date");
                  const refLow = item.rawJson.reference_low as number | null;
                  const refHigh = item.rawJson.reference_high as number | null;
                  const interp = item.rawJson.interpretation as string;

                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "rounded-lg border p-2.5 transition-colors",
                        decision === "reject" && "opacity-45",
                        !typeId && "border-amber-300 bg-amber-50/50"
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {String(item.rawJson.test_name ?? "Unknown test")}
                            {item.rawJson.canonical_name &&
                            item.rawJson.canonical_name !== item.rawJson.test_name ? (
                              <span className="ml-1 text-xs text-muted-foreground">
                                → {String(item.rawJson.canonical_name)}
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {value != null
                              ? `${value} ${unit ?? ""}`
                              : String(item.rawJson.value_text ?? "—")}
                            {refLow != null || refHigh != null
                              ? ` · ref ${refLow ?? "–"}–${refHigh ?? "–"}`
                              : ""}
                            {date ? ` · ${date}` : ""}
                            {interp && interp !== "unknown" ? (
                              <span
                                className={cn(
                                  "ml-1 font-medium",
                                  interp === "high" || interp === "critical"
                                    ? "text-red-600"
                                    : interp === "low"
                                      ? "text-blue-600"
                                      : "text-emerald-600"
                                )}
                              >
                                {interp}
                              </span>
                            ) : null}
                          </p>
                        </div>
                        {confBadge(item.confidence)}
                        <div className="flex gap-1">
                          <Button
                            size="icon-sm"
                            variant={decision === "accept" ? "default" : "outline"}
                            title="Accept"
                            onClick={() => setDecision(item.id, "accept")}
                          >
                            <Check className="size-3.5" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant={decision === "reject" ? "destructive" : "outline"}
                            title="Reject"
                            onClick={() => setDecision(item.id, "reject")}
                          >
                            <X className="size-3.5" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant={isEditing ? "secondary" : "outline"}
                            title="Edit"
                            onClick={() => setEditing(isEditing ? null : item.id)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        </div>
                      </div>

                      {!typeId && (
                        <p className="mt-1 text-xs text-amber-700">
                          Not mapped to a canonical test — pick one below or it will stay a
                          draft.
                        </p>
                      )}

                      {isEditing && (
                        <div className="mt-2 grid gap-2 border-t pt-2 sm:grid-cols-2">
                          <div className="grid gap-1">
                            <label className="text-xs text-muted-foreground">Value</label>
                            <Input
                              type="number"
                              step="any"
                              className="h-8"
                              value={value ?? ""}
                              onChange={(e) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [item.id]: {
                                    ...prev[item.id],
                                    value:
                                      e.target.value === "" ? null : Number(e.target.value),
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="grid gap-1">
                            <label className="text-xs text-muted-foreground">Unit</label>
                            <Input
                              className="h-8"
                              value={unit ?? ""}
                              onChange={(e) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], unit: e.target.value || null },
                                }))
                              }
                            />
                          </div>
                          <div className="grid gap-1">
                            <label className="text-xs text-muted-foreground">Date</label>
                            <Input
                              type="date"
                              className="h-8"
                              value={date ?? ""}
                              onChange={(e) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [item.id]: {
                                    ...prev[item.id],
                                    report_date: e.target.value || null,
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="grid gap-1">
                            <label className="text-xs text-muted-foreground">
                              Canonical test
                            </label>
                            <select
                              className="border-input h-8 rounded-md border bg-transparent px-2 text-sm"
                              value={typeId ?? ""}
                              onChange={(e) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [item.id]: {
                                    ...prev[item.id],
                                    observation_type_id: e.target.value || null,
                                  },
                                }))
                              }
                            >
                              <option value="">— unmapped —</option>
                              {observationTypes.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.canonicalName} ({t.category})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {otherItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Other extracted items ({otherItems.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1.5">
                {otherItems.map((item) => {
                  const decision = decisions[item.id];
                  const raw = item.rawJson;
                  const title =
                    item.itemType === "medication"
                      ? `${raw.brand_name ?? raw.generic_name ?? "Medication"} ${raw.strength ?? ""}`
                      : `${raw.modality ?? "Report"} — ${raw.impression ?? raw.summary ?? ""}`;
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border p-2.5",
                        decision === "reject" && "opacity-45"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium capitalize">
                          {item.itemType.replace("_", " ")}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{String(title)}</p>
                      </div>
                      {confBadge(item.confidence)}
                      <div className="flex gap-1">
                        <Button
                          size="icon-sm"
                          variant={decision === "accept" ? "default" : "outline"}
                          onClick={() => setDecision(item.id, "accept")}
                        >
                          <Check className="size-3.5" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant={decision === "reject" ? "destructive" : "outline"}
                          onClick={() => setDecision(item.id, "reject")}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
