import { NextRequest, NextResponse } from "next/server";
import { ilike, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser, handleApiError } from "@/lib/api";

/**
 * Autocomplete over the internal medication dictionary (built from manual
 * entries and accepted prescriptions — no third-party scraping, per spec §13).
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 2) return NextResponse.json({ results: [] });

    const pattern = `%${q}%`;
    const rows = await db
      .select()
      .from(schema.medicationMaster)
      .where(
        or(
          ilike(schema.medicationMaster.brandName, pattern),
          ilike(schema.medicationMaster.genericName, pattern),
          sql`EXISTS (SELECT 1 FROM unnest(${schema.medicationMaster.aliases}) a WHERE a ILIKE ${pattern})`
        )
      )
      .limit(10);

    return NextResponse.json({
      results: rows.map((r) => ({
        id: r.id,
        name: r.brandName ?? r.genericName,
        genericName: r.genericName,
        brandName: r.brandName,
        strength: r.strength,
        form: r.form,
      })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
