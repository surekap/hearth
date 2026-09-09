# Production chat validation — 9 September 2026

Application release: `001d612` on `hetzner-docker`, `/opt/hearth`. Both production hostnames use the existing server Compose override and storage mount. The previous application image was retained as `hearth-app:before-chat-2ef8b9e`. No clinical records were re-extracted or rewritten by this deployment.

## Model policy verified

- Analysis: `gpt-5.6-sol`; high reasoning for broad reviews, medium for the focused follow-up.
- PDF/image extraction: existing production override `gpt-5.6-luna` retained. No new document extraction was run in this test.
- Small patient-statement extraction: `gpt-5.6-luna`, reasoning disabled; only the message is sent.
- Exact measurement lookups, arithmetic, chart data and source validation: no model.
- Pure record questions skipped statement extraction. A synthetic statement extraction was tested separately without calling the record-storage function.

## Live results

| Test | Model calls | Input tokens | Output tokens | Model latency | Estimated API cost |
| --- | ---: | ---: | ---: | ---: | ---: |
| Exact latest ALT lookup | 0 | 0 | 0 | No model | $0 |
| Initial full 2026 review, prompt v1 | 2 | 50,675 | 2,715 | 47.5 s | $0.257 |
| Refined full 2026 review, prompt v2 | 2 | 49,777 | 8,171 | 125.1 s | $0.363 |
| DEXA muscle-loss follow-up, prompt v2 | 2 | 36,360 | 1,885 | 35.6 s | $0.183 |
| Synthetic sleep statement extraction | 1 | 323 | 36 | Not separately timed | $0.000108 |

Costs use observed token counts and the [OpenAI standard pricing](https://developers.openai.com/api/docs/pricing) checked on this date: Sol input $4 and output $20 per million tokens; Luna input $0.20 and output $1.20. Cached input was zero in these runs. These are estimates, not invoice totals or forecasts for every question. Output counts include reasoning. Approximately $0.80 was used across these tests.

The refined review supplied 254 evidence items including one targeted read, compared with 162 in the initial review. It used two comparable laboratory trend charts and an ultrasound timeline, with detailed findings expandable. Spot checks covered in-period lab comparisons, imaging versus enzyme discordance, newly documented gallstones, spirometry, and uncertainty around different DEXA systems. The original ultrasound citation opened the correct authenticated PDF at page 24. The focused follow-up declined to infer true muscle loss from the cross-machine comparison.

The refined full review saved successfully, but its 125-second response exceeded the production proxy's non-streaming connection window. Release `001d612` added progress heartbeats and client stream parsing. The subsequent 35.6-second follow-up completed and rendered through the new transport. A further full-review transport retest was blocked by automatic approval review pending explicit authorization for that health-data transfer. Thus a live post-fix request exceeding the previous timeout remains unverified.

## Other checks

- Sign-in with the user-supplied production account succeeded.
- Production app and Postgres healthy; both public login hostnames returned HTTP 200.
- Unauthenticated API access redirects to sign-in before any health analysis.
- 223 tests across 37 files passed; lint and production builds passed.
- Tests include heartbeat timing, final error status, chunked UTF-8 parsing, interrupted streams, and JSON API compatibility.
- Desktop charts, source links, saved-answer reload, and expandable analysis were inspected. Synthetic component fixtures were also checked at mobile width during implementation.

This was a targeted production smoke test and source spot-check, not a formal clinical validation or a controlled cross-model benchmark. Partial evidence coverage is disclosed. The app remains dependent on the quality of confirmed extraction and does not automatically inspect original PDF images for every answer.
