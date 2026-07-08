"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type CommandItem = { label: string; hint: string; href: string };

const MAX_RESULTS = 12;

export function CommandMenu({ items }: { items: CommandItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery("");
        setActive(0);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, MAX_RESULTS);
    return items
      .filter((i) => i.label.toLowerCase().includes(q) || i.hint.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [items, query]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-24 translate-y-0 gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>Search measurements</DialogTitle>
        </DialogHeader>
        <div className="relative border-b">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            className="h-12 rounded-none border-0 pl-11 shadow-none focus-visible:ring-0"
            placeholder="Jump to a measurement or system…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && results[active]) {
                e.preventDefault();
                go(results[active].href);
              }
            }}
          />
        </div>
        <ul className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</li>
          )}
          {results.map((item, i) => (
            <li key={item.href}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item.href)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm",
                  i === active ? "bg-primary/10 text-foreground" : "text-muted-foreground"
                )}
              >
                <span className="truncate font-medium">{item.label}</span>
                <span className="shrink-0 text-xs">{item.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
