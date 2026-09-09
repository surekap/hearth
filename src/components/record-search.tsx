"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, LoaderCircle, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MIN_SEARCH_LENGTH, MAX_SEARCH_LENGTH, SEARCH_DEBOUNCE_MS, SEARCH_CACHE_MS, normalizeQuery, type SearchResponse } from "@/lib/record-search";

type Cached = { expires: number; response: SearchResponse };

export function RecordSearch({ profileId, children }: { profileId: string; children: ReactNode }) {
  const pathname = usePathname();
  const [cache] = useState(() => new Map<string, Cached>());
  // Navigating to a result restores the page; the profile-keyed memory cache survives navigation.
  return <SearchSession key={pathname} profileId={profileId} cache={cache}>{children}</SearchSession>;
}

function SearchSession({ profileId, cache, children }: { profileId: string; cache: Map<string, Cached>; children: ReactNode }) {
  const [input, setInput] = useState({ value: "" });
  const [answer, setAnswer] = useState<{ input: typeof input; data?: SearchResponse; error?: string } | null>(null);
  const query = input.value.trim();
  const searching = query.length >= MIN_SEARCH_LENGTH;
  const current = answer?.input === input ? answer : null;
  const loading = searching && !current;

  useEffect(() => {
    if (!searching) return;
    const controller = new AbortController();
    const key = normalizeQuery(query);
    const timer = setTimeout(async () => {
      try {
        const cached = cache.get(key);
        if (cached && cached.expires > Date.now()) { setAnswer({ input, data: cached.response }); return; }
        const response = await fetch("/api/records/search", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, profileId }), signal: controller.signal, cache: "no-store",
        });
        if (!response.ok) throw new Error(response.status === 401 ? "Your session expired. Sign in again to search." : "Search is unavailable. Please try again.");
        const data: SearchResponse = await response.json();
        if (controller.signal.aborted) return;
        cache.delete(key);
        while (cache.size >= 30) cache.delete(cache.keys().next().value!);
        cache.set(key, { response: data, expires: Date.now() + (data.mode === "keywords" ? 5000 : SEARCH_CACHE_MS) });
        setAnswer({ input, data });
      } catch (error) {
        if (!controller.signal.aborted) setAnswer({ input, error: error instanceof Error ? error.message : "Search is unavailable. Please try again." });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [input, query, searching, profileId, cache]);

  const results = current?.data?.results ?? [];
  const groups = Map.groupBy(results, result => result.date?.slice(0, 7) ?? "Undated");
  return <>
    <div className="mx-auto w-full max-w-6xl px-4 pt-4 pb-3">
      <div role="search" className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
        <Input aria-label="Search health records" aria-describedby="record-search-status" type="search" value={input.value} maxLength={MAX_SEARCH_LENGTH}
          placeholder="Search your health records…" className="h-10 pr-10 pl-10 [&::-webkit-search-cancel-button]:hidden"
          onChange={event => setInput({ value: event.target.value })} onKeyDown={event => { if (event.key === "Escape") setInput({ value: "" }); }} />
        {input.value && <button type="button" aria-label="Clear search" className="absolute top-0 right-0 flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setInput({ value: "" })}><X className="size-4" /></button>}
      </div>
      <div id="record-search-status" role="status" aria-live="polite" className="mt-1 text-xs text-muted-foreground">
        {input.value && !searching ? "Type at least 3 characters to search." : loading ? <span className="inline-flex items-center gap-1.5"><LoaderCircle className="size-3 animate-spin" />Searching…</span> : current?.data ? `${current.data.total} ${current.data.total === 1 ? "record" : "records"} · ${current.data.order === "oldest" ? "Oldest" : "Newest"} first` : null}
      </div>
    </div>
    <main className="mx-auto min-w-0 w-full max-w-6xl px-4 py-5 pb-8 sm:py-6">
      {!searching ? children : <section aria-label="Search results" aria-busy={loading} className="grid gap-5">
        {current?.error && <p role="alert" className="text-sm text-destructive">{current.error} <button className="underline" onClick={() => setInput({ value: input.value })}>Retry</button></p>}
        {current?.data?.mode === "keywords" && <p className="text-sm text-muted-foreground">Smart search is temporarily unavailable. Showing literal keyword matches.</p>}
        {current?.data && !results.length && <p className="text-sm text-muted-foreground">No matching records. Try a different description.</p>}
        {[...groups].map(([month, records]) => <div key={month}>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{month === "Undated" ? month : new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</h2>
          <ol className="grid gap-2 border-l-2 border-primary/15 pl-4">{records.map(record => <li key={record.id} className="rounded-xl border bg-card p-4">
            <Link href={record.href} onClick={() => setInput({ value: "" })} className="flex min-w-0 items-start gap-3 rounded-md focus-visible:ring-2 focus-visible:ring-ring">
              <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="min-w-0"><p className="break-words text-sm font-medium">{record.title}</p><p className="mt-1 text-xs text-muted-foreground">{record.date ?? "Undated"}{record.dateIsFallback ? " (uploaded)" : ""} · {record.kind}</p></div>
            </Link>
            {record.scanHref && <Link href={record.scanHref} target="_blank" className="mt-2 inline-block text-xs text-primary underline underline-offset-4">Open scan image</Link>}
          </li>)}</ol>
        </div>)}
      </section>}
    </main>
  </>;
}
