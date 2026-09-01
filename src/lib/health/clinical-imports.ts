export type ClinicalImportDocument = {
  id: string;
  filename: string;
  documentDate: string | null;
  uploadedAt: Date;
};

export type ClinicalImportObservation = {
  documentId: string;
  observedAt: Date;
  createdAt: Date;
  name: string;
  category: string;
  valueNumeric: number | null;
  valueText: string | null;
  unit: string | null;
  interpretation: string;
  kind?: string | null;
};

export type ClinicalImportReport = {
  documentId: string;
  reportDate: string | null;
  createdAt: Date;
  studyName: string | null;
  reportType: string;
};

export type ClinicalImportImage = {
  documentId: string;
  reportDate: string | null;
  createdAt: Date;
};

export type ClinicalImportBatch = {
  key: string;
  documentId: string;
  filename: string;
  date: string;
  ingestedAt: string;
  title: string;
  measurementCount: number;
  labMeasurementCount: number;
  reportCount: number;
  imageCount: number;
  abnormalCount: number;
  categories: string[];
  highlights: Array<{
    name: string;
    value: number | string | null;
    unit: string | null;
    interpretation: string;
  }>;
};

function dateKey(value: Date | string | null, fallback: Date) {
  const date = value ? new Date(value) : fallback;
  return date.toISOString().slice(0, 10);
}

function isAbnormal(interpretation: string) {
  return ["low", "high", "critical"].includes(interpretation);
}

export function buildClinicalImportBatches(input: {
  documents: ClinicalImportDocument[];
  observations: ClinicalImportObservation[];
  reports: ClinicalImportReport[];
  images: ClinicalImportImage[];
  limit?: number;
}): ClinicalImportBatch[] {
  const documents = new Map(input.documents.map((document) => [document.id, document]));
  const documentIngestedAt = new Map(
    input.documents.map((document) => [document.id, document.uploadedAt.toISOString()])
  );
  const groups = new Map<
    string,
    ClinicalImportBatch & { reportNames: Set<string>; categorySet: Set<string> }
  >();

  function group(documentId: string, date: string, createdAt: Date) {
    const document = documents.get(documentId);
    if (!document) return null;
    if (createdAt.toISOString() > (documentIngestedAt.get(documentId) ?? "")) {
      documentIngestedAt.set(documentId, createdAt.toISOString());
    }
    const key = `${documentId}:${date}`;
    let batch = groups.get(key);
    if (!batch) {
      batch = {
        key,
        documentId,
        filename: document.filename,
        date,
        ingestedAt: createdAt.toISOString(),
        title: document.filename,
        measurementCount: 0,
        labMeasurementCount: 0,
        reportCount: 0,
        imageCount: 0,
        abnormalCount: 0,
        categories: [],
        highlights: [],
        reportNames: new Set<string>(),
        categorySet: new Set<string>(),
      };
      groups.set(key, batch);
    } else if (createdAt.toISOString() > batch.ingestedAt) {
      batch.ingestedAt = createdAt.toISOString();
    }
    return batch;
  }

  const observations = [...input.observations].sort((a, b) => {
    const abnormal = Number(isAbnormal(b.interpretation)) - Number(isAbnormal(a.interpretation));
    return abnormal || a.name.localeCompare(b.name);
  });
  for (const observation of observations) {
    const document = documents.get(observation.documentId);
    if (!document) continue;
    const batch = group(
      observation.documentId,
      dateKey(observation.observedAt, document.uploadedAt),
      observation.createdAt
    );
    if (!batch) continue;
    batch.measurementCount += 1;
    if (observation.kind !== "diagnostic_measurement") batch.labMeasurementCount += 1;
    if (isAbnormal(observation.interpretation)) batch.abnormalCount += 1;
    batch.categorySet.add(observation.category);
    if (
      batch.highlights.length < 4 &&
      !batch.highlights.some((highlight) => highlight.name === observation.name)
    ) {
      batch.highlights.push({
        name: observation.name,
        value: observation.valueNumeric ?? observation.valueText,
        unit: observation.unit,
        interpretation: observation.interpretation,
      });
    }
  }

  for (const report of input.reports) {
    const document = documents.get(report.documentId);
    if (!document) continue;
    const batch = group(
      report.documentId,
      dateKey(report.reportDate ?? document.documentDate, document.uploadedAt),
      report.createdAt
    );
    if (!batch) continue;
    batch.reportCount += 1;
    batch.reportNames.add(report.studyName ?? report.reportType);
  }

  for (const image of input.images) {
    const document = documents.get(image.documentId);
    if (!document) continue;
    const batch = group(
      image.documentId,
      dateKey(image.reportDate ?? document.documentDate, document.uploadedAt),
      image.createdAt
    );
    if (batch) batch.imageCount += 1;
  }

  return [...groups.values()]
    .map(({ reportNames, categorySet, ...batch }) => ({
      ...batch,
      ingestedAt: documentIngestedAt.get(batch.documentId) ?? batch.ingestedAt,
      title:
        reportNames.size > 0
          ? [...reportNames].slice(0, 2).join(" + ") + (reportNames.size > 2 ? ` +${reportNames.size - 2}` : "")
          : batch.title,
      categories: [...categorySet].sort(),
    }))
    .sort((a, b) => b.ingestedAt.localeCompare(a.ingestedAt) || b.date.localeCompare(a.date))
    .slice(0, input.limit ?? 8);
}
