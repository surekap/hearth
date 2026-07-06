"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  CloudUpload,
  FileText,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const DOC_TYPES = [
  { value: "auto", label: "Auto-detect" },
  { value: "lab_report", label: "Lab report" },
  { value: "prescription", label: "Prescription" },
  { value: "imaging", label: "Imaging" },
  { value: "specialist_report", label: "Specialist report" },
  { value: "discharge_summary", label: "Discharge summary" },
  { value: "genetic_report", label: "Genetic report" },
  { value: "invoice", label: "Invoice" },
  { value: "other", label: "Other" },
];

const SOURCES = [
  { value: "apollo", label: "Apollo" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "camera", label: "Camera" },
  { value: "files", label: "Files" },
  { value: "manual", label: "Manual" },
  { value: "unknown", label: "Other / unknown" },
];

type QueueStatus = "waiting" | "uploading" | "queued" | "duplicate" | "error";

type QueueItem = {
  id: string;
  file: File;
  status: QueueStatus;
  documentId?: string;
  error?: string;
};

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function statusBadge(item: QueueItem) {
  switch (item.status) {
    case "queued":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="size-3.5" />
          queued
        </span>
      );
    case "duplicate":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
          <Clock3 className="size-3.5" />
          duplicate
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
          <AlertCircle className="size-3.5" />
          failed
        </span>
      );
    case "uploading":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
          <Loader2 className="size-3.5 animate-spin" />
          uploading
        </span>
      );
    default:
      return <span className="text-xs font-medium text-muted-foreground">waiting</span>;
  }
}

export function UploadForm({
  profiles,
  defaultProfileId,
}: {
  profiles: { id: string; displayName: string }[];
  defaultProfileId: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profileId, setProfileId] = useState(defaultProfileId);
  const [docType, setDocType] = useState("auto");
  const [source, setSource] = useState("files");
  const [docDate, setDocDate] = useState("");

  const addFiles = useCallback((files: FileList | File[]) => {
    const next = Array.from(files).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
      status: "waiting" as const,
    }));
    setItems((current) => [...current, ...next]);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  function updateItem(id: string, patch: Partial<QueueItem>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function uploadItem(item: QueueItem) {
    updateItem(item.id, { status: "uploading", error: undefined });
    const fd = new FormData();
    fd.set("file", item.file);
    fd.set("profileId", profileId);
    fd.set("documentType", docType === "auto" ? "other" : docType);
    fd.set("source", source);
    if (docDate) fd.set("documentDate", docDate);

    const res = await fetch("/api/documents/upload", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.documentId) {
      updateItem(item.id, { status: "duplicate", documentId: data.documentId });
      return;
    }
    if (!res.ok) {
      throw new Error(typeof data.error === "string" ? data.error : "Upload failed");
    }
    updateItem(item.id, {
      status: "queued",
      documentId: data.document?.id as string | undefined,
    });
  }

  async function submit() {
    if (items.length === 0 || !profileId) return;
    setError(null);
    setUploading(true);
    const uploadable = items.filter((item) => item.status === "waiting" || item.status === "error");
    try {
      for (const item of uploadable) {
        try {
          await uploadItem(item);
        } catch (e) {
          updateItem(item.id, {
            status: "error",
            error: e instanceof Error ? e.message : "Upload failed",
          });
        }
      }
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  const queuedCount = items.filter((item) => item.status === "queued").length;
  const failedCount = items.filter((item) => item.status === "error").length;
  const busy = uploading || items.some((item) => item.status === "uploading");

  return (
    <Card>
      <CardContent className="grid gap-5">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-all duration-200 sm:p-12",
            dragOver ? "border-primary bg-primary/10 shadow-inner" : "border-muted-foreground/25",
            items.length > 0 && "border-primary/50 bg-primary/10"
          )}
        >
          <span className="flex size-14 items-center justify-center rounded-lg bg-accent text-primary transition-transform group-hover:-translate-y-1">
            <CloudUpload className="size-7" />
          </span>
          <p className="font-heading text-lg font-medium">
            {items.length > 0
              ? `${items.length} file${items.length === 1 ? "" : "s"} selected`
              : "Drop PDFs or images here"}
          </p>
          <p className="max-w-sm text-xs leading-5 text-muted-foreground">
            PDF, JPG, PNG, WebP · max 20MB each
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.currentTarget.value = "";
            }}
          />
        </div>

        {items.length > 0 && (
          <div className="grid gap-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg border bg-background/70 px-3 py-2"
              >
                <span className="flex size-9 items-center justify-center rounded-md bg-accent text-primary">
                  <FileText className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(item.file.size)}
                    {item.error ? ` · ${item.error}` : ""}
                    {item.documentId ? (
                      <>
                        {" · "}
                        <Link
                          href={`/documents/${item.documentId}/review`}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          Review
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
                {statusBadge(item)}
                {item.status === "waiting" || item.status === "error" ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      setItems((current) => current.filter((candidate) => candidate.id !== item.id))
                    }
                  >
                    <X className="size-3.5" />
                  </Button>
                ) : (
                  <span className="size-7" />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Profile</Label>
            <select
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              disabled={busy}
              className="border-input h-9 rounded-lg border bg-background/75 px-3 text-sm shadow-xs outline-none transition-all focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label>Document type</Label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              disabled={busy}
              className="border-input h-9 rounded-lg border bg-background/75 px-3 text-sm shadow-xs outline-none transition-all focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label>Source</Label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              disabled={busy}
              className="border-input h-9 rounded-lg border bg-background/75 px-3 text-sm shadow-xs outline-none transition-all focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label>Document date</Label>
            <Input
              type="date"
              value={docDate}
              disabled={busy}
              onChange={(e) => setDocDate(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {(queuedCount > 0 || failedCount > 0) && (
          <p className="rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            {queuedCount > 0 ? `${queuedCount} queued for extraction.` : ""}
            {queuedCount > 0 && failedCount > 0 ? " " : ""}
            {failedCount > 0 ? `${failedCount} failed.` : ""}
          </p>
        )}

        <Button
          onClick={submit}
          disabled={items.length === 0 || busy || items.every((item) => item.status === "queued")}
          size="lg"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {busy ? "Uploading queue…" : "Upload queue"}
        </Button>
      </CardContent>
    </Card>
  );
}
