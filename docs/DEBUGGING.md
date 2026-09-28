# Debugging review output

## Receipt versus full

`returnReport` changes only what is returned after the workflow. It does not
change reviewer models, stage prompts, source collection, language settings, or
JSON validation. A receipt failure and a successful full run are two separate
model executions; they do not establish that receipt mode caused the error.

The old generic "required JSON envelope" message could mean plain Markdown,
surrounding commentary, malformed JSON, or an incomplete response. Without that
session's actual output, the cause cannot be determined. New failures include
available finish/error names and character counts, without dumping source into
the receipt. Do not resolve these failures by automatically repeating reviews
or a publishing attempt.

`azpr-*-check: READY` is a successful source-readiness result; later review stages
use COMPLETE. This difference is intentional. A completed review can contain
intermediate MCP errors: `warnings: []` concerns diagnostics/cleanup, not every
tool invocation. Inspect the local child history for actual tool failures.

Receipt mode points the human to read-only session navigation. It does not
authorize the parent model to invoke Task or prompt a finished reviewer. The
reuse-denied error after a completed review may therefore be a report-retrieval
attempt, not a failed review stage. Check `displayed` in the aggregate result and
the saved report. If UI navigation is unavailable, the parent should present the
receipt and diagnostic location without retrieving or regenerating the report.
A later explicit diagnostic request can read local artifacts; full return mode
is an opt-in for including the entire report in the ordinary conversation.

For repeated source lookups, inspect `sourceAccess` and the next stage's request:
confirmed identity, successful argument shapes, failed attempts and checked
alternatives should travel together. Compare tool errors by operation/arguments,
not just final status or elapsed time. Incorrect types, object kinds and version
selection need correction; identical retries do not repair them. A zero-result
search is not evidence of an unavailable index. The prompt's transient-read retry
guidance is separate from `outputRetries` and is not a runtime-enforced MCP cap.

## Inspect an existing failed session

Use the **child session ID** shown beside the failing stage (`session=ses_...`),
not the eight-character AZPR run ID. OpenCode retains its own history even if
plugin debug was disabled. Run locally in the same OpenCode environment:

```sh
opencode export ses_REPLACE_WITH_FAILED_CHILD_ID
```

OpenCode 1.18.31 exports `messages`. Inspect the last assistant message's
`info.error`, `info.finish`, `info.structured`, and text entries in `parts`.
Earlier tool failures are also available in the export if needed. The export
is read-only and does not resume the reviewer. Child sessions can also be
inspected through OpenCode navigation; do not send a new prompt into one.

An ordinary export can contain source, credentials, and other sensitive data.
Keep it local. The CLI also supports `--sanitize`, but sanitized exports redact
text needed for this diagnosis. Share only a manually checked error excerpt,
not a complete export. If the session was deleted or is on another machine,
the plugin cannot recover it from the run ID alone.

Primary reference: [OpenCode 1.18.31 export command](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/opencode/src/cli/cmd/export.ts).

## Output transport

`structuredOutput` defaults to `true`: each role receives a JSON schema using
`session.prompt.body.format`. The host exposes its `StructuredOutput` tool and
returns the envelope in `info.structured`. This is a host output mechanism,
not an ADO tool name or allowlist. The plugin still validates snapshots,
finding IDs, dispositions, and comment-plan constraints.

Only the chosen transport's submission instructions appear in each role prompt.
The verifier declares currentHead as a scalar string: a full SHA, or an empty
string only for INCOMPLETE when the current head could not be verified. JSON text
needs normal JSON string serialization; quotation marks are not part of the SHA
value passed to a tool. Older null/incomplete envelopes remain readable, but no
unknown or quoted-inside-the-value head can complete a review.

No extra formatter/reviewer model is started by default. The plugin does not
rerun full stages or switch models. The opt-in amendments below use the
same model, with distinct status and missing-location contracts. If a provider cannot use the native mechanism, select
`structuredOutput: false` locally and restart. Text mode accepts a JSON object
or one unambiguous fenced object with optional commentary. It does not guess
among multiple envelopes, repair truncated JSON, or ignore host/model errors.

The baseline host supports this field even though its legacy generated SDK
types omit it; the JavaScript SDK forwards the supplied body. Compatibility
must still be tested with the actual provider. See the pinned
[prompt implementation](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/opencode/src/session/prompt.ts)
and [SDK implementation](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/sdk/js/src/gen/sdk.gen.ts).

## Finding-field format notices

`output-format-corrections=N` records local corrections accepted only after full
stage validation. For example, `" evidence"` can become `"evidence"` without
changing its text, and `"evidence_note": ""` can be removed without discarding
content. This does not add a session, call a model, repeat source reads or consume
the amendment allowance. It applies only to initial/verifier finding objects.

Stage `outputFormatCorrections` lists the trusted field path and action; removed
empty unknown fields use their original zero-based property index rather than
echoing potentially private names. Compare the raw `.response.json` with the
validated `.result.json`. The receipt includes a notice even with debug disabled;
the original native/text response also remains in its OpenCode session.

Unknown finding fields whose value is null are also removable, with a distinct
remove-null-unknown-field action. A single redundant CONFIRMED V disposition may
be removed only when its complete finding exactly matches the sole same-ID
newFindings entry; deduplicate-new-finding records both array paths. Original F/R
accounting remains strict, and the redundant reason stays in the original response.

Conflicting keys, misspellings/case differences, missing/empty evidence and
content-bearing extra fields still fail. Diagnostics distinguish, for
example, `findings[0].evidence is missing` from `findings[1].id duplicates an
earlier finding`, without printing source values. The same rules apply to
`dispositions[i].verifiedFinding` and `newFindings[i]`. Other envelope fields are
not normalized, and a failed candidate does not record accepted corrections.
Count format notices separately from native rejections and model amendments.

A host tool marked completed, or zero invalidStructuredOutputs, does not prove
schema conformance. Inspect the saved arguments and the plugin's validator
result; native capture success must not bypass local evidence checks.

## Bounded output amendments

`outputRetries: 1` enables one status OR absent final-location amendment per stage,
with a shared limit of one extra request. Default `0` disables both. This is
post-response validation and bounded feedback, not a patch to OpenCode's native
StructuredOutput implementation; native capture can succeed with missing fields.

### Status

Set `"outputRetries": 1` and restart to enable one status-only resubmission per
review stage. `0` is the default; other values are rejected. This is useful when
the model returned a complete JSON envelope with an invalid top-level status
token, such as `CCOMPLETE`, while every other evidence check passes. Error
messages identify the status field and allowed values without echoing arbitrary
model text. Missing/non-token statuses do not qualify.

The original failed session must have a completed tool call and a confirmed
abort. Completion bookkeeping is not independent proof of a source read. The
same model gets a fresh session with the original envelope and must return only
`{"status":"COMPLETE"}` (or another allowed, truthful status). The plugin keeps
all original evidence/report fields and validates the amended envelope again.
Normal reviewer prompts contain no one-field amendment instructions. Only the
new repair session receives them through a scoped system-prompt replacement;
the host must apply it before the repair model request is allowed. Its private
request artifact records that effective plugin prompt, not the full-review rules.
Ordinary tool use and a second model request in that repair session are denied.
Both transports support this; host `format.retryCount` stays zero. This field
does not prevent the host from continuing after an invalid tool call within the
same session; the separate guard below bounds native structured rejections.

This is not general recovery for `StructuredOutputError`, missing/malformed JSON,
authentication or transport errors, incomplete coverage, missing evidence,
changed heads, cancellation, or comments. Those still stop. No whole workflow is
rerun, and the existing timeout is not reset. Each of the four review stages can
have at most one extra formatting request; extra usage may still be billed by
the selected provider. Host-internal retries and auxiliary calls are separate.

The receipt retains the failed attempt and its error, then lists
`output-retry=1/1` and `retry-of=<original-session>` beside the new session. Debug
files retain both responses; a retry result records `attempt: 2` and `retryOf`.
The first result remains FAILED even when the overall review later completes.
Inspect all attempts when evaluating reliability, not just the final status.

### Missing locations

An initial envelope may omit only the separate location field. These candidates
retain all other evidence and complete coverage, appear as pendingLocations in
stage diagnostics and the verifier request, and produce a pending-locations=N
receipt notice. No value is supplied and no initial location amendment is started,
regardless of outputRetries. The verifier must establish locations for confirmation
or classify unresolved candidates NEEDS_INFO. Inspect final dispositions to see
the outcome; an initial pending-locations count does not claim resolution.

A verifier envelope with COMPLETE and absent finding `location` fields
may qualify only when every other contract passes. The same stopped session is
regranted for one plugin-authored message to keep its original source context.
The model returns only `{"locations":[{"id":"F-1","location":"head:/src/example.ts:12"}]}`
for the requested IDs. It cannot change any original value, use ordinary tools,
start a second model request or switch to status repair. If it cannot establish
the locations from previously read exact-commit source, it must decline; an empty
locations list fails closed. No locations are extracted automatically from prose.

Missing evidence/counterevidence, coverage gaps, invalid IDs, empty existing
locations, changed/unknown heads, comments and uncertain cancellation never
qualify. Native/text parse errors remain terminal except for the narrow complete-text
amendment compatibility below. Both the eligibility
probe and final amended result use the full validator; placeholders never enter
accepted results or diagnostics as evidence.

Receipts retain the first FAILED record and show `retry-kind=location`, an explicit
location notice, and the same session ID for both attempts. Stage results record
`amendedLocations` (IDs and field paths), separate raw response artifacts and
the final validated envelope. Audit these as model-authored amendments, not
independent verification of source lines. The verifier still checks initial
locations against source. Any eligible key normalization is recorded separately
only if the amended full result passes. A second failure ends the stage.

Completed sessions still refuse ordinary reuse. Only the plugin's exact amendment
message, same run/role/model, confirmed abort and isolated system prompt can grant
this exception. The existing whole-command deadline is never restarted.

### Complete JSON text amendments

Only a scoped native amendment can accept a complete JSON text object when the
host reports StructuredOutputError/data.message="Model did not produce structured
output", retries=0 and finish=stop. It must come from that session's assistant,
with no native structured result, one request, no attempted ordinary tools or
native rejections, valid isolated instructions, an active grant and confirmed
abort. Normal review and comment responses cannot use this path.

The parser accepts only a whole JSON object, without preamble, fences or duplicate
keys. No truncated JSON, tool output, reasoning or earlier response is used.
The exact amendment contract and full original stage validation must both pass.
No second request, value inference or JSON repair is added. General provider/SDK
errors, cancellation, content filters and non-stop finish reasons still fail.

An accepted stage records outputTransportFallback (native to json-text) and the
receipt shows output-transport=json-text plus a notice. The raw host error stays
in response diagnostics and the session. A failed candidate gets no acceptance
notice. Count this separately from local formatting and first-pass native success.

## Repeated native submission failures and timeouts

`StructuredOutput` belongs to OpenCode's output transport, not Azure MCP. In the
pinned host, JSON/tool-argument rejection is routed to the built-in `invalid`
tool with the intended tool name. The plugin counts distinct call IDs targeting
StructuredOutput only. Review sessions stop at the second rejection; output
repair and comment sessions stop at the first. Counters are per session, apply
with native output only, and do not depend on outputRetries.

The receipt shows `invalid-structured-output=N` and, at the limit, INCOMPLETE
with a concrete stopping reason. The plugin never repairs quotes or adopts the
rejected result. It adds no model request or session; any continuation after the
first ordinary-review rejection is the host's existing loop. Completed built-in
invalid calls do not count as source/tool evidence. Other provider retries and
MCP errors are outside this guard.

Inspect the failed child export's tool entries for the actual parser error.
Distinguish the recorded native arguments from any visible tool markup and the
host's interruption of a rejected call. Markup alone does not prove the model
ignored tool instructions: serving systems can convert their own markup into
native calls. Compare field values, schema types and finish reasons before
attributing truncation to a model or token limit. Some converters mishandle
array-valued schema types; currentHead deliberately uses a scalar string.
Source reads may succeed even when the final submission cannot be parsed.
Increasing the timeout does not resolve a repeated syntax error, and the plugin
does not recover a result by extracting XML or repairing partial arguments.

The run timeout covers all stages together. TIMED_OUT identifies this deadline
and states the configured seconds. CANCELLED retains the explicit `/pr-stop` or
disposal reason. INCOMPLETE identifies a workflow/output failure, including the
submission limit. None of these statuses supplies an accepted final review.
Abort acknowledgement warnings remain meaningful for every stopping cause.

## Enable local diagnostics

Merge into installed `plugins/azpr/settings.json`, then restart:

```json
"debug": { "enabled": true, "directory": "" }
```

The default uses `XDG_STATE_HOME/opencode/azpr-debug`, or
`~/.local/state/opencode/azpr-debug` if that environment variable is unset or
not absolute. To save in the current project use `"directory": ".azpr-debug"`;
relative paths resolve against the directory supplied by the OpenCode host,
not the installed plugin directory. An absolute trusted directory also works.
Symlink components are refused. Debug write failures produce receipt warnings;
they do not turn a valid review into a failed review or trigger a retry.

Each review/check/comment command creates a unique directory. Inspect the path
printed in its receipt:

| File | Contents |
| --- | --- |
| `run.json` | Run ID, origin, command mode, model profile (`review`/`deep`), language, project, start time and whole-run timeout; no provider configuration. |
| `NN-azpr-MODE-ROLE.request.json` | Input payload, role instructions, selected model/session, and schema. |
| `NN-azpr-MODE-ROLE.response.json` | Last returned visible text/structured answer, finish reason, model error name/message. Written before envelope validation. |
| `NN-azpr-MODE-ROLE.result.json` | Parsed/validated result or error, attempt/retry kind, model/session IDs, timestamps, durationMs, modelRequests, outputCharacters, firstToolAt/lastToolAt when observed, completedTools and invalidStructuredOutputs, including interrupted stages. |
| `NN-azpr-MODE-ROLE.transport-error.json` | Selected SDK error name/message, when available. |
| `NN-azpr-MODE-ROLE.last-message.json` | Best-effort last assistant message from a read-only history lookup after a failed request with no answer. No model is resumed. |
| `result.json` | Overall outcome/error and all completed stage records. |
| `report.md` | Runtime final report, including model attribution and dispositions; or the comment preview/publication receipt. Absent if no report was produced. |

A complete normal or deep review normally has four stage records: source check,
functional initial review, risk initial review, and final verification. An
enabled amendment adds one attempt record for the affected stage. Location repair
uses the original session; status repair creates a new one. `MODE` is `review`
or `deep`; the two initial file numbers may vary because the sessions start
concurrently. A comment command uses the originating review's profile.

Stage results are written after local contract validation. A model can claim
READY/DONE in its visible response while the stage result is FAILED because the
snapshot, plan, or publication report is invalid. Inspect both files. Only the
explicitly enabled cases above can start a bounded amendment.

`modelRequests` counts observed reviewer parameter hooks, not provider-internal
retries, auxiliary requests or billable totals. `outputCharacters` measures the
parsed submission; it does not count streaming tokens. `firstToolAt` is the first
ordinary before-hook and `lastToolAt` the last observed after-hook, not a sum of
network durations. Compare attempt timing and raw sessions when measuring latency;
neither a long post-tool interval nor a completed tool alone proves a model or MCP
failure. Failed calls that never reach the after-hook may lack an end timestamp.

Initial-review diagnostics identify absent or mistyped snapshot, coverage,
findings and report fields without copying their values. A normal initial
submission containing only status is missing the review itself; it cannot use
status-only recovery, even if source tools ran. Do not fill those fields from
the other reviewer or reinterpret the missing report as a completed review.

For quality-contract failures, compare the saved response to its request schema:

- Each initial review needs `coverage.files` and `coverage.gaps`. COMPLETE cannot
  omit a snapshot file or carry review gaps; PARTIAL must explain its gaps.
- Every finding needs `counterevidence`, severity and a correction/verification
  suggestion as well as its ID, summary and source evidence. Initial location
  alone may be absent; final confirmed findings/discoveries require it. No extra
  fields are accepted after the disclosed formatting step above.
- Each CONFIRMED disposition needs the verifier's complete `verifiedFinding`
  under the same original ID; other dispositions must not carry one.
- Comment severity must equal the supplied verified high/medium severity. A
  low-severity finding must be explicitly skipped, not promoted.

Both native and text output use these checks. Install matching runtime/prompts
and restart after an update; old custom prompts must satisfy the new contract.
Apart from the explicit final-location amendment above, no missing fields are
supplied; initial omissions remain absent until verification. No fallback to the
original candidate is performed. Debug data
lets you inspect coverage claims, counterevidence and corrected findings, not
independently prove that source reads or reasoning were correct.

`abortUnconfirmed: true` in `result.json` (also shown as a receipt warning) means
the host did not acknowledge a session-abort request within the local deadline,
or returned an error/unsuccessful result. Grants are revoked locally, but remote
work may still be running or billed. Inspect OpenCode rather than blindly retrying.
Cancelled report displays are not cached as completed reviews; cancelled preview
displays invalidate the saved plan. Advisory notification failures do not stop a
review and do not establish whether a model request succeeded.

Response text and structured-output previews are limited to
`maxStageCharacters`; truncation is explicitly flagged and the full host session
remains the source for inspection. A process crash can leave an unfinished run
without `result.json`. No complete token stream or full tool transcript is
captured. Debug files are diagnostic evidence, not a resumable review cache;
restarting still invalidates saved publication plans.

Files may contain proprietary code or secrets echoed in visible answers.
Filtering out reasoning/tool/header fields is **not secret redaction**. Owner-only
permissions and per-run `.gitignore` files reduce accidental exposure, but forced
Git adds, shared drives, backups, and malicious local programs are outside this
protection. No automatic deletion or retention policy is imposed.

## Language and attribution

Use `outputLanguage: "zh-TW"` for Traditional Chinese (or `zh-CN` for Simplified
Chinese). It controls both final-verifier roles and comment roles in either
return mode. Source checks, initial reviews, structured status values, code,
and JSON keys are not translated. The parent agent is told to preserve the
entire report rather than summarizing or translating it to English. If the UI
still differs, compare `report.md` or the appended child-session report:

- Already English there: inspect the final role's request instructions and
  visible answer; the reviewer did not comply with its language instruction.
- Chinese there but English in the main conversation: the parent model rewrote
  the returned report. The saved report is unaffected.

No language classifier or extra translation model is used. Generated attribution
labels are localized for English/Traditional Chinese/Simplified Chinese; other
languages use English for the fixed footer only.

Model attribution is assembled from invoked review stages, not inferred from
report prose or unused configured slots. Reports include initial finding counts
and every validated original disposition/merge target. The method is independent
initial reviews plus source-based verification, not votes or automatic human
approval. Comments disclose these selected model IDs plus the model assigned
to comment preparation/publication, in the exact saved preview. Check that
model identifiers are approved for disclosure to PR readers before publishing.
