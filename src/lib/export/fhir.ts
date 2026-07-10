import type { ProfileBundle } from "./data";

/**
 * FHIR-inspired R4 Bundle (spec §15):
 *   Profile → Patient · Lab value → Observation · Lab report → DiagnosticReport
 *   Document → DocumentReference · Medication → MedicationStatement
 * "Inspired" — resources carry the essential fields, not full R4 conformance.
 */
export function buildFhirBundle(bundle: ProfileBundle) {
  const patientId = `patient-${bundle.profile.id}`;
  const entries: unknown[] = [];

  entries.push({
    resource: {
      resourceType: "Patient",
      id: patientId,
      name: [{ text: bundle.profile.displayName }],
      birthDate: bundle.profile.dateOfBirth ?? undefined,
      gender:
        bundle.profile.sexAtBirth === "unknown" ? undefined : bundle.profile.sexAtBirth,
    },
  });

  // Observations
  const obsIdsByDocument = new Map<string, string[]>();
  for (const o of bundle.observations) {
    const obsId = `observation-${o.id}`;
    if (o.documentId) {
      const list = obsIdsByDocument.get(o.documentId) ?? [];
      list.push(obsId);
      obsIdsByDocument.set(o.documentId, list);
    }
    entries.push({
      resource: {
        resourceType: "Observation",
        id: obsId,
        status: "final",
        code: {
          text: o.typeName,
          coding: o.loincCode
            ? [{ system: "http://loinc.org", code: o.loincCode, display: o.typeName }]
            : undefined,
        },
        subject: { reference: `Patient/${patientId}` },
        effectiveDateTime: o.observedAt.toISOString(),
        valueQuantity:
          o.valueNumeric != null
            ? { value: o.valueNumeric, unit: o.unit ?? undefined }
            : undefined,
        valueString: o.valueNumeric == null ? (o.valueText ?? undefined) : undefined,
        interpretation:
          o.interpretation !== "unknown"
            ? [{ text: o.interpretation.toUpperCase() }]
            : undefined,
        referenceRange:
          o.referenceLow != null || o.referenceHigh != null
            ? [
                {
                  low: o.referenceLow != null ? { value: o.referenceLow } : undefined,
                  high: o.referenceHigh != null ? { value: o.referenceHigh } : undefined,
                },
              ]
            : undefined,
      },
    });
  }

  // Documents → DocumentReference (+ DiagnosticReport for lab reports,
  // grouping their observations like ABDM does)
  for (const d of bundle.documents) {
    entries.push({
      resource: {
        resourceType: "DocumentReference",
        id: `document-${d.id}`,
        status: "current",
        subject: { reference: `Patient/${patientId}` },
        date: d.uploadedAt.toISOString(),
        description: d.originalFilename,
        type: { text: d.documentType },
        content: [
          {
            attachment: {
              contentType: d.mimeType,
              title: d.originalFilename,
              // Actual bytes stay encrypted at rest; fetch via authenticated API.
              url: `/api/documents/${d.id}/file`,
            },
          },
        ],
      },
    });

    const resultRefs = obsIdsByDocument.get(d.id);
    if (d.documentType === "lab_report" && resultRefs?.length) {
      entries.push({
        resource: {
          resourceType: "DiagnosticReport",
          id: `report-${d.id}`,
          status: "final",
          subject: { reference: `Patient/${patientId}` },
          effectiveDateTime: d.documentDate ?? d.uploadedAt.toISOString().slice(0, 10),
          code: { text: "Laboratory report" },
          result: resultRefs.map((r) => ({ reference: `Observation/${r}` })),
        },
      });
    }
  }

  // Clinical reports → DiagnosticReport
  for (const r of bundle.reports) {
    entries.push({
      resource: {
        resourceType: "DiagnosticReport",
        id: `clinical-report-${r.id}`,
        status: "final",
        subject: { reference: `Patient/${patientId}` },
        effectiveDateTime: r.reportDate ?? undefined,
        code: { text: r.reportType },
        conclusion: r.impression ?? r.summary ?? undefined,
      },
    });
  }

  for (const r of bundle.geneticRisks) {
    entries.push({
      resource: {
        resourceType: "Observation",
        id: `genetic-risk-${r.id}`,
        status: "final",
        category: [{ text: "genetics" }],
        code: { text: `Genetic ${r.category} risk: ${r.conditionName}` },
        subject: { reference: `Patient/${patientId}` },
        valueString: [r.assessment, r.riskLevel].filter(Boolean).join("; "),
        note: r.summary ? [{ text: r.summary }] : undefined,
      },
    });
  }

  for (const p of bundle.pharmacogenomics) {
    entries.push({
      resource: {
        resourceType: "Observation",
        id: `pharmacogenomic-${p.id}`,
        status: "final",
        category: [{ text: "pharmacogenomics" }],
        code: { text: `Pharmacogenomic result: ${p.drugName}` },
        subject: { reference: `Patient/${patientId}` },
        valueString: p.implication,
        component: [
          { code: { text: "Gene" }, valueString: p.gene ?? undefined },
          { code: { text: "Genotype" }, valueString: p.genotype ?? undefined },
          { code: { text: "Phenotype" }, valueString: p.phenotype ?? undefined },
        ].filter((c) => c.valueString),
        note: p.recommendationSummary ? [{ text: p.recommendationSummary }] : undefined,
      },
    });
  }

  // Medication events → MedicationStatement
  for (const m of bundle.medEvents) {
    entries.push({
      resource: {
        resourceType: "MedicationStatement",
        id: `medication-${m.id}`,
        status:
          m.eventType === "stopped"
            ? "stopped"
            : m.eventType === "skipped"
              ? "not-taken"
              : "active",
        subject: { reference: `Patient/${patientId}` },
        ...(m.courseStartDate || m.courseEndDate
          ? {
              effectivePeriod: {
                start: m.courseStartDate ?? undefined,
                end: m.courseEndDate ?? undefined,
              },
            }
          : { effectiveDateTime: m.eventTime.toISOString() }),
        medicationCodeableConcept: { text: m.nameText },
        dosage:
          m.dose || m.frequency
            ? [{ text: [m.dose, m.frequency].filter(Boolean).join(", ") }]
            : undefined,
        note: m.notes ? [{ text: m.notes }] : undefined,
      },
    });
  }

  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: new Date().toISOString(),
    total: entries.length,
    entry: entries,
  };
}
