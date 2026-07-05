"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, FileText, Loader2 } from "lucide-react";
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

type Stage = "idle" | "uploading" | "processing";

export function UploadForm({
  profiles,
  defaultProfileId,
}: {
  profiles: { id: string; displayName: string }[];
  defaultProfileId: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);

  const [profileId, setProfileId] = useState(defaultProfileId);
  const [docType, setDocType] = useState("auto");
  const [source, setSource] = useState("files");
  const [docDate, setDocDate] = useState("");

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  }, []);

  async function submit() {
    if (!file || !profileId) return;
    setError(null);
    setStage("uploading");
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("profileId", profileId);
      fd.set("documentType", docType === "auto" ? "other" : docType);
      fd.set("source", source);
      if (docDate) fd.set("documentDate", docDate);

      const res = await fetch("/api/documents/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (res.status === 409 && data.documentId) {
        setError("This file was already uploaded. Opening the existing document…");
        router.push(`/documents/${data.documentId}/review`);
        return;
      }
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Upload failed");
      }

      const docId = data.document.id as string;
      setStage("processing");
      const proc = await fetch(`/api/documents/${docId}/process`, { method: "POST" });
      if (!proc.ok) {
        // Extraction failed but the document is stored; review page shows status.
        const p = await proc.json().catch(() => ({}));
        console.error("processing failed", p);
      }
      router.push(`/documents/${docId}/review`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStage("idle");
    }
  }

  const busy = stage !== "idle";

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
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25",
            file && "border-primary/50 bg-primary/5"
          )}
        >
          {file ? (
            <>
              <FileText className="size-8 text-primary" />
              <p className="font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(2)} MB — click to change
              </p>
            </>
          ) : (
            <>
              <CloudUpload className="size-8 text-muted-foreground" />
              <p className="font-medium">Drop a PDF or image here</p>
              <p className="text-xs text-muted-foreground">
                or click to browse · PDF, JPG, PNG, WebP · max 20MB
              </p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Profile</Label>
            <select
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
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
              className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
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
              className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
            >
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label>Document date (optional, auto-detected)</Label>
            <Input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={submit} disabled={!file || busy} size="lg">
          {stage === "uploading" && <Loader2 className="size-4 animate-spin" />}
          {stage === "processing" && <Loader2 className="size-4 animate-spin" />}
          {stage === "idle" && "Upload & extract"}
          {stage === "uploading" && "Uploading…"}
          {stage === "processing" && "Extracting values… (can take ~30s)"}
        </Button>
      </CardContent>
    </Card>
  );
}
