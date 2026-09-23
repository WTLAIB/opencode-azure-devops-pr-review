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

No extra formatter/reviewer model is started. The plugin does not retry failed
stages or switch models. If a provider cannot use the native mechanism, select
`structuredOutput: false` locally and restart. Text mode accepts a JSON object
or one unambiguous fenced object with optional commentary. It does not guess
among multiple envelopes, repair truncated JSON, or ignore host/model errors.

The baseline host supports this field even though its legacy generated SDK
types omit it; the JavaScript SDK forwards the supplied body. Compatibility
must still be tested with the actual provider. See the pinned
[prompt implementation](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/opencode/src/session/prompt.ts)
and [SDK implementation](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/sdk/js/src/gen/sdk.gen.ts).

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
| `run.json` | Run ID, origin, command mode, model profile (`review`/`deep`), language, project, start time; no provider configuration. |
| `NN-azpr-MODE-ROLE.request.json` | Input payload, role instructions, selected model/session, and schema. |
| `NN-azpr-MODE-ROLE.response.json` | Last returned visible text/structured answer, finish reason, model error name/message. Written before envelope validation. |
| `NN-azpr-MODE-ROLE.result.json` | Parsed/validated stage result or error, profile, model/session IDs, timestamps. |
| `NN-azpr-MODE-ROLE.transport-error.json` | Selected SDK error name/message, when available. |
| `NN-azpr-MODE-ROLE.last-message.json` | Best-effort last assistant message from a read-only history lookup after a failed request with no answer. No model is resumed. |
| `result.json` | Overall outcome/error and all completed stage records. |
| `report.md` | Runtime final report, including model attribution and dispositions; or the comment preview/publication receipt. Absent if no report was produced. |

A complete normal or deep review has four stage records: source check, functional
initial review, risk initial review, and final verification. `MODE` is `review`
or `deep`; the two initial file numbers may vary because the sessions start
concurrently. A comment command uses the originating review's profile.

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
