#!/usr/bin/env tsx
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { OPENAI_JSON_SCHEMA } from "@/lib/extraction/schemas";
import {
  documentSourceSchema,
  documentTypeSchema,
  getDocumentIngestStatus,
  readLocalFilePayload,
  requireMcpProfile,
  requireMcpUser,
  scanIngestFolder,
  submitExternalExtraction,
  uploadLocalDocument,
} from "@/lib/mcp/ingest";
import { getAccessibleProfiles } from "@/lib/profile-access";

function jsonText(value: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

const server = new McpServer({
  name: "hearth-prescription-ingest",
  version: "0.1.0",
});

server.registerTool(
  "hearth_list_profiles",
  {
    title: "List Hearth Profiles",
    description:
      "List profiles accessible to the HEARTH_API_TOKEN user. Use a profile id when uploading prescription files.",
    outputSchema: {
      profiles: z.array(
        z.object({
          id: z.string(),
          displayName: z.string(),
          relationship: z.string(),
          dateOfBirth: z.string().nullable(),
        })
      ),
    },
  },
  async () => {
    const user = await requireMcpUser();
    const profiles = await getAccessibleProfiles(user.id);
    return jsonText({
      profiles: profiles.map((profile) => ({
        id: profile.id,
        displayName: profile.displayName,
        relationship: profile.relationship,
        dateOfBirth: profile.dateOfBirth,
      })),
    });
  }
);

server.registerTool(
  "hearth_scan_ingest_folder",
  {
    title: "Scan Ingest Folder",
    description:
      "Find PDF/image files under an allowed local folder and show hashes, MIME types and duplicate upload status.",
    inputSchema: {
      folderPath: z.string().describe("Absolute or relative folder path within HEARTH_INGEST_ROOTS."),
      profileId: z.string().uuid().optional().describe("When provided, duplicate checks are scoped to this profile."),
      recursive: z.boolean().default(false),
    },
  },
  async ({ folderPath, profileId, recursive }) => {
    const user = await requireMcpUser();
    if (profileId) await requireMcpProfile(user.id, profileId);
    return jsonText(await scanIngestFolder({ folderPath, profileId, recursive }));
  }
);

server.registerTool(
  "hearth_read_file_for_extraction",
  {
    title: "Read File For Extraction",
    description:
      "Read one allowed PDF/image file as base64 so the MCP client can run OCR/vision extraction before submitting JSON.",
    inputSchema: {
      filePath: z.string().describe("Absolute or relative file path within HEARTH_INGEST_ROOTS."),
    },
  },
  async ({ filePath }) => jsonText(await readLocalFilePayload(filePath))
);

server.registerTool(
  "hearth_upload_document",
  {
    title: "Upload Hearth Document",
    description:
      "Encrypt and upload a local prescription/lab/report file into Hearth and create a pending extraction job.",
    inputSchema: {
      filePath: z.string(),
      profileId: z.string().uuid(),
      documentType: documentTypeSchema.default("prescription"),
      source: documentSourceSchema.default("files"),
      documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    },
  },
  async ({ filePath, profileId, documentType, source, documentDate }) => {
    const user = await requireMcpUser();
    const result = await uploadLocalDocument({
      filePath,
      profileId,
      userId: user.id,
      documentType,
      source,
      documentDate,
    });
    return jsonText({
      duplicate: result.duplicate,
      documentId: result.document.id,
      extractionJobId: result.extractionJob?.id ?? null,
      filename: result.document.originalFilename,
      reviewUrl: `${process.env.HEARTH_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/documents/${result.document.id}/review`,
    });
  }
);

server.registerTool(
  "hearth_get_extraction_schema",
  {
    title: "Get Extraction Schema",
    description:
      "Return the exact structured JSON schema expected by hearth_submit_extraction_result.",
  },
  async () =>
    jsonText({
      schema: OPENAI_JSON_SCHEMA,
      notes: [
        "Use document_type=prescription for old prescriptions.",
        "Put the full OCR transcription in raw_text.",
        "Use medications for prescribed medicines and report for doctor/facility/summary details.",
        "Unknown fields should be null or empty arrays, not omitted.",
      ],
    })
);

server.registerTool(
  "hearth_submit_extraction_result",
  {
    title: "Submit Extraction Result",
    description:
      "Validate an externally extracted Hearth JSON payload and create draft extracted_items for human review.",
    inputSchema: {
      documentId: z.string().uuid(),
      extraction: z.unknown().describe("JSON matching hearth_get_extraction_schema."),
      modelUsed: z.string().optional(),
      promptVersion: z.string().optional(),
    },
  },
  async ({ documentId, extraction, modelUsed, promptVersion }) => {
    const user = await requireMcpUser();
    return jsonText(
      await submitExternalExtraction({
        documentId,
        userId: user.id,
        extraction,
        modelUsed,
        promptVersion,
      })
    );
  }
);

server.registerTool(
  "hearth_get_document_status",
  {
    title: "Get Document Status",
    description:
      "Fetch a document, latest extraction job and draft item summary after upload or external extraction.",
    inputSchema: {
      documentId: z.string().uuid(),
    },
  },
  async ({ documentId }) => {
    const user = await requireMcpUser();
    return jsonText(await getDocumentIngestStatus({ documentId, userId: user.id }));
  }
);

server.registerTool(
  "hearth_list_recent_documents",
  {
    title: "List Recent Documents",
    description: "List recent documents for a profile to audit ingestion progress.",
    inputSchema: {
      profileId: z.string().uuid(),
      limit: z.number().int().min(1).max(50).default(20),
    },
  },
  async ({ profileId, limit }) => {
    const user = await requireMcpUser();
    await requireMcpProfile(user.id, profileId);
    const documents = await db.query.documents.findMany({
      where: eq(schema.documents.profileId, profileId),
      orderBy: [desc(schema.documents.uploadedAt)],
      limit,
    });
    return jsonText({ documents });
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Hearth prescription ingest MCP server running on stdio.");
}

main().catch((error) => {
  console.error("Hearth MCP server failed:", error);
  process.exit(1);
});
