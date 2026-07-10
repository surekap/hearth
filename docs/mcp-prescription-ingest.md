# Hearth Prescription Ingest MCP

This MCP lets Claude, ChatGPT or another MCP client help process a local folder of old prescription PDFs/images while still using Hearth's normal encrypted document storage and review workflow.

## Design

The server is intentionally local and stdio-based. It does not expose a public HTTP endpoint and it does not confirm clinical data automatically.

Flow:

1. MCP client scans an allowed local folder.
2. MCP client uploads each file into Hearth as an encrypted document.
3. Either Hearth's built-in extractor processes the pending job, or the MCP client reads the file payload and performs OCR/vision extraction itself.
4. MCP client submits structured JSON matching Hearth's extraction schema.
5. Hearth creates draft `extracted_items` and sends the user to `/documents/:id/review` for confirmation.

## Required Environment

Use a Hearth upload API token from the Export page.

```bash
HEARTH_API_TOKEN=hearth_...
HEARTH_INGEST_ROOTS=/path/to/prescriptions
HEARTH_APP_URL=http://localhost:3000
DATABASE_URL=postgres://...
DOCUMENT_ENCRYPTION_KEY=...
```

`HEARTH_INGEST_ROOTS` is a path-delimited allowlist. On macOS/Linux, separate multiple roots with `:`. If omitted, the server only allows files under the repo root.

## Run

```bash
npm run mcp:hearth
```

Claude Desktop-style config:

```json
{
  "mcpServers": {
    "hearth": {
      "command": "npm",
      "args": ["--silent", "run", "mcp:hearth"],
      "cwd": "/Users/prateeksureka/Sites/hearth",
      "env": {
        "HEARTH_API_TOKEN": "hearth_...",
        "HEARTH_INGEST_ROOTS": "/path/to/prescriptions",
        "HEARTH_APP_URL": "http://localhost:3000"
      }
    }
  }
}
```

## Tools

- `hearth_list_profiles`: get profile IDs available to the token user.
- `hearth_scan_ingest_folder`: list supported files and duplicate status.
- `hearth_read_file_for_extraction`: return one PDF/image as base64 for OCR/vision extraction.
- `hearth_upload_document`: encrypt, store and queue a document.
- `hearth_get_extraction_schema`: return the exact JSON shape to submit.
- `hearth_submit_extraction_result`: validate external extraction JSON and create review drafts.
- `hearth_get_document_status`: inspect document/job/item state and get the review URL.
- `hearth_list_recent_documents`: audit recent uploads for a profile.

## Suggested Agent Prompt

Ask the MCP client:

```text
Use the Hearth MCP. List profiles, scan my prescription folder recursively,
upload each PDF as documentType=prescription for <profile>, read each file,
extract medications, doctor/facility/date, raw transcription and uncertainties
using hearth_get_extraction_schema, submit drafts with
hearth_submit_extraction_result, then give me the review URLs.
Do not mark anything accepted.
```
