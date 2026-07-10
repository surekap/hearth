import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ProfileBundle } from "./data";

const PAGE = { w: 595.28, h: 841.89, margin: 48 }; // A4
const INK = rgb(0.18, 0.15, 0.13);
const MUTED = rgb(0.45, 0.42, 0.4);
const EMBER = rgb(0.72, 0.34, 0.18);
const RED = rgb(0.78, 0.2, 0.16);
const LINE = rgb(0.85, 0.82, 0.79);

const PDF_TEXT_REPLACEMENTS: Record<string, string> = {
  "\u00b5": "u",
  "\u00d7": "x",
  "\u2010": "-",
  "\u2011": "-",
  "\u2012": "-",
  "\u2013": "-",
  "\u2014": "-",
  "\u2018": "'",
  "\u2019": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u2022": "-",
  "\u00b7": "-",
  "\u00b9": "^1",
  "\u00b2": "^2",
  "\u00b3": "^3",
  "\u2070": "^0",
  "\u2074": "^4",
  "\u2075": "^5",
  "\u2076": "^6",
  "\u2077": "^7",
  "\u2078": "^8",
  "\u2079": "^9",
};

function pdfText(value: string): string {
  const cleaned = value
    .replace(/[\u00b5\u00d7\u2010-\u2014\u2018\u2019\u201c\u201d\u2022\u00b7\u00b9\u00b2\u00b3\u2070\u2074-\u2079]/g, (c) => PDF_TEXT_REPLACEMENTS[c] ?? "")
    .replace(/[^\x20-\x7e]/g, " ");
  return cleaned.length > 0 ? cleaned : " ";
}

/** Doctor-friendly PDF summary (spec §15): cover, abnormal trends, meds, lab tables, document index. */
export async function buildDoctorPdf(bundle: ProfileBundle): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - PAGE.margin;

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < PAGE.margin) {
      page = doc.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - PAGE.margin;
    }
  };

  const text = (
    s: string,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; x?: number } = {}
  ) => {
    const size = opts.size ?? 10;
    newPageIfNeeded(size + 6);
    page.drawText(pdfText(s), {
      x: opts.x ?? PAGE.margin,
      y: y - size,
      size,
      font: opts.font ?? font,
      color: opts.color ?? INK,
    });
    y -= size + 6;
  };

  const gap = (n = 10) => {
    y -= n;
  };

  const rule = () => {
    newPageIfNeeded(12);
    page.drawLine({
      start: { x: PAGE.margin, y },
      end: { x: PAGE.w - PAGE.margin, y },
      thickness: 0.7,
      color: LINE,
    });
    y -= 12;
  };

  const heading = (s: string) => {
    gap(8);
    text(s, { size: 14, font: bold, color: EMBER });
    rule();
  };

  const cols = (
    values: (string | { t: string; color?: ReturnType<typeof rgb>; font?: PDFFont })[],
    xs: number[],
    size = 9
  ) => {
    newPageIfNeeded(size + 5);
    values.forEach((v, i) => {
      const item = typeof v === "string" ? { t: v } : v;
      page.drawText(pdfText(item.t).slice(0, 60), {
        x: PAGE.margin + xs[i],
        y: y - size,
        size,
        font: item.font ?? font,
        color: item.color ?? INK,
      });
    });
    y -= size + 5;
  };

  const fmtDate = (d: Date | string | null) =>
    d
      ? new Date(d).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "—";

  // ---- Cover header ----
  text("Hearth — Health Summary", { size: 22, font: bold });
  gap(2);
  const p = bundle.profile;
  const age = p.dateOfBirth
    ? `${Math.floor((Date.now() - new Date(p.dateOfBirth).getTime()) / (365.25 * 864e5))}y`
    : null;
  text(
    [
      p.displayName,
      age,
      p.sexAtBirth !== "unknown" ? p.sexAtBirth : null,
      p.bloodGroup ? `Blood group ${p.bloodGroup}` : null,
    ]
      .filter(Boolean)
      .join("  ·  "),
    { size: 12, color: MUTED }
  );
  text(
    `Generated ${fmtDate(new Date())} · ${bundle.observations.length} confirmed lab values · ${bundle.documents.length} documents · ${bundle.geneticReports.length} genetic reports`,
    { size: 9, color: MUTED }
  );
  text(
    "All values were extracted from original reports and confirmed by the family. Verify against originals for clinical decisions.",
    { size: 8, color: MUTED }
  );

  // ---- Abnormal latest values ----
  const latestByTest = new Map<string, (typeof bundle.observations)[number]>();
  for (const o of bundle.observations) latestByTest.set(o.typeName, o);
  const abnormal = [...latestByTest.values()].filter(
    (o) => o.interpretation === "high" || o.interpretation === "low" || o.interpretation === "critical"
  );

  heading("Currently abnormal values");
  if (abnormal.length === 0) {
    text("None — most recent value of every tracked test is within its reference range.", {
      color: MUTED,
    });
  } else {
    cols(
      [
        { t: "Test", font: bold },
        { t: "Latest value", font: bold },
        { t: "Reference", font: bold },
        { t: "Flag", font: bold },
        { t: "Date", font: bold },
      ],
      [0, 150, 260, 360, 420]
    );
    for (const o of abnormal) {
      cols(
        [
          o.typeName,
          `${o.valueNumeric ?? o.valueText ?? ""} ${o.unit ?? ""}`,
          `${o.referenceLow ?? "–"} – ${o.referenceHigh ?? "–"}`,
          { t: o.interpretation.toUpperCase(), color: RED, font: bold },
          fmtDate(o.observedAt),
        ],
        [0, 150, 260, 360, 420]
      );
    }
  }

  // ---- Medications ----
  heading("Current & recent medications");
  if (bundle.recentMeds.length === 0) {
    text("No medications recorded.", { color: MUTED });
  } else {
    cols(
      [
        { t: "Medicine", font: bold },
        { t: "Dose", font: bold },
        { t: "Frequency", font: bold },
        { t: "Course", font: bold },
        { t: "Last logged", font: bold },
      ],
      [0, 150, 240, 340, 440]
    );
    for (const m of bundle.recentMeds.slice(0, 15)) {
      const course =
        m.courseStartDate || m.courseEndDate
          ? `${m.courseStartDate ?? "—"} – ${m.courseEndDate ?? "—"}`
          : "—";
      cols(
        [m.nameText, m.dose ?? "—", m.frequency ?? "—", course, fmtDate(m.lastUsedAt)],
        [0, 150, 240, 340, 440]
      );
    }
  }

  // ---- Lab history by category ----
  const byCategory = new Map<string, Map<string, typeof bundle.observations>>();
  for (const o of bundle.observations) {
    const cat = byCategory.get(o.category) ?? new Map();
    const list = cat.get(o.typeName) ?? [];
    list.push(o);
    cat.set(o.typeName, list);
    byCategory.set(o.category, cat);
  }

  heading("Lab value history");
  if (byCategory.size === 0) {
    text("No confirmed lab values.", { color: MUTED });
  }
  for (const [category, tests] of byCategory) {
    gap(4);
    text(category.toUpperCase(), { size: 10, font: bold, color: MUTED });
    for (const [testName, history] of tests) {
      const recent = history.slice(-6); // last 6 values per test
      cols([{ t: testName, font: bold }], [0], 10);
      for (const o of recent) {
        const flagged =
          o.interpretation === "high" || o.interpretation === "low" || o.interpretation === "critical";
        cols(
          [
            fmtDate(o.observedAt),
            {
              t: `${o.valueNumeric ?? o.valueText ?? ""} ${o.unit ?? ""}`,
              font: flagged ? bold : font,
              color: flagged ? RED : INK,
            },
            `ref ${o.referenceLow ?? "–"} – ${o.referenceHigh ?? "–"}`,
            flagged ? { t: o.interpretation.toUpperCase(), color: RED } : "",
          ],
          [12, 110, 240, 380]
        );
      }
      gap(3);
    }
  }

  // ---- Clinical reports ----
  if (bundle.reports.length > 0) {
    heading("Clinical report impressions");
    for (const r of bundle.reports) {
      cols(
        [
          fmtDate(r.reportDate),
          { t: r.reportType, font: bold },
          r.impression ?? r.summary ?? "—",
        ],
        [0, 90, 180]
      );
    }
  }

  if (bundle.geneticReports.length > 0) {
    heading("Genetic and pharmacogenomic notes");
    text(
      "Genetic findings are static risk context, not diagnoses or medication orders. Re-check older reports against current guidance before clinical decisions.",
      { size: 8, color: MUTED }
    );
    if (bundle.pharmacogenomics.length > 0) {
      cols([{ t: "Medication response", font: bold }], [0], 10);
      for (const p of bundle.pharmacogenomics.slice(0, 12)) {
        cols(
          [
            p.drugName,
            [p.gene, p.genotype, p.phenotype].filter(Boolean).join(" / ") || "—",
            p.implication,
          ],
          [0, 130, 270]
        );
      }
    }
    const notableRisks = bundle.geneticRisks.filter(
      (r) => r.riskLevel === "high" || r.riskLevel === "medium"
    );
    if (notableRisks.length > 0) {
      gap(5);
      cols([{ t: "Risk context", font: bold }], [0], 10);
      for (const r of notableRisks.slice(0, 12)) {
        cols(
          [
            r.conditionName,
            r.category,
            r.assessment ?? r.riskLevel,
            r.lifetimeRiskPercent != null ? `${r.lifetimeRiskPercent}%` : "—",
          ],
          [0, 150, 230, 430]
        );
      }
    }
  }

  // ---- Document index ----
  heading("Attached document index");
  if (bundle.documents.length === 0) {
    text("No documents.", { color: MUTED });
  } else {
    for (const d of bundle.documents) {
      cols(
        [fmtDate(d.documentDate ?? d.uploadedAt), d.documentType, d.originalFilename],
        [0, 90, 210]
      );
    }
  }

  // Footer on every page
  const pages = doc.getPages();
  pages.forEach((pg: PDFPage, i: number) => {
    pg.drawText(pdfText(`Hearth · ${p.displayName} · page ${i + 1}/${pages.length}`), {
      x: PAGE.margin,
      y: 24,
      size: 8,
      font,
      color: MUTED,
    });
  });

  return doc.save();
}
