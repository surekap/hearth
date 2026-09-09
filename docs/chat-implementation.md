# Evidence-based chat implementation

The priority order is analysis quality, understandable visuals, then brevity. This change keeps the existing database and answer-text storage format; no migration or dependency installation is required.

## Model and token policy

| Task | Default | Policy |
| --- | --- | --- |
| Exact latest measurement | No model | Narrow, whole-question match; no interpretation or arbitrary same-day selection. |
| Health interpretation, broad reviews, trends, explanations | `gpt-5.6-sol` | One structured reasoning call normally; high effort for broad reviews, medium for narrower interpretation. |
| Patient-reported statement extraction | `gpt-5.6-luna` | Independent `UTILITY_MODEL`; pure record questions skip the call. No entire record is sent. |
| PDF/image extraction | `gpt-4o-mini` | Existing configurable `EXTRACTION_MODEL` retained. Detailed report extraction can independently be upgraded. |
| Arithmetic, evidence selection, chart generation, citation-ID validation | No model | Local deterministic code. |

Set `REASONING_MODEL`, `UTILITY_MODEL` and `EXTRACTION_MODEL` explicitly in the deployment environment to override defaults. Legacy `OPENAI_MODEL` still overrides the reasoning/extraction defaults, so an existing deployment set to `gpt-4o` will keep using it until that override is cleared or `REASONING_MODEL` is set. Utility jobs never inherit that legacy override.

Official capability references checked on 9 September 2026: [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol), [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). Account-specific model access still needs a live deployment check. Older model overrides receive no unsupported reasoning parameter.

There is no mandatory classifier, summarizer, reviewer or chart-generation model call. The main call self-checks its synthesis. At most three calls are allowed, including one evidence expansion and bounded correction of invalid output. The aggregate output budget is 14,000 tokens, including reasoning, with at most 8,000 per call. API retries are disabled to keep this bound meaningful. The analysis deadline is 145 seconds; the route advertises a 180-second deployment limit.

The initial detailed evidence allowance is 48,000 characters for broad questions and 16,000 for narrow questions, plus a compact omitted-evidence catalog and supplemental context. Observations and catalog entries use columnar transport to avoid repeating JSON keys; values, ranges, qualifiers and provenance are retained. This is a character heuristic, not an exact tokenizer limit. Recent history is limited to 12,000 characters, preserving whole turns. A tool expansion is limited to 12 evidence items and 20,000 additional characters. Actual input, cached input and output tokens are recorded to tune these limits using observed usage rather than assumed cost savings.

## Evidence and analysis

- Fetch profile-scoped clinical records before any retrieval. Chat loads a larger evidence pool than the precomputed-insight path. Clinical reports are ordered newest-first, fixing the first-50-upload omission.
- Preserve full report findings, source document/page references, study/facility/modality, available device and measurement labels, confirmation confidence, diagnoses and medication-event history. Raw source snippets are explicitly unconfirmed transcription evidence.
- Resolve explicit calendar years, month ranges, ISO dates and relative periods. Earlier numeric baselines within two years supplement only metrics with fewer than two dates inside the requested period, and are explicitly labelled as outside it.
- Retain study findings and reserve measurement endpoints as pairs across tests; do not fill the entire packet with one dense series. Genomics is included only when relevant. Wearable history is supplied as a small aggregate summary.
- Provide a bounded catalog of omitted evidence and disclose incomplete coverage, including uploaded documents without structured evidence. `read_evidence` can retrieve only catalog IDs from this profile's evidence pool.
- Separate numeric changes from clinical verdicts. Cross-machine/body-composition, mismatched units/measurement qualifiers and same-day protocol comparisons do not become precise trend charts.
- The model writes a source-linked overview, findings, visual selections, next steps and limitations. Code validates schema and cited IDs, resolves chart values and sources, and preserves essential comparability caveats. These checks do not establish semantic citation support or medical correctness.
- Extraction prompt v9 preserves scanner/reference-population information in findings and pre/post or tissue/total qualifiers in measurement names. It applies to future extraction/re-extraction; existing reports are not silently rewritten.

## Presentation and compatibility

New `review` blocks are versioned inside the existing `hearth-blocks` answer envelope. Both old and new blocks receive runtime validation. This avoids rewriting historic conversations or requiring a database migration.

The UI displays a short overview, source links, selected charts/tables/timelines, relevant caveats and next steps. Full analysis and evidence coverage are expandable. Previously generated record highlights are collapsed so they do not crowd the current conversation. Charts use real date spacing, straight connections between measured points, and printed reference bands only when the selected readings share a range. Incompatible trends fall back to a source-linked table; one reading never becomes a trend. The same caveat is not repeated in multiple visible panels.

Conversation replay includes the findings and compact visual values, rather than stripping all analysis or replaying large chart JSON. Stable prompt/schema prefixes are reused; cache usage is measured from API responses.

## Audit and validation

`ai_context_logs.context_json.analysisRun` stores prompt version, model effort, initial packet, selected history, additional reads/corrections, validation outcome, token usage, call count and duration. The surrounding context retains the provenance mapping. Audit events also carry compact usage statistics. Persisted answers remain readable without access to the model.

Tests cover broad-versus-lookup routing, exact arithmetic failure cases, date scope/baselines, source preservation, cross-machine and same-day comparisons, incomplete coverage, invented citations, malformed stored blocks, compatible chart values, history budgets, capture gating, model selection, structured request options and bounded failure behavior. Synthetic browser fixtures exercise charts, timeline, table fallback, source links and expandable details.

A real clinical-quality comparison still requires an API-enabled environment and source-verified cases. Neither local environment file contained an API key during implementation. Do not interpret passing unit tests as proof that generated medical analysis matches a clinician's review. The existing assessment's 2026 case is the starting evaluation scenario; its quoted medical conclusions are not automatically ground truth.

## Deployment and follow-up

Production release: retain `REASONING_MODEL=gpt-5.6-sol` and `EXTRACTION_MODEL=gpt-5.6-luna`, and use `UTILITY_MODEL=gpt-5.6-luna`. Verify the release and model behavior through the existing authenticated application. Re-run the fixed review cases with the same evidence across models, compare source coverage and unsupported claims first, then visual usefulness, length, latency and actual token cost.

Not added in this change: a vector database, a mandatory second model reviewer, durable background review jobs, automatic external medical web research, or automatic rereading of original PDF images. Additional reads operate on extracted evidence. Existing extraction/page-review tools remain the route for correcting deficient source extraction.
