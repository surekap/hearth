"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, Pill, Plus, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/mascot";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Recent = {
  nameText: string;
  dose: string | null;
  frequency: string | null;
  courseStartDate: string | null;
  courseEndDate: string | null;
  courseDurationText: string | null;
  lastUsedAt: string;
  useCount: number;
};

type Event = {
  id: string;
  nameText: string;
  dose: string | null;
  frequency: string | null;
  courseStartDate: string | null;
  courseEndDate: string | null;
  courseDurationText: string | null;
  eventType: string;
  eventTime: string;
  notes: string | null;
};

type SearchResult = {
  id: string;
  name: string;
  strength: string | null;
  form: string;
};

const EVENT_LABEL: Record<string, string> = {
  prescribed: "prescribed",
  started: "started",
  stopped: "stopped",
  intake_logged: "taken",
  skipped: "skipped",
  dose_changed: "dose changed",
};

const EVENT_TONE: Record<string, string> = {
  prescribed: "bg-primary/10 text-primary",
  started: "bg-[var(--success)]/15 text-[color-mix(in_oklch,var(--success),black_28%)]",
  stopped: "bg-destructive/10 text-destructive",
  intake_logged: "bg-secondary text-secondary-foreground",
  skipped: "bg-[var(--warning)]/20 text-[color-mix(in_oklch,var(--warning),black_38%)]",
  dose_changed: "bg-[var(--chart-5)]/12 text-[var(--chart-5)]",
};

function todayDateOnly() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function isExpired(endDate: string | null) {
  return !!endDate && endDate < todayDateOnly();
}

function formatDate(date: string | null) {
  if (!date) return null;
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function MedsView({
  profileId,
  profileName,
  recents,
  events,
}: {
  profileId: string;
  profileName: string;
  recents: Recent[];
  events: Event[];
}) {
  const router = useRouter();
  const [logging, setLogging] = useState<string | null>(null);
  const [justLogged, setJustLogged] = useState<string | null>(null);
  const [pendingQuickLog, setPendingQuickLog] = useState<Recent | null>(null);
  const [pendingUndo, setPendingUndo] = useState<Event | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Manual add form
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [frequency, setFrequency] = useState("");
  const [courseStartDate, setCourseStartDate] = useState("");
  const [courseEndDate, setCourseEndDate] = useState("");
  const [courseDurationText, setCourseDurationText] = useState("");
  const [eventType, setEventType] = useState("started");
  const [results, setResults] = useState<SearchResult[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (name.trim().length < 2) {
      return;
    }
    searchTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/medications/search?q=${encodeURIComponent(name)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results);
      }
    }, 250);
  }, [name]);

  async function quickLog(r: Recent) {
    setLogging(r.nameText);
    try {
      const res = await fetch("/api/medications/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          nameText: r.nameText,
          dose: r.dose,
          frequency: r.frequency,
          eventType: "intake_logged",
        }),
      });
      if (res.ok) {
        setPendingQuickLog(null);
        setJustLogged(r.nameText);
        setTimeout(() => setJustLogged(null), 2000);
        router.refresh();
      } else if (res.status === 409) {
        openManualEntry(r, "intake_logged");
      }
    } finally {
      setLogging(null);
    }
  }

  function resetManualForm() {
    setName("");
    setDose("");
    setFrequency("");
    setCourseStartDate("");
    setCourseEndDate("");
    setCourseDurationText("");
    setEventType("started");
  }

  function openManualEntry(recent?: Recent, nextEventType = "started") {
    setPendingQuickLog(null);
    if (recent) {
      setName(recent.nameText);
      setDose(recent.dose ?? "");
      setFrequency(recent.frequency ?? "");
      setCourseStartDate(recent.courseStartDate ?? "");
      setCourseEndDate(recent.courseEndDate ?? "");
      setCourseDurationText(recent.courseDurationText ?? "");
      setEventType(nextEventType);
    }
    setAddOpen(true);
  }

  async function addMedication() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/medications/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          nameText: name.trim(),
          dose: dose || null,
          frequency: frequency || null,
          courseStartDate: courseStartDate || null,
          courseEndDate: courseEndDate || null,
          courseDurationText: courseDurationText || null,
          eventType,
          addToDictionary: true,
          allowAfterCourseEnd: true,
        }),
      });
      if (res.ok) {
        setAddOpen(false);
        resetManualForm();
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function undoTaken(event: Event) {
    setUndoing(event.id);
    try {
      const res = await fetch(`/api/medications/events/${event.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setPendingUndo(null);
        router.refresh();
      }
    } finally {
      setUndoing(null);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge className="mb-2 bg-accent text-accent-foreground" variant="secondary">
            Meds
          </Badge>
          <h1 className="text-3xl font-semibold">Medications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {profileName}&apos;s medicines — one tap to log a dose
          </p>
        </div>
        <Dialog
          open={addOpen}
          onOpenChange={(open) => {
            setAddOpen(open);
            if (!open) resetManualForm();
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              Add medicine
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a medicine</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="relative grid gap-1.5">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (e.target.value.trim().length < 2) setResults([]);
                  }}
                  placeholder="Search or type a name…"
                  autoFocus
                />
                {results.length > 0 && (
                  <div className="absolute top-full z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
                    {results.map((r) => (
                      <button
                        key={r.id}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => {
                          setName(r.name);
                          if (r.strength) setDose(r.strength);
                          setResults([]);
                        }}
                      >
                        <Pill className="size-3.5 text-muted-foreground" />
                        {r.name}
                        {r.strength && (
                          <span className="text-xs text-muted-foreground">{r.strength}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Dose</Label>
                  <Input
                    value={dose}
                    onChange={(e) => setDose(e.target.value)}
                    placeholder="500 mg"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Frequency</Label>
                  <Input
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value)}
                    placeholder="1-0-1 after food"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Event</Label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="border-input h-9 rounded-lg border bg-background/75 px-3 text-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="started">Started taking</option>
                  <option value="prescribed">Prescribed</option>
                  <option value="intake_logged">Took a dose now</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Start date</Label>
                  <Input
                    type="date"
                    value={courseStartDate}
                    onChange={(e) => setCourseStartDate(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>End date</Label>
                  <Input
                    type="date"
                    value={courseEndDate}
                    onChange={(e) => setCourseEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Duration</Label>
                <Input
                  value={courseDurationText}
                  onChange={(e) => setCourseDurationText(e.target.value)}
                  placeholder="2 weeks"
                />
              </div>
              <Button onClick={addMedication} disabled={saving || !name.trim()}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Quick log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick log</CardTitle>
        </CardHeader>
        <CardContent>
          {recents.length === 0 ? (
            <EmptyState
              mood="thinking"
              title="No recent medicines"
              description="Add one manually or accept a prescription from review. After that, each medicine becomes one-tap loggable here."
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {recents.map((r) => {
                const ended = isExpired(r.courseEndDate);
                return (
                  <button
                    key={r.nameText}
                    onClick={() =>
                      ended ? openManualEntry(r, "intake_logged") : setPendingQuickLog(r)
                    }
                    disabled={logging !== null}
                    className={cn(
                      "flex min-h-10 items-center gap-2 rounded-lg border px-3.5 py-2 text-sm shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/5",
                      justLogged === r.nameText &&
                        "border-[var(--success)] bg-[var(--success)]/10",
                      ended && "border-[var(--warning)]/60 bg-[var(--warning)]/10"
                    )}
                  >
                    {logging === r.nameText ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : justLogged === r.nameText ? (
                      <Check className="size-3.5 text-[var(--success)]" />
                    ) : ended ? (
                      <AlertTriangle className="size-3.5 text-[var(--warning)]" />
                    ) : (
                      <Pill className="size-3.5 text-primary" />
                    )}
                    <span className="font-medium">{r.nameText}</span>
                    {r.dose && <span className="text-xs text-muted-foreground">{r.dose}</span>}
                    {ended && (
                      <span className="text-xs text-muted-foreground">
                        ended {formatDate(r.courseEndDate)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={pendingQuickLog !== null}
        onOpenChange={(open) => !open && setPendingQuickLog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as taken?</DialogTitle>
            <DialogDescription>
              This will log a taken dose for {pendingQuickLog?.nameText}
              {pendingQuickLog?.dose ? `, ${pendingQuickLog.dose}` : ""}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={logging !== null}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={() => pendingQuickLog && quickLog(pendingQuickLog)}
              disabled={logging !== null}
            >
              {logging !== null && <Loader2 className="size-4 animate-spin" />}
              Mark taken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingUndo !== null}
        onOpenChange={(open) => !open && setPendingUndo(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Undo taken dose?</DialogTitle>
            <DialogDescription>
              This will remove the taken entry for {pendingUndo?.nameText}
              {pendingUndo?.dose ? `, ${pendingUndo.dose}` : ""}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={undoing !== null}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => pendingUndo && undoTaken(pendingUndo)}
              disabled={undoing !== null}
            >
              {undoing !== null && <Loader2 className="size-4 animate-spin" />}
              Undo taken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">History</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1.5">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No medication events yet.</p>
          ) : (
            events.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-lg border bg-card/70 p-2.5 transition-colors hover:bg-accent/35">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                  <Pill className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {e.nameText}
                    {e.dose ? (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        {e.dose}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(e.eventTime).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {e.frequency ? ` · ${e.frequency}` : ""}
                    {e.courseEndDate ? ` · ends ${formatDate(e.courseEndDate)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge className={EVENT_TONE[e.eventType]} variant="secondary">
                    {EVENT_LABEL[e.eventType]}
                  </Badge>
                  {e.eventType === "intake_logged" && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setPendingUndo(e)}
                      disabled={undoing !== null}
                      aria-label={`Undo taken dose for ${e.nameText}`}
                    >
                      {undoing === e.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="size-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
