import { NextRequest, NextResponse } from "next/server";
import { drainExtractionQueue } from "@/lib/extraction";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorize(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handler(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await drainExtractionQueue({ limit: 1 });
  return NextResponse.json({
    failedStaleJobs: result.failedStaleJobs.length,
    processed: result.processed,
  });
}

export const GET = handler;
export const POST = handler;
