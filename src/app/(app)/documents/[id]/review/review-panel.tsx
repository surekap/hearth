"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  classifyWarnings,
  partitionWarnings,
  warningKey,
  rowsNamedInWarning,
  type WarningKind,
} from "@/lib/extraction/warning-classify";
import { cn } from "@/lib/utils";

/**
 * An ambiguity warning names a value the extractor had to guess at. Re-reading
 * cannot settle it, so the remediation is to jump to that row and correct it;
 * the row's own `userCorrected` flag is what marks the warning answered.
 */
function AmbiguityRows({
  text,
  rows,
  onReview,
}: {
  text: string;
  rows: { id: string; name: string | null; corrected: boolean }[];
  onReview: (rowId: string) => void;
}) {
  const named = rowsNamedInWarning(text, rows);
  if (named.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No extracted row matches this note; check the source page before confirming.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {named.map((row) => (
        <Button
          key={row.id}
          size="sm"
          variant={row.corrected ? "ghost" : "outline"}
          onClick={() => onReview(row.id)}
        >
          {row.corrected ? `${row.name} corrected` : `Check ${row.name}`}
        </Button>
      ))}
    </div>
  );
}

const WARNING_LABELS: Record<WarningKind, string> = {
  missing_value: "missing value",
  partial_table: "partial table",
  ambiguity: "ambiguous",
  note: "note",
};

type Item = {
  id: string;
  itemType: string;
  status: string;
  rawJson: Record<string, unknown>;
  confidence: number | null;
  userCorrected: boolean;
};

type ObsType = { id: string; canonicalName: string; aliases: string[]; category: string };

type ClinicalImage = {
  id: string;
  status: string;
  assetKind: string;
  studyName: string | null;
  pageLabel: string | null;
  sourcePage: number | null;
  width: number | null;
  height: number | null;
};

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

function normalizeTypeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function ReviewPanel({
  document: doc,
  profileId,
  profileName,
  resolvedWarningKeys,
  job,
  items,
  images,
  observationTypes,
}: {
  profileId: string;
  resolvedWarningKeys: string[];
  document: {
    id: string;
    filename: string;
    mimeType: string;
    documentType: string;
    documentDate: string | null;
    extractionStatus: string;
  };
  profileName: string;
  job: {
    id: string;
    status: string;
    model: string | null;
    error: string | null;
    warnings: string[];
    uncertainItems: string[];
    coverage: Record<string, unknown> | null;
  } | null;
  items: Item[];
  images: ClinicalImage[];
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
  const [createMissingObservationTypes, setCreateMissingObservationTypes] = useState(true);
  const [openWarningForm, setOpenWarningForm] = useState<string | null>(null);
  const [warningDraft, setWarningDraft] = useState<{
    typeId: string;
    value: string;
    unit: string;
  }>({ typeId: "", value: "", unit: "" });
  const [savingWarning, setSavingWarning] = useState(false);
  const [locallyResolved, setLocallyResolved] = useState<string[]>([]);
  const [reextracting, setReextracting] = useState<string | null>(null);

  const draftItems = items.filter((i) => i.status === "draft");
  const labItems = draftItems.filter((i) => i.itemType === "lab_observation");
  const observationItems = draftItems.filter((i) =>
    ["lab_observation", "diagnostic_measurement"].includes(i.itemType)
  );
  const reportItems = items.filter((i) => i.itemType === "report_summary");
  const otherItems = draftItems.filter(
    (i) =>
      !["lab_observation", "diagnostic_measurement", "report_summary"].includes(i.itemType)
  );
  const acceptedCount = items.filter((i) => i.status === "accepted").length;
  const acceptedGeneticsOnly =
    acceptedCount > 0 &&
    items
      .filter((i) => i.status === "accepted")
      .every((i) =>
        ["genetic_variant", "genetic_risk", "genetic_trait", "pharmacogenomic_result"].includes(
          i.itemType
        )
      );

  const typeByName = useMemo(() => {
    const m = new Map<string, ObsType>();
    for (const t of observationTypes) {
      m.set(normalizeTypeName(t.canonicalName), t);
      for (const alias of t.aliases) m.set(normalizeTypeName(alias), t);
    }
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
    const canonical = item.rawJson.canonical_name as string | null;
    const testName = item.rawJson.test_name as string | null;
    return (
      (canonical && typeByName.get(normalizeTypeName(canonical))?.id) ||
      (testName && typeByName.get(normalizeTypeName(testName))?.id) ||
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

  const acceptedUnmappedLabCount = labItems.filter(
    (i) => decisions[i.id] === "accept" && !mappedTypeId(i)
  ).length;

  async function reprocess() {
    setReprocessing(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/documents/${doc.id}/process`, { method: "POST" });
      if (!res.ok) throw new Error("Extraction could not be queued");
      setMessage("Extraction queued.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Extraction could not be queued");
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
      const acceptedDrafts = draftItems.filter((i) => decisions[i.id] === "accept");
      const rejectItemIds = draftItems
        .filter((i) => decisions[i.id] === "reject")
        .map((i) => i.id);
      const res = await fetch(`/api/extractions/${job.id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acceptItemIds,
          rejectItemIds,
          createMissingObservationTypes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Save failed");

      if (data.unmapped?.length) {
        const createdCount = data.createdObservationTypes?.length ?? 0;
        setMessage(
          `Confirmed ${data.accepted} values${createdCount ? ` and created ${createdCount} canonical tests` : ""}. Unmapped tests kept as drafts: ${data.unmapped.join(", ")} — map them to a canonical test and save again.`
        );
        router.refresh();
      } else {
        const geneticsOnly =
          acceptedDrafts.length > 0 &&
          acceptedDrafts.every((i) =>
            ["genetic_variant", "genetic_risk", "genetic_trait", "pharmacogenomic_result"].includes(
              i.itemType
            )
          );
        router.push(`${geneticsOnly ? "/genetics" : "/metrics"}?confirmed=${data.accepted}`);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const fileUrl = `/api/documents/${doc.id}/file`;

  // Warnings and uncertain items are the same kind of signal to the reader, so
  // they are classified together and split by whether anything can be done.
  const classifiedWarnings = partitionWarnings(
    classifyWarnings([...(job?.warnings ?? []), ...(job?.uncertainItems ?? [])])
  );
  const resolvedKeys = new Set([...resolvedWarningKeys, ...locallyResolved]);

  // Rows an ambiguity warning can point at. An ambiguity cannot be re-read away
  // — the document is genuinely unclear — so the remediation is the user
  // correcting the row, and `userCorrected` is what marks it settled.
  const namedRowCandidates = observationItems.map((item) => ({
    id: item.id,
    name: (item.rawJson.canonical_name ?? item.rawJson.test_name ?? null) as string | null,
    corrected: item.userCorrected,
  }));

  async function reextractPage(warningText: string, page: number) {
    const key = warningKey(warningText);
    setReextracting(key);
    setMessage(null);
    try {
      const res = await fetch(`/api/extractions/${job?.id}/reextract-page`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageStart: page, pageEnd: page }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Could not re-read that page.");
      setMessage(
        body.added > 0
          ? `Re-read page ${page}: ${body.added} new value${body.added === 1 ? "" : "s"} added below for review.`
          : `Re-read page ${page}: nothing new found beyond what is already extracted.`
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not re-read that page.");
    } finally {
      setReextracting(null);
    }
  }

  async function submitMissingValue(warningText: string) {
    const key = warningKey(warningText);
    const numeric = Number.parseFloat(warningDraft.value);
    if (!warningDraft.typeId) {
      setMessage("Choose which test this value belongs to.");
      return;
    }
    if (!Number.isFinite(numeric)) {
      setMessage("Enter a numeric value.");
      return;
    }
    // Dating an old report's value as today would put it at the wrong end of
    // every trend, so refuse rather than guess.
    if (!doc.documentDate) {
      setMessage("Set this document's report date before adding values to it.");
      return;
    }
    setSavingWarning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          observationTypeId: warningDraft.typeId,
          // The value belongs to the document's clinical date, not to today.
          observedAt: new Date(doc.documentDate).toISOString(),
          valueNumeric: numeric,
          unit: warningDraft.unit.trim() || null,
          documentId: doc.id,
          resolvesWarning: key,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Could not save the value.");
      }
      setLocallyResolved((prev) => [...prev, key]);
      setOpenWarningForm(null);
      setWarningDraft({ typeId: "", value: "", unit: "" });
      setMessage("Value added and linked to this report.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the value.");
    } finally {
      setSavingWarning(false);
    }
  }

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

      {job?.coverage && (
        <div className="grid gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm sm:grid-cols-3">
          <span>
            Pages: {String(job.coverage.pages_processed ?? "?")}/
            {String(job.coverage.pages_total ?? "?")}
          </span>
          <span>
            Sections: {String(job.coverage.sections_extracted ?? "?")}/
            {String(job.coverage.sections_detected ?? "?")}
          </span>
          <span>
            Unmatched pages: {Array.isArray(job.coverage.unmatched_pages)
              ? job.coverage.unmatched_pages.length
              : 0}
          </span>
        </div>
      )}

      {classifiedWarnings.attention.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="text-base">
              Extraction attention needed ({classifiedWarnings.attention.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {classifiedWarnings.attention.map((entry, index) => {
              const key = warningKey(entry.text);
              const resolved = resolvedKeys.has(key);
              const formOpen = openWarningForm === key;
              return (
                <div key={`attention-${index}`} className="grid gap-1.5">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 text-[10px] capitalize",
                        resolved && "border-emerald-400 text-emerald-700"
                      )}
                    >
                      {resolved ? "resolved" : WARNING_LABELS[entry.kind]}
                    </Badge>
                    <span className={cn("min-w-0 flex-1", resolved && "text-muted-foreground")}>
                      {entry.text}
                    </span>
                    {entry.page !== null && (
                      <a
                        href={`${fileUrl}#page=${entry.page}`}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 font-medium underline underline-offset-2"
                      >
                        View page {entry.page}
                      </a>
                    )}
                    {entry.kind === "missing_value" && !resolved && !formOpen && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => {
                          setOpenWarningForm(key);
                          setWarningDraft({ typeId: "", value: "", unit: "" });
                        }}
                      >
                        Add the value
                      </Button>
                    )}

                    {entry.kind === "partial_table" && entry.page !== null && job?.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        disabled={reextracting !== null}
                        onClick={() => reextractPage(entry.text, entry.page as number)}
                      >
                        {reextracting === key ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          `Re-read page ${entry.page}`
                        )}
                      </Button>
                    )}
                  </div>

                  {entry.kind === "partial_table" && entry.page === null && (
                    <p className="text-xs text-muted-foreground">
                      No page is named, so this one needs a look at the source document.
                    </p>
                  )}

                  {entry.kind === "ambiguity" && (
                    <AmbiguityRows
                      text={entry.text}
                      rows={namedRowCandidates}
                      onReview={(rowId) => {
                        setEditing(rowId);
                        document
                          .getElementById(`item-${rowId}`)
                          ?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                    />
                  )}

                  {formOpen && (
                    <div className="grid gap-2 rounded-md border bg-background p-2.5 sm:grid-cols-[2fr_1fr_1fr_auto]">
                      <select
                        aria-label="Test"
                        className="h-9 rounded-md border bg-transparent px-2 text-sm"
                        value={warningDraft.typeId}
                        disabled={savingWarning}
                        onChange={(e) =>
                          setWarningDraft((d) => ({ ...d, typeId: e.target.value }))
                        }
                      >
                        <option value="">Which test?</option>
                        {observationTypes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.canonicalName}
                          </option>
                        ))}
                      </select>
                      <Input
                        aria-label="Value"
                        placeholder="Value"
                        inputMode="decimal"
                        value={warningDraft.value}
                        disabled={savingWarning}
                        onChange={(e) =>
                          setWarningDraft((d) => ({ ...d, value: e.target.value }))
                        }
                      />
                      <Input
                        aria-label="Unit"
                        placeholder="Unit"
                        value={warningDraft.unit}
                        disabled={savingWarning}
                        onChange={(e) => setWarningDraft((d) => ({ ...d, unit: e.target.value }))}
                      />
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          disabled={savingWarning}
                          onClick={() => submitMissingValue(entry.text)}
                        >
                          {savingWarning ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={savingWarning}
                          onClick={() => setOpenWarningForm(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {classifiedWarnings.notes.length > 0 && (
        <details className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Extraction notes ({classifiedWarnings.notes.length})
          </summary>
          <div className="mt-2 grid gap-1.5 text-muted-foreground">
            {classifiedWarnings.notes.map((entry, index) => (
              <p key={`note-${index}`}>{entry.text}</p>
            ))}
          </div>
        </details>
      )}

      {acceptedUnmappedLabCount > 0 && (
        <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <input
            type="checkbox"
            className="mt-0.5 size-4"
            checked={createMissingObservationTypes}
            disabled={saving}
            onChange={(e) => setCreateMissingObservationTypes(e.target.checked)}
          />
          <span>
            Create canonical tests for {acceptedUnmappedLabCount} accepted unmapped lab row
            {acceptedUnmappedLabCount === 1 ? "" : "s"}.
          </span>
        </label>
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
                This document is waiting for extraction.
                <div className="mt-3">
                  <Button onClick={reprocess} disabled={reprocessing}>
                    {reprocessing && <Loader2 className="size-4 animate-spin" />}
                    Queue extraction
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {job && (job.status === "pending" || job.status === "processing") && (
            <Card>
              <CardContent className="grid gap-3 py-6 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  {job.status === "pending"
                    ? "Extraction is queued."
                    : "Extraction is running. There is nothing to finalize until draft findings appear here."}
                </p>
                <p>
                  For a genetic report, useful extracted data should appear as genetic risks,
                  traits, variants, or pharmacogenomic findings rather than lab values.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => router.refresh()}>
                    Refresh status
                  </Button>
                  <Button size="sm" onClick={reprocess} disabled={reprocessing}>
                    {reprocessing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RotateCcw className="size-4" />
                    )}
                    Retry extraction
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {!job && doc.extractionStatus !== "pending" && acceptedCount === 0 && (
            <Card>
              <CardContent className="grid gap-3 py-6 text-sm text-muted-foreground">
                <p>
                  No extraction job was found for this document, so there are no rows to confirm
                  yet.
                </p>
                <Button onClick={reprocess} disabled={reprocessing} className="justify-self-start">
                  {reprocessing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RotateCcw className="size-4" />
                  )}
                  Queue extraction
                </Button>
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
                  Queue retry
                </Button>
              </CardContent>
            </Card>
          )}

          {job?.status === "needs_review" && draftItems.length === 0 && acceptedCount === 0 && (
            <Card>
              <CardContent className="grid gap-3 py-6 text-sm text-muted-foreground">
                <p>
                  No structured rows were extracted from this document. If this is a genetic
                  report and the model is mock, Hearth will not invent lab values or genetic
                  findings.
                </p>
                <Button onClick={reprocess} disabled={reprocessing} className="justify-self-start">
                  {reprocessing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RotateCcw className="size-4" />
                  )}
                  Queue retry
                </Button>
              </CardContent>
            </Card>
          )}

          {images.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Protected report images ({images.length})
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Full source pages are retained so scan labels, scale, legends, and acquisition context
                  stay attached. Confirming this extraction makes them available in Scans for comparison.
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {images.map((image) => (
                    <a
                      key={image.id}
                      href={`/api/clinical-images/${image.id}/file`}
                      target="_blank"
                      rel="noreferrer"
                      className="overflow-hidden rounded-lg border bg-muted/20 transition-colors hover:border-primary"
                    >
                      <Image
                        unoptimized
                        src={`/api/clinical-images/${image.id}/file`}
                        alt={image.pageLabel ?? "Clinical report page"}
                        width={image.width ?? 1278}
                        height={image.height ?? 1808}
                        className="aspect-[0.707] w-full bg-white object-cover object-top"
                      />
                      <span className="block border-t p-2 text-xs">
                        <span className="block truncate font-medium">
                          {image.studyName ?? image.assetKind}
                        </span>
                        <span className="text-muted-foreground">
                          {image.sourcePage ? `Source page ${image.sourcePage}` : "Uploaded image"} · {image.status}
                        </span>
                      </span>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {reportItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Reports found ({reportItems.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {reportItems.map((item) => {
                  const raw = item.rawJson;
                  const findings = Array.isArray(raw.findings) ? raw.findings : [];
                  const measurements = Array.isArray(raw.measurements) ? raw.measurements : [];
                  const pageStart = raw.page_start as number | null;
                  const pageEnd = raw.page_end as number | null;
                  return (
                    <div key={item.id} className="rounded-lg border p-3 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">
                            {String(raw.study_name ?? raw.modality ?? "Clinical report")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {String(raw.report_type ?? "other")}
                            {pageStart ? ` · page ${pageStart}${pageEnd && pageEnd !== pageStart ? `–${pageEnd}` : ""}` : ""}
                            {` · ${findings.length} findings · ${measurements.length} measurements`}
                          </p>
                        </div>
                        {item.status === "draft" ? (
                          <div className="flex gap-1">
                            <Button
                              size="icon-sm"
                              variant={decisions[item.id] === "accept" ? "default" : "outline"}
                              title="Accept report"
                              onClick={() => setDecision(item.id, "accept")}
                            >
                              <Check className="size-3.5" />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant={decisions[item.id] === "reject" ? "destructive" : "outline"}
                              title="Reject report"
                              onClick={() => setDecision(item.id, "reject")}
                            >
                              <X className="size-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <Badge>accepted</Badge>
                        )}
                      </div>
                      {Boolean(raw.impression || raw.summary) && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {String(raw.impression ?? raw.summary)}
                        </p>
                      )}
                      {(findings.length > 0 || measurements.length > 0) && (
                        <details className="mt-2 text-xs">
                          <summary className="cursor-pointer text-primary">
                            View extracted findings and measurements
                          </summary>
                          {findings.length > 0 && (
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                              {findings.map((finding, index) => (
                                <li key={`${item.id}-finding-${index}`}>{String(finding)}</li>
                              ))}
                            </ul>
                          )}
                          {measurements.length > 0 && (
                            <div className="mt-2 grid gap-1">
                              {measurements.map((measurement, index) => {
                                const row = measurement as Record<string, unknown>;
                                return (
                                  <p key={`${item.id}-measurement-${index}`}>
                                    {String(row.name ?? "Measurement")}: {String(row.value ?? row.value_text ?? "—")} {String(row.unit ?? "")}
                                    {row.page_number ? ` · page ${String(row.page_number)}` : ""}
                                  </p>
                                );
                              })}
                            </div>
                          )}
                        </details>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {acceptedCount > 0 && draftItems.length === 0 && (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                ✅ {acceptedCount} item{acceptedCount === 1 ? "" : "s"} confirmed from this
                document. View them in{" "}
                <Link className="underline" href={acceptedGeneticsOnly ? "/genetics" : "/metrics"}>
                  {acceptedGeneticsOnly ? "Genetics" : "Measurements"}
                </Link>{" "}
                {!acceptedGeneticsOnly && (
                  <>
                    and the{" "}
                    <Link className="underline" href="/dashboard">
                      Dashboard
                    </Link>
                  </>
                )}
                .
              </CardContent>
            </Card>
          )}

          {observationItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Structured measurements ({observationItems.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1.5">
                {observationItems.map((item) => {
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
                      // Anchor for the "Check <test>" action on ambiguity warnings.
                      id={`item-${item.id}`}
                      className={cn(
                        "rounded-lg border p-2.5 transition-colors",
                        decision === "reject" && "opacity-45",
                        !typeId && "border-amber-300 bg-amber-50/50",
                        isEditing && "ring-2 ring-primary/40"
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
                          {Boolean(item.rawJson.study_name || item.rawJson.page_number) && (
                            <p className="text-xs text-muted-foreground">
                              {item.rawJson.study_name ? String(item.rawJson.study_name) : "Source"}
                              {item.rawJson.page_number
                                ? ` · page ${String(item.rawJson.page_number)}`
                                : ""}
                            </p>
                          )}
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
                          {createMissingObservationTypes && decision === "accept"
                            ? "Will create a canonical test when saved."
                            : "Not mapped to a canonical test — pick one below or it will stay a draft."}
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
                  let title: string;
                  if (item.itemType === "medication") {
                    title = `${raw.brand_name ?? raw.generic_name ?? "Medication"} ${raw.strength ?? ""}`;
                  } else if (item.itemType === "genetic_variant") {
                    title = `${raw.gene ?? raw.variant_id ?? "Variant"} ${raw.genotype ?? ""}`;
                  } else if (item.itemType === "genetic_risk" || item.itemType === "genetic_trait") {
                    title = `${raw.condition_name ?? "Genetic risk"} — ${raw.assessment ?? raw.risk_level ?? ""}`;
                  } else if (item.itemType === "pharmacogenomic_result") {
                    title = `${raw.drug_name ?? "Medication"} — ${raw.implication ?? ""}`;
                  } else if (item.itemType === "diagnosis") {
                    title = [raw.condition_name ?? "Condition", raw.severity]
                      .filter(Boolean)
                      .join(" · ");
                    if (raw.certainty && raw.certainty !== "confirmed") {
                      title += ` (${String(raw.certainty).replace("_", " ")})`;
                    }
                  } else {
                    title = `${raw.modality ?? "Report"} — ${raw.impression ?? raw.summary ?? ""}`;
                  }
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
