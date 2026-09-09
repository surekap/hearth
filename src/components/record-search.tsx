import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recordSearchHref, type RecordFilters } from "@/lib/record-search";

export function RecordSearch({ filters, path, count }: { filters: RecordFilters; path: string; count: number }) {
  const selectClass = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";
  return <section className="grid gap-3 rounded-xl border bg-card p-4" aria-label="Search health records">
    <form action={path} className="grid gap-3" key={JSON.stringify(filters)}>
      <label className="grid gap-1 text-sm font-medium">Search records
        <Input type="search" name="q" defaultValue={filters.q} placeholder="Dental, eye, report name, doctor, or finding…" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-xs text-muted-foreground">Specialty
          <select className={selectClass} name="specialty" defaultValue={filters.specialty}><option value="">All specialties</option><option value="dental">Dental</option><option value="eye">Eye</option></select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">From date<Input type="date" name="from" defaultValue={filters.from} /></label>
        <label className="grid gap-1 text-xs text-muted-foreground">To date<Input type="date" name="to" defaultValue={filters.to} /></label>
        <label className="grid gap-1 text-xs text-muted-foreground">Order
          <select className={selectClass} name="sort" defaultValue={filters.sort}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2"><Button type="submit"><Search className="size-4" />Search</Button><Button asChild variant="ghost"><Link href={path}>Clear filters</Link></Button></div>
    </form>
    <div className="flex flex-wrap items-center gap-3 text-sm"><p role="status" className="text-muted-foreground">{count} {count === 1 ? "result" : "results"}</p>
      <nav aria-label="Search in other views" className="flex flex-wrap gap-3">{[["/", "Timeline"], ["/documents", "Documents"], ["/images", "Scans"]].map(([href, label]) => <Link key={href} aria-current={path === href ? "page" : undefined} className="text-primary underline underline-offset-4" href={recordSearchHref(href, filters)}>{label}</Link>)}</nav>
    </div>
    <p className="text-xs text-muted-foreground">Searches filenames and extracted report text. Dates use the report date where available; documents without one use their upload date.</p>
    {filters.from && filters.to && filters.from > filters.to ? <p role="alert" className="text-sm text-destructive">From date must be on or before To date.</p> : count === 0 ? <p className="text-sm">No matching records. Try another term or clear the filters.</p> : null}
  </section>;
}
