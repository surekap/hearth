"use client";

import { useRef, useState } from "react";
import { Loader2, Send, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/mascot";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Message = {
  role: "user" | "assistant";
  content: string;
  meta?: {
    model: string;
    observationCount: number;
    reportCount: number;
    timeRange: { from: string | null; to: string | null };
  };
};

const SUGGESTIONS = [
  "Which of my values are abnormal right now?",
  "How has my ALT trended over time?",
  "Summarize my metabolic health",
  "What should I ask my doctor at the next visit?",
];

/** Minimal markdown: **bold** and line breaks. */
function renderAnswer(text: string) {
  return text.split("\n").map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((seg, j) =>
      seg.startsWith("**") && seg.endsWith("**") ? (
        <strong key={j}>{seg.slice(2, -2)}</strong>
      ) : (
        <span key={j}>{seg}</span>
      )
    );
    return (
      <p key={i} className={cn("min-h-[0.5em]", line.startsWith("**") && "mt-2")}>
        {parts}
      </p>
    );
  });
}

export function AskView({
  profileId,
  profileName,
}: {
  profileId: string;
  profileName: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setError(null);
    setBusy(true);
    setInput("");
    setMessages((m) => [...m, { role: "user", content: question }]);
    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, question }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Request failed");
      }
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.answer, meta: data.meta },
      ]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <div>
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
          <Sparkles className="size-3.5" />
          Ask AI
        </div>
        <h1 className="text-3xl font-semibold">Ask about {profileName}&apos;s health</h1>
        <p className="mt-2 flex items-start gap-1.5 text-sm leading-6 text-muted-foreground">
          <ShieldCheck className="size-4" />
          Uses only {profileName}&apos;s confirmed data · PII removed before the AI sees it ·
          every question is audit-logged
        </p>
      </div>

      <Card className="border-[color-mix(in_oklch,var(--warning),white_35%)] bg-[var(--warning)]/12 py-3">
        <CardContent className="px-4 text-xs leading-5 text-[color-mix(in_oklch,var(--warning),black_45%)]">
          This assistant summarizes your own records. It is not a doctor, does not diagnose,
          and never advises starting or stopping medication.
        </CardContent>
      </Card>

      {messages.length === 0 && (
        <div className="grid gap-3 rounded-lg border bg-card/70 p-4">
          <EmptyState
            mood="happy"
            title="What would you like to understand?"
            description="Pip can help draft questions and summarize confirmed records, while keeping medical judgment with your clinician."
          />
          <div className="flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="rounded-lg border bg-background/80 px-3 py-2 text-sm font-medium text-muted-foreground shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:bg-accent hover:text-foreground"
            >
              {s}
            </button>
          ))}
          </div>
        </div>
      )}

      <div className="grid gap-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[92%] rounded-2xl px-4 py-3 text-sm",
              m.role === "user"
                ? "justify-self-end rounded-br-lg bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "justify-self-start rounded-bl-lg border bg-card shadow-sm"
            )}
          >
            {m.role === "assistant" ? renderAnswer(m.content) : m.content}
            {m.meta && (
              <p className="mt-2 border-t pt-1.5 text-[11px] text-muted-foreground">
                {m.meta.observationCount} values · {m.meta.reportCount} reports
                {m.meta.timeRange.from
                  ? ` · ${m.meta.timeRange.from} → ${m.meta.timeRange.to}`
                  : ""}{" "}
                · {m.meta.model}
              </p>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 justify-self-start rounded-2xl rounded-bl-lg border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
            <Loader2 className="size-4 animate-spin" /> Analyzing confirmed data…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="sticky bottom-20 flex items-end gap-2 rounded-lg border bg-background/90 p-2 shadow-xl shadow-primary/10 backdrop-blur md:bottom-4"
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(input);
            }
          }}
          placeholder={`Ask about ${profileName}'s confirmed results…`}
          className="min-h-[52px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
