# Debugging review output

## Host readiness and request observations

Preflight checks the configured model slots against connected providers and the
actual V1 capabilities.toolcall flag, plus at least one connected MCP. Failure
creates no reviewer session. Inspect host status locally without sharing provider
configuration or credentials. Catalog readiness cannot prove Azure authorization,
correct version selectors or complete source. Cancellation also covers preflight.

Private auxiliary/compaction requests are denied through V1's available hooks;
ordinary agents keep their models and permissions. V1 has no V2 model.request kind
or retry-decision hook. requestObservations records authorizedPrimary and observed
retry attempt/next metadata, omitting provider error text. These events neither
retry a request nor prove billing, content validity or complete request coverage.
Known private-session tracking is process-local; do not claim V2 restart parity.

## Provider rejection before source reads

A provider error before any MCP call is separate from MCP login or an invalid
review envelope. Some services reject requests when host permissions hide the
native shell schema. If controlled checks establish that cause, explicitly set
`shellToolPermission` to `ask` in the AZPR settings and restart. It retains the
bash schema while the execution guard still rejects calls before host approval.
Other native denials stay active. `run.json` records the selected setting.

Keep the default `deny` when supported, and retest it after host/provider fixes.
Do not infer this cause from every 403, disable the execution guard, or retry
automatically. This compatibility setting does not repair malformed output,
change providers or models, or establish a completed review. See the
[actual-host checks](VALIDATION.md#native-tools-recovery-guidance-and-terminal-diagnostics).

## Incomplete native submissions

A completed StructuredOutput tool call does not prove review quality or source
validity. Review capture now accepts partial objects and locally assesses their
content. A status-only object remains a literal PARTIAL observation; it cannot
supply missing evidence. Compare the original response, adapted result and warnings.

The native default and explicit `structuredOutput: false` text mode use the same
review adapters. A stopped native response with only the exact missing-submission
StructuredOutputError and zero retries can retain already-returned text locally.
Its correction record identifies the transport recovery; the original error stays
in the response artifact. No new model request is added. General provider errors,
truncated/filtered/cancelled output and mismatched response identity remain failed.

Duplicate raw JSON keys cannot choose a field value, including escaped-equivalent
keys. The original review text is retained as unstructured data instead. Settings,
source-check and comment JSON remain strict. Do not infer a provider-only or
model-only cause without the raw response and tool history.

## Receipt versus full

For review syntax recovery, inspect outputFormatCorrections and compare the raw
response artifact with the adapted result. Offsets refer to zero-based UTF-16
positions in the selected JSON body, excluding fences/preamble. Literal retention
uses `retain-unstructured-review`. No model request is added. Corrections do not
certify source truth or erase missing evidence. PARTIAL/STALE reports and drafts
are enclosed even with returnReport=receipt; COMPLETE reports follow the setting.

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

`azpr-*-check: READY` is a standalone source-readiness result; review stages
use COMPLETE. Normal/deep reviews no longer contain a check stage. This difference is intentional. A completed review can contain
intermediate MCP errors: `warnings: []` concerns diagnostics/cleanup, not every
tool invocation. `observed-tool-errors` counts terminal failures observed from
matching host events, without classifying causes or replaying calls. Missing
events are not proof of error-free execution; inspect the child tool history.

Each stage also records value-free `toolObservations`. `hostCompleted` and
`hostErrors` count matching terminal events; `afterHook` counts returned tool
results. `reportedErrors` counts explicit `isError` flags (top-level or metadata),
and `truncated` counts metadata truncation flags. Matching terminal events also
contribute metadata flags: MCP after-hooks may run before host display truncation.
No output paths, source text or arguments are copied into these counters. Counts can overlap;
`observedErrors` is the deduplicated union of host errors and reported errors.
`unverifiedResults` counts observed outcomes without either error or truncation,
not valid source reads. `withoutOutcome` counts registered calls with no matching
after-hook result or terminal event. `evidenceValidity: "not-assessed"` and
`recoveredReads: null` explicitly leave semantic validity and recovery unknown.
The plugin does not inspect bodies, infer causes, match retries or certify content.
`toolFailures`/`observed-tool-errors` retain their original host-event meaning;
`completedTools` counts after-hook returns excluding observed errors/truncation.
A later error/truncation event removes that call from `completedTools`. Repeated events and
after-hooks do not double count; revoked sessions remain ignored.

`toolObservations.rejectedSubmissions` and the receipt's
`rejected-tool-submissions` count distinct host `invalid` submissions. These are
rejected requests, not MCP execution failures, even if the host marks its invalid
handler completed. They are excluded from `registered`, returned/terminal results
and `withoutOutcome`. The count includes structured-output and prohibited-native
submissions, so it can overlap those specialized counters; do not add them as
unique failures. Arguments, requested names and rejection text remain outside
plugin diagnostics. Inspect the original child history for the rejection reason.
Observing a rejection adds no retry, does not classify an MCP operation and does
not change guard thresholds or evidence validation. Older artifacts without this
field have unknown rejection counts; do not backfill them with zero.

Audit retained host outputs separately for invalid/missing evidence and recovered
reads. Keep original counters and responses unchanged in historical artifacts.
Receipts disclose explicit result errors/truncation separately from host errors,
and state that completion is not proof of source evidence. A successful later
read does not erase an earlier failure or prove that its cause was transient.

`blocked-native-tools` and the native-tool notice identify prevented shell,
editing, skill or public-web attempts. Plugin diagnostics omit their arguments.
One prevented attempt may coexist with COMPLETE; two distinct attempts in one
stage stop the run before execution. This does not certify MCP read-only behavior.

Receipt mode points the human to read-only session navigation. It does not
authorize the parent model to invoke Task or prompt a finished reviewer. The
reuse-denied error after a completed review may therefore be a report-retrieval
attempt, not a failed review stage. Check `displayed` in the aggregate result and
the saved report. If UI navigation is unavailable, the parent should present the
receipt and diagnostic location without retrieving or regenerating the report.
A later explicit diagnostic request can read local artifacts; full return mode
is an opt-in for enclosing COMPLETE reports. PARTIAL/STALE reports and drafts
already include their available content.

For repeated source lookups, inspect each initial's calls, snapshot and coverage,
then the verifier's combined paths. There is no checker handoff in normal/deep
runs. Compare errors by operation/arguments, not just duration. Confirm changed
files were explicitly requested before concluding the capability is missing.
Identical retries cannot fix type/version errors; an empty search does not prove
an index outage. Read recovery is separate from outputRetries: one identical
repeat per explicitly transient logical read, plus at most one unknown-cause
idempotent-read repeat per stage with fixed arguments and deadline. Explicit
permission/deterministic errors, writes and incomplete results are excluded.
Successful recovery does not identify the cause. This is prompt guidance, not
a runtime-enforced MCP retry cap.

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

The V1 default uses native StructuredOutput with a permissive review capture
schema. Preferred field descriptions still tell the model to submit complete
findings, coverage, PR versions and final decisions. The runtime subsequently
assesses completeness. Check/comment schemas remain strict.

Explicit `structuredOutput: false` omits the native schema and asks for JSON text.
A single fence is supported. The local parser handles punctuation around complete
values and preserves supplemental text. Ambiguous JSON or prose stays literal;
no substring or JSON example is promoted into complete evidence.

Inspect request.format, response.structured/response.text, result.result,
outputFormatCorrections and reviewWarnings together. A response can be captured
correctly while its facts remain incomplete. Changing transport requires restart
and a separately authorized new review; it cannot repair a historical run.

## Finding-field format notices

Known field spelling and enum case can be normalized. Numeric PR IDs and quote
wrappers around full 40/64-character SHAs are formatting; unknown versions remain
unknown. Extra fields are retained. Conflicting aliases retain both values and
prevent full contract acceptance. Missing evidence and coverage remain warnings.

Repeated/missing initial IDs receive bookkeeping IDs while originalId preserves
the supplied value. The verifier receives all expected IDs and pending locations.
Missing final decisions become runtime UNREVIEWED rows, not model rejections.
Inspect original observations and the complete verifier result, especially when
category arrays and legacy dispositions both appear.

A COMPLETE verifier can follow a PARTIAL initial. Its report remains available,
but comments are unavailable unless every initial/final publication contract and
version check passes. A PARTIAL report is useful output with limitations; it does
not prove that no issue exists. Factual/presentation quality needs separate review.

## Bounded output amendments

`outputRetries: 1` permits only a standalone source-check status amendment when
all other strict check contracts pass and a tool completed. It uses one fresh
same-model session, one request, isolated instructions and no ordinary tools.
Original evidence is immutable. Cancellation, unknown abort state, missing hooks,
changed fields, provider errors and repeated requests prevent acceptance.

The exact V1 completed missing-native error may allow one complete text object
within that already authorized check amendment, with the original validators.
It is recorded as outputTransportFallback and never starts another request.

Initial/verifier stages no longer start status, location, merge or final-content
amendments. Their local adapters retain useful results and disclose limitations
regardless of outputRetries. Old failed/amended artifacts remain historical data;
do not relabel them as successful new-format runs. Comments never retry.

## Repeated native submission failures and timeouts

`StructuredOutput` belongs to OpenCode's output transport, not Azure MCP. In the
pinned host, JSON/tool-argument rejection is routed to the built-in `invalid`
tool with the intended tool name. The plugin counts distinct call IDs targeting
StructuredOutput only. Review sessions stop at the second rejection; output
repair and comment sessions stop at the first. Counters are per session, apply
with native output only, and do not depend on outputRetries.

The receipt shows `invalid-structured-output=N` and, at the limit, INCOMPLETE
with a concrete stopping reason. The plugin does not adopt rejected native arguments;
local recovery applies to an already-returned completed review response. It adds no model request or session; any continuation after the
first ordinary-review rejection is the host's existing loop. Completed built-in
invalid calls do not count as source/tool evidence. Other provider retries and
MCP errors are outside this guard.

Inspect the failed child export's tool entries for the actual parser error.
Distinguish the recorded native arguments from any visible tool markup and the
host's interruption of a rejected call. Markup alone does not prove the model
ignored tool instructions: serving systems can convert their own markup into
native calls. Compare field values, schema types and finish reasons before
attributing truncation to a model or token limit. Some converters mishandle
array-valued schema types; the preferred currentHead representation is a scalar string.
Source reads may succeed even when the final submission cannot be parsed.
Increasing the timeout does not resolve a repeated syntax error, and the plugin
does not recover a result by extracting XML or repairing partial arguments.

The run timeout is disabled by default. When enabled, it covers all stages together.
TIMED_OUT identifies this deadline
and states the configured seconds. CANCELLED retains the explicit `/pr-stop` or
disposal reason. INCOMPLETE identifies a workflow/output failure, including the
submission limit. None of these statuses supplies an accepted final review.
Abort acknowledgement warnings remain meaningful for every stopping cause.

## Timeout and large responses

The plugin no longer configures host iteration limits or caps stage characters.
Installation removes the former `steps` and `maxStageCharacters` settings. If
startup reports one as unknown after a manual update, run the matching installer
with `--replace` or remove those fields yourself, then restart OpenCode. Do not
raise an obsolete limit. Historical artifacts retain their original fields and
must be interpreted using the version that wrote them.

`runTimeoutSeconds` defaults to null (disabled); omission also disables it.
Existing numeric timeouts survive installation, so explicitly set null to disable
an old timeout. Inspect the configured timeout in `run.json`, observed
`modelRequests`, tool events and host history. A model's own maximum-step report
does not establish a runtime stopping cause. `remainingRunMsAtStart` and
`remainingRunMsAtEnd` are null without a deadline, not zero/exhausted. Without a
timeout, a stalled run needs manual cancellation or another existing stop
condition; cleanup and SDK abort acknowledgements remain bounded.

Separate input-tool truncation from final-output limits. Removing plugin budgets
does not recover missing tool bytes or enlarge model context. Check whether
the server returned incomplete data or OpenCode saved a complete response and
displayed a truncated preview. The shared policy permits supported continuation
and same-session host-saved output under host read permissions; it does not grant
general local access or certify the saved file's completeness. See
[large tool responses](AZURE_MCP.md#large-tool-responses).

An initial reviewer keeps its established snapshot; inability to make an extra
metadata read does not require omitting that snapshot. The verifier owns final
freshness. Missing initial location alone has its existing exception, while
missing source/coverage remains PARTIAL. Inspect raw envelopes rather than changing
statuses, copying SHAs from prose or silently repairing incomplete findings.

## Final submission recovery

Read result.reviewWarnings and the final report alongside the original response.
Incomplete corrected findings, cycles, omitted decisions and unknown versions
produce PARTIAL output. Explicit changed versions remain STALE. Original missing
IDs are rendered as UNREVIEWED with their observations. No model resubmission is
requested. If the verifier's execution itself fails, draft.md can retain accepted
initial observations while failed verifier claims remain only in diagnostics.

Before spending another model call, determine whether the limitation came from
source access, capture/formatting, evidence quality, cancellation or the provider.
Keep raw calls and failed runs. A complete transport exchange does not establish
that a model interpreted dates, recovery behavior or impact correctly.

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
| `readiness.json` | Checked model slots, connected MCP count and sourceAccess=not-assessed; no credentials or provider configuration. |
| `run.json` | Run ID, origin, command mode, model profile (`review`/`deep`), language, project, start time, whole-run timeout (null when disabled); no provider configuration. |
| `NN-azpr-MODE-ROLE.request.json` | Input payload, role instructions, inputCharacters/instructionCharacters, remainingRunMsAtStart (null without a deadline), selected model/session, and schema. |
| `NN-azpr-MODE-ROLE.response.json` | Last returned visible text/structured answer, finish reason, model error name/message. Written before envelope validation. |
| `NN-azpr-MODE-ROLE.result.json` | Accepted result with reviewWarnings or error, attempt/retry kind, model/session IDs, timestamps, durationMs, modelRequests, inputCharacters/instructionCharacters/outputCharacters, remainingRunMsAtStart/remainingRunMsAtEnd (null without a deadline), firstToolAt/lastToolAt when observed, completedTools and invalidStructuredOutputs, including interrupted stages. |
| `NN-azpr-MODE-ROLE.transport-error.json` | Selected SDK error name/message, when available. |
| `NN-azpr-MODE-ROLE.last-message.json` | Best-effort last assistant message from a read-only history lookup after a failed request with no answer. No model is resumed. |
| `result.json` | Overall outcome/error and all completed stage records. |
| `report.md` | Rendered accepted final fields, limitations and overview/provenance; or comment preview/publication receipt. |
| `draft.md` | Clearly unconfirmed initial observations after an incomplete review; never a completed report or comments input. Aggregate reportKind is incomplete-draft. |

A complete normal or deep review normally has three stage records: functional
initial review, risk initial review, and final verification. Standalone `/pr-check`
has one source-check record. An enabled source-check status amendment adds one attempt in a new session. `MODE` is `review`
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

### Timing without replaying a session

Debug-enabled stage results include `timing`. Offsets are monotonic milliseconds
relative to that attempt's grant creation (after session creation). Hook timing
is monotonic; a host terminal event can supply a missing end relative to the
recorded wall-clock origin, with bounds checks for skew and post-response execution.
Collection uses existing hooks, events and the SDK promise; it
does not fetch messages, add a model request, or alter validation/permissions.

| Field | Interpretation |
| --- | --- |
| `elapsedMs` | Attempt time through validation/error cleanup, before writing its result file. |
| `promptMs`, `responseOutcome` | SDK prompt dispatch until its promise settles: returned, rejected, or interrupted. A returned response can still fail validation. Null means dispatch/settlement was not observed. |
| `toolCalls` | Ordinary tool name, startMs/endMs, durationMs and outcome: returned after hook, terminal completed/error, or null. No call ID, arguments, output, error text or reasoning. End/duration remain null without an after-hook or valid terminal event. |
| `toolActiveMs`, `unfinishedTools` | Union of tool intervals, counting overlap once; null if any completion is missing. A completed hook does not imply a successful tool result. |
| `modelRounds` | Windows from an authorized chat.params hook to the next one or prompt settlement/stage stop. Each has startMs/endMs, durationMs, toolActiveMs, outsideToolMs and endReason. |
| `lastToolToResponseMs` | Last observed ordinary tool completion to a returned SDK response; null with no tools, missing completions or rejected/interrupted dispatch. |
| `responseProcessingMs` | Prompt settlement to attempt end, including response diagnostics, validation and any failure cleanup/history lookup. |

Model windows include tool execution, permissions, host scheduling and provider
waiting/generation; even `outsideToolMs` is **not** pure inference time. Tool
intervals can include permission prompts and host overhead, not just Azure/MCP
server work. Missing after-hooks without terminal events make active/outside
values unknown rather than treating that time as model work. Duplicate/conflicting
events do not rewrite terminal outcomes; late callbacks cannot mutate finished
attempts or revoked grants. A source-check amendment
has its own timing in its new session.

The pinned host's native StructuredOutput can bypass ordinary tool hooks. The
last-tool-to-response interval therefore measures an observed boundary, not a
separate StructuredOutput execution or token streaming rate. Provider queue time,
time to first token, hidden retries and auxiliary model work are not measured.

Aggregate `result.json.timing` has `renderMs` for the local review/draft renderer,
`displayMs` for the noReply report append, and `cleanupMs` for the workflow's final
abort acknowledgement and lock release. It excludes diagnostic file writes and
does not replace per-attempt failure cleanup timing. These values are not additional
model time and should not be added to overlapping stage intervals indiscriminately.

### Sizes and remaining budget

`inputCharacters` is the serialized plugin payload length; `instructionCharacters`
is the selected plugin policy length (the isolated amendment policy for a repair).
These omit host/provider instructions, MCP schemas and retained history, and are
not token or billing measurements or character limits. `remainingRunMsAtStart`
and `remainingRunMsAtEnd` are null without a deadline, otherwise nonnegative
observations of the whole-run deadline, including cleanup time before the attempt
record is written. They do not reserve time, shorten a stage or reset the deadline.
When a timeout is enabled, compare them to see how much time reaches the
verifier; a smaller prompt alone does not prove less model waiting or generation.

For standalone readiness regressions compare its sourceAccess claims with actual tool history,
especially the cumulative base, continuation fields and both branch-tip reads of
a claimed fallback. The compact checker does not inherit finding-analysis rules;
it must still report NOT_READY if required evidence is missing. Count successful
but empty discovery queries separately from errors. Neither deleting optional
queries nor reclassifying missing optional data can make required evidence exist.

Initial-review diagnostics identify absent or mistyped snapshot, coverage,
findings and report fields without copying their values. A normal initial
submission containing only status is missing the review itself; it cannot use
status-only recovery, even if source tools ran. Do not fill those fields from
the other reviewer or reinterpret the missing report as a completed review.

For quality-contract limitations, compare the raw response, adapted result and
strict completeness assessment. Coverage should include every changed path;
repository/PR and both SHAs should agree; final confirmed findings need complete
source locations, counterevidence, severity and suggestions. Missing data stays
missing. Extra fields remain visible instead of causing delivery failure.

Conflicting initial versions go to the verifier with warnings. Explicit changed
current versions stay STALE; unavailable versions produce PARTIAL. Unknown or
missing decisions cannot silently discard original observations or authorize
comments. The runtime never supplies missing final evidence or retries a model
to obtain it. A COMPLETE verifier does not override initial publication gaps.

Comment severity still must match the corrected high/medium finding. Low-severity
findings must be skipped. Debug data lets you inspect claims; it cannot prove the
truth of source, reasoning, severity or semantic duplicate decisions.

`abortUnconfirmed: true` in `result.json` (also shown as a receipt warning) means
the host did not acknowledge a session-abort request within the local deadline,
or returned an error/unsuccessful result. Grants are revoked locally, but remote
work may still be running or billed. Inspect OpenCode rather than blindly retrying.
Cancelled report displays are not cached as completed reviews; cancelled preview
displays invalidate the saved plan. Advisory notification failures do not stop a
review and do not establish whether a model request succeeded.

Response files retain the complete selected visible text, structured answer and
error message returned by the host, without plugin previews or character cuts.
There are no answer-preview truncation flags in new files; upstream finish reasons
and tool-truncation observations remain separate. This preserves what the host
returned, not missing provider tokens or server bytes. Large answers use more
memory and disk space. A process crash can leave an unfinished run without
`result.json`. No complete token stream or full tool transcript is captured.
Debug files are diagnostic evidence, not a resumable review cache; restarting
still invalidates saved publication plans.

Files may contain proprietary code or secrets echoed in visible answers.
Filtering out reasoning/tool/header fields is **not secret redaction**. Owner-only
permissions and per-run `.gitignore` files reduce accidental exposure, but forced
Git adds, shared drives, backups, and malicious local programs are outside this
protection. No automatic deletion or retention policy is imposed.

## Rendered reports and incomplete drafts

The final `report` field is now a short checks/limitations overview. Full Markdown
is generated from accepted structured fields, limitations, extra content, disposition reasons
and model ledger. Inspect those structured fields as well as report when debugging
content; a short raw report field is intentional. No extra model formats it.

INCOMPLETE runs can retain accepted initial observations as a clearly marked draft,
including missing IDs and failure details. Failed final claims are not adopted.
An inactive/abort-uncertain run never resumes a session to display its draft;
diagnostic storage remains available when enabled. Both return modes include
available drafts with their unconfirmed labels. Drafts cannot feed
comment preview/publication. The receipt itself is never a review report.

## Language and attribution

Use `outputLanguage: "zh-TW"` for Traditional Chinese (or `zh-CN` for Simplified
Chinese). It controls final human-readable structured fields, the overview, and comment roles in either
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
