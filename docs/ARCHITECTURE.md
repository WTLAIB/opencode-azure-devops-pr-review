# Architecture and trust boundaries

## System map

```text
Explicit /pr-review or /pr-deep + URL + literal context
  -> command hook / shared lifecycle / session grants
  -> source check (selected profile's risk model)
  -> fixed cumulative PR snapshot
       +-> functional session --+
       +-> risk session --------+  concurrent, independent, full coverage
  -> verifier session (source checks + dispositions + current-head check)
  -> final report + deterministic model/method disclosure
  -> completed-review memory cache (only for COMPLETE)
       -> explicit /pr-comment: preview
       -> explicit /pr-comment --publish: one attempted saved batch

Each stage -> OpenCode Session SDK -> configured providers and host tools/MCP
Optional diagnostics <- stage records (private files; not a resumable cache)
```

`/pr-check` stops after the source check and uses the normal profile's risk model.
`/pr-stop` revokes active grants and requests child-session cancellation. There is
no Azure client, model SDK, background job, or automatic publishing path here.

The source checkout, installed plugin, and PR-under-review are separate things.
Editing the checkout does not update an installed plugin; installation and a host
restart are explicit steps. A test repository is test data, not another copy of
the plugin source. Machine-specific locations belong in the private local handover.

## Accepted design decisions

These are current constraints, not an instruction to reimplement completed work.
Revisit them with an explicit decision and evidence, not as incidental cleanup.

| Decision | Reason and tradeoff | Revisit when |
| --- | --- | --- |
| Two full-scope initial reviews with different emphasis, then one verifier | Independent candidates plus evidence checking; costs more than one pass and does not prove better recall. | Representative, independently labeled PR evaluations support a change. |
| Separate three-role normal/deep profiles | Direct configuration, static model bindings, and no hidden deep fallback; six configurable slots need not mean six distinct models. | A demonstrated workflow need outweighs added configuration complexity. |
| Host-owned tools with no MCP catalog | Supports renamed tools and existing connections; source truth and read-only compliance remain model/host responsibilities. | A separately approved adapter/security requirement justifies narrowing this scope. |
| Strict contracts with opt-in, single status-only resubmission | Recovers an invalid status without changing evidence or rerunning source work; adds at most one model request per stage. All other failures remain terminal. | Reproduced failures support a separately evaluated recovery class. |
| Explicit saved comment preview and one publication attempt | Keeps human inspection before account-owned comments and limits duplicate attempts; publication is still model-reported. | Verified provider evidence or resumability is explicitly requested and designed. |
| Seven runtime modules, editable policies, source-only installation | Small auditable boundaries and manual-copy support; file catalogs need synchronized tests. | Measured complexity or distribution needs justify more structure. |
| In-place settings migration, no retained install backup | Preserves preferences with missing-default merging; malformed settings require correction before install. | The owner explicitly changes the backup/retention requirement. |
| OpenCode 1.18.31 compatibility baseline | Host hooks and pre-hook expansion are version-sensitive. | A host upgrade is requested and audited with offline and live checks. |

Development procedure lives in [AGENTS.md](../AGENTS.md); planned work and its
acceptance gates live in [ROADMAP.md](ROADMAP.md). The rest of this document is
the current implementation and its limits, not a feature wishlist.

## Workflow ownership

The local plugin controls a fixed workflow through the OpenCode-provided Session SDK. It does not use nested Task orchestration, a global review skill, an external model SDK, or a separate launcher.

The source entry is `src/plugin.js`, which imports the runtime beside it. Installation creates a small `plugins/azpr.js` loader that re-exports `./azpr/plugin.js`. Runtime code, prompts, settings, generated module metadata, and any supplied optional uninstaller/docs/schema live under `plugins/azpr/`. The source `package.json` is not required; installation generates the minimal `type: module` declaration. The loader does not import through a parent directory. OpenCode 1.18.31 scans top-level plugin `.js`/`.ts` files; nested helpers are not separate entries.

A source check runs first. Both normal and deep profiles then run two initial reviewers (functional and risk) concurrently in separate child sessions, each receiving the same request and snapshot but no other initial review. Their configured verifier starts only after both initial reviews complete successfully. Deep adds depth instructions and its own initial iteration budget, not a third initial reviewer or an automatic fallback.

Each mode owns `functional`, `risk`, and `verifier` model settings. Its risk model also handles source checks and comments; standalone `/pr-check` uses the normal profile's risk model. The selected profile is bound to the run and cached with completed reviews, so later comment commands use the original profile even after a different mode runs.

Command input is parsed into `prUrl` and literal `userContext`, while retaining
the original request. All stages receive those fields directly; context is never
replaced by the checker's summary or inherited from earlier commands. Receipt
diagnostics identify the failing workflow phase without echoing supplementary text.

Recognized cloud URL layouts also produce `urlIdentity` hints separating the
organization/project/repository; unknown server layouts remain untouched. Hints
are not verified server identity and never drive an API call. The checker's
optional `sourceAccess` string map carries observed identity, successful argument
recipes, failed attempts and checked alternatives through the existing packet to
both initials and the verifier. These untrusted notes do not replace independent
source reads or expose sibling findings. Prompt policy discourages deterministic
retry loops and unrelated discovery while preserving cumulative scope, pagination
and freshness. No MCP catalog, argument adapter or programmatic retry was added.
See [source-access discipline](AZURE_MCP.md#avoiding-repeated-lookup-failures).

## Authorization

Only explicit command events create grants. Commands must have the expected ownership marker and must not override the original agent or model.

Each grant binds a run, session ID, private role, and exact model. The runtime checks grants in message, model-parameter, and tool hooks. Ordinary agents cannot invoke private reviewers through Task or mentions. Hidden agent metadata is a UI hint, not an authorization mechanism.

Each profile has six private agents: check, functional, risk, verifier, comment-plan, and comment-publish. Twelve static `azpr-review-*`/`azpr-deep-*` agent definitions bind the two profiles to their configured models; this is not twelve stages per run. No shared agent is rewritten per command, so simultaneous normal/deep runs from different origins cannot switch each other's model bindings. Partial deep configuration disables all deep agents and refuses deep commands without model calls.

Normal model, default agent, auxiliary model, permission, provider, MCP, and subagent-depth settings are preserved. Ordinary chat and tool hooks return without reading review settings or calling the Session SDK, except to reject unauthorized access to private roles.

Configuration fingerprints prevent route changes during a run. Editing settings requires a restart. Grants are revoked after each stage and at completion or cancellation.

## Run lifecycle

Review and comment commands share one lifecycle owner inside the adapter. It
checks SDK availability, acquires origin/PR locks, starts the deadline, initializes
diagnostics, invokes the workflow, displays the result, revokes grants, and releases
locks. Workflow callbacks own only review/comment decisions, not a second copy of
timer and cleanup logic. Existing same-origin and comment-target serialization
rules are unchanged; separate origins may run normal and deep reviews concurrently.

UI toasts and setup logs are advisory, non-blocking requests with short deadlines.
A missing UI response cannot strand an active run. Session-abort and last-message
requests have five-second local deadlines even if an SDK ignores its signal.
Concurrent cancellation and cleanup await the same abort operation. Unconfirmed
aborts are disclosed; local grant revocation does not prove that remote work or
billing stopped.

The deadline covers the whole workflow, including stage transitions, status
amendments and report display. It returns TIMED_OUT with the configured limit;
explicit `/pr-stop` and disposal return CANCELLED with their respective causes.
The controller carries the original reason so an SDK abort error cannot replace
it with a generic message. An output-submission guard can revoke the same grants
and request abort while retaining INCOMPLETE as the outcome. Stage results keep
completed-tool and invalid-submission counts even when prompt() never returns.

Completed review records become available for comments only after the workflow
finishes without cancellation. Cancelling during report display does not leave a
publishable completed review. Cancelling or failing a refreshed comment preview
invalidates both the previous and newly prepared plan. Publication attempts remain
uncertain/reported records and are never automatically retried or rolled back.

## Evidence contract

Every stage returns a JSON envelope. By default, the OpenCode 1.18.31 native JSON-schema transport puts it in `info.structured`; `structuredOutput: false` selects text compatibility. A single unambiguous JSON fence is accepted, but invalid/truncated JSON is not repaired and no full stage is automatically rerun. The audited finding-format normalization and opt-in status-only resubmission below preserve evidence validation. Snapshot validation requires a repository, positive PR ID matching the requested URL, full base/head hashes, cumulative scope, and a nonempty unique file list. Initial and final snapshots must match, including file order. URL/ID consistency is not independent verification of repository identity or source contents.

Shared review policy is transport-neutral. The compiler appends exactly one
submission instruction: native StructuredOutput or JSON text. Envelope examples
describe field contents; they are not an additional text-output requirement.

Source checks, initial reviews, final verification, comment plans, and publication
receipts all pass their local contract validator inside the stage boundary before
the stage records a valid result. A malformed READY plan or DONE publication report
therefore appears as a failed stage with its original response/session preserved,
not a successful stage followed by an unexplained workflow failure. A valid but
incomplete publication report remains incomplete and model-reported.

Initial finding IDs use `F-` and `R-` prefixes in both modes. Every original ID must have exactly one final disposition: `CONFIRMED`, `NEEDS_INFO`, `REJECTED`, or `MERGED`. Only merged items may name a merge target, which must be another original ID. Chains must terminate at a non-merged disposition; cycles are rejected rather than hiding every finding as a duplicate. Confirmed final-verifier discoveries use `V-` IDs in both the report and the structured `newFindings` array. Without that structured entry they cannot be automatically published.

Initial envelopes also require `coverage: { files: [...], gaps: [...] }`. Files
must be unique exact members of the snapshot; order does not matter. COMPLETE
requires every snapshot file and no gaps, including reviews with zero findings.
PARTIAL requires a concrete gap explanation and never reaches final verification.
The snapshot itself still preserves the original file order. This ledger records
the model's claimed coverage, not an independent source-access audit.

All findings require `id`, `summary`, `location`, `evidence`, `counterevidence`,
`severity` (high/medium/low), and `suggestion`. Prompts require a reachable trigger,
observable impact, exact-commit source/call-path evidence, checks for safeguards
or alternative explanations, and a focused correction and verification case.
These are checkable summaries, not private reasoning traces or confidence scores.
Runtime checks establish field presence and types, not the truth of their text.

Location guidance requires one-based lines recounted from the exact source,
including blank lines/comments and excluding transport wrappers. The verifier
must correct initial locations in both verifiedFinding and the report rather
than inherit a merge representative's offsets. Unknown locations remain unresolved;
these are prompt/schema descriptions, not runtime validation against source.

CONFIRMED requires a complete `verifiedFinding` with the same original ID. It is
the verifier's authoritative corrected claim, including revised scope, conditions,
location and severity. Other dispositions cannot carry that field. The original
candidate remains audit data; it is not used as a fallback when preparing PR
comments. New `V-` findings pass the same evidence contract. NEEDS_INFO is for
unresolved evidence, while REJECTED must explain a concrete refutation in prose.
MERGED means the same root cause and correction; distinct triggers/impacts must
be retained in the confirmed representative rather than silently discarded.

The final verifier reports the current PR head. A mismatch becomes `STALE`, with no automatic rerun. Invalid JSON, inconsistent snapshots, missing dispositions, or partial initial reviews produce an incomplete result.

The native `currentHead` schema has scalar `type: "string"`, avoiding tool
converters that mishandle array-valued nullable types. Its value is the full SHA,
without extra quote characters; an unavailable head is an empty string with
INCOMPLETE. Existing runtime validation still accepts historical null/incomplete
results, rejects unknown or malformed heads for COMPLETE/STALE, supports full
40/64-character hashes, and marks a different current head STALE. It never strips
quotes, copies the snapshot head into missing output, or parses XML tool markup
as a substitute for an accepted envelope. This is a schema compatibility measure,
not proof of any hosted provider's parser implementation or live reliability.

Every stage must observe message and parameter hooks. Source access, coverage, and current HEAD are model-reported; the runtime does not classify MCP calls or decode their results to verify those claims. Missing access should be reported as NOT_READY by the checker, not rejected because a preferred tool name was absent.

### Audited finding-format normalization

A native StructuredOutput capture does not certify the plugin's evidence contract.
Both transports therefore use local finding validation: exactly the seven schema
keys, nonempty values, role-prefixed unique IDs and the allowed severity values.
Errors identify array indices and field paths, including verifiedFinding and
newFindings; they never echo source values, arbitrary IDs or unknown key names.

After parsing, before validation, an initial/verifier envelope with a valid
top-level status may undergo two deterministic changes to finding objects:

- Trim only ASCII JSON whitespace (space, tab, CR, LF) around an otherwise exact
  known key. Any collision, even between equal values, fails.
- Remove an unknown field only when its value is exactly the empty string.
  Whitespace strings, nulls, arrays, objects, numbers and booleans are not empty
  for this rule and remain invalid extras. No content-bearing field is dropped.

No spelling/case correction, evidence synthesis, value trimming, JSON repair,
status inference or snapshot/coverage/report/head change occurs. The original
response is never mutated. Only a candidate that passes the entire existing
stage validator is accepted; corrections alone cannot make a stage complete.
The stage records each accepted correction's path/action and, for unknown keys,
its zero-based property index in the original finding. Receipts always disclose
the count and meaning, including when debug logging is off. Saved response files
retain the raw output and result files contain the validated candidate.

This path adds no model/session/tool request and is independent of outputRetries.
It excludes source checks, comments, invalid statuses and status-repair grants.
A submission needing both a status amendment and finding-format corrections
cannot qualify for the status-only retry. Normal prompts still request exact
keys; normalization is not an alternative output format for reviewers.

### Bounded status resubmission

`outputRetries` accepts only `0` (default) or `1`. Recovery applies only to the
check/initial/final review roles and an invalid top-level uppercase status token
of at most 24 characters. The original response must parse as one object, pass
all other contracts when checked with its successful status, and have at least
one completed ordinary tool call. This local probe is not adopted as a result
and does not establish source authenticity or infer the intended status.

The failed attempt remains FAILED with its response, error and revoked grant.
Only after a confirmed abort, while the original run is active, can a fresh
session request a status amendment from the same role/model. Its payload contains
the immutable original envelope, allowed statuses and the validation error; it
does not add another initial reviewer's material. Native transport uses a schema
containing only `status`; text transport requires the same one-field object.
The plugin combines the model's explicit amendment with the original fields and
runs the entire original validator again. It never uses the probe's status.

Normal agent definitions contain no status-amendment instructions, even when
outputRetries is enabled. For a granted repair session only, the system-transform
hook replaces exactly one occurrence of that role's known reviewer prompt with
the standalone amendment instructions, mutating the host's retained system array
in place. Host/provider/other-plugin context is preserved. Static agents, model
bindings and configuration fingerprints do not change. Auxiliary requests without
the reviewer prompt are left alone, even if they share the repair session ID.

The grant, not a model-supplied operation field, selects this path. The model-
parameter hook requires proof that the isolated repair prompt was applied before
allowing the one request. Missing, duplicate or unsupported host prompt layout
stops repair; it never falls back to combining full-review and one-field rules.
The repair request's private diagnostic instructions show the amendment prompt.

Repair grants deny all ordinary tools and a second `chat.params` model request.
The pinned host's native StructuredOutput tool executes outside ordinary tool
hooks; it remains available solely for the one-field submission. The existing
run deadline, cancellation, configuration/model checks and cleanup still apply.
No recursive retry, provider/model switch, or revoked-session reuse is allowed.
Host/provider-internal retries and auxiliary requests are outside this bound.

Malformed/missing output, provider/SDK errors, incomplete evidence, changed heads,
unconfirmed aborts and cancellations do not qualify. Comment preview/publication
never qualify. A second format failure ends the stage. Each attempt has its own
session and diagnostic files; the amendment records `attempt: 2` and `retryOf`.
Receipts retain the first error even after recovery. Final provenance uses only
validated results, with at most one accepted result per role. Live model
compatibility and reliability improvement still require acceptance testing.

### Rejected native submissions

The pinned host routes rejected StructuredOutput arguments to its built-in
`invalid` tool through `tool.execute.before`. Native review sessions stop on the
second distinct invalid structured call; status-amendment and comment sessions
stop on the first. Call IDs deduplicate hook delivery; counters belong to the
individual session and do not combine independent reviewers. Built-in invalid
results never count as completed source work for the status-amendment gate.

This bounds an existing host loop, independently of outputRetries. It neither
starts another request/session nor repairs malformed JSON. The first review
rejection can still be followed by the host's next normal turn, within the same
step/time budget; other provider retries remain outside this guard. Only native
StructuredOutput rejections are counted. Ordinary chat, text transport and MCP
tool errors retain host behavior and permissions.

At the limit, authorization is revoked synchronously for the entire run, including
concurrent siblings, and the receipt reports INCOMPLETE with the role and count.
The hook does not await its own SDK abort; lifecycle cleanup awaits bounded
acknowledgement. Raw rejected arguments/errors stay in the host session, not in
the receipt. No incomplete report becomes available for publication.

### Quality-first policy

The design borrows independent candidate verification and scoped repository-rule
checking from the public [Claude code-review command](https://github.com/anthropics/claude-code/blob/db8834ba1d72e9a26fba30ac85f3bc4316bb0689/plugins/code-review/commands/code-review.md),
not its README's older confidence-scoring description. It does not copy fixed
tool names, automatic PR skipping, diff-only restrictions, or per-finding agent
fan-out. Two independent full reviews and one verifier remain the fixed workflow,
with unchanged model settings and budgets. Even empty initial finding lists go
through independent source verification and the current-HEAD check.

Applicable repository guidance can inform the review, but only as untrusted
data. Rule-based findings must cite an explicit requirement, its file/commit and
applicable path scope. Changed rules/contracts must be compared across base/head;
they cannot silently authorize their own implementation or alter tool permissions.
Conditional failures, unusual inputs and races remain valid review targets when
supported by evidence. Numeric self-confidence and reviewer agreement are not
substitutes for verification. Missing contracts and unexecuted tests stay visible.

These changes strengthen auditability and prevent structural inconsistencies.
They do not establish improved bug recall or lower false-positive rates; those
require evaluation on representative PRs with independent ground truth.

## Tools and reports

Private agents add only task=deny to prevent nested model delegation. No MCP name, prefix, action, argument, or response-schema filter exists. OpenCode supplies tools and applies its normal global/project permission rules; agent-only overrides from the originating Build/Plan session are not copied. Review prompts prohibit modifications and unrelated tool use, but the plugin does not enforce a read-only MCP boundary. Tool hooks retain lifecycle checks, completed-call bookkeeping and the native-submission guard above, never semantic MCP read/write classification. Display and status-repair grants deny all ordinary tools. See [MCP ownership and limitations](AZURE_MCP.md).

The final Markdown is appended with `noReply: true`. A display-only grant rejects model and tool calls. If display fails, the original JSON report remains in the session. Receipt mode returns only status and location information to the original conversation; full mode also returns the final report. Neither mode changes stage requests or parsing. A deterministic provenance section lists invoked model IDs, initial counts, dispositions, and the comparison method. The parent agent is instructed to reproduce it verbatim; the plugin cannot guarantee the parent's presentation.

The top-level `outputLanguage` (default `en`) is validated as a language tag and canonicalized. Only final-verifier and comment roles in each profile receive a generated language instruction and an input language field. Completed reviews retain that language for later comments. It controls final-report Markdown and comment prose, not intermediate review output, structured fields, code identifiers, or status receipts. Full-report receipts instruct the original agent not to translate the enclosed report. The publisher receives unchanged saved bodies and is instructed to send them verbatim. Language quality is model-dependent; no language detector or additional translation call is used.

Cancellation revokes grants before requesting session abort and never aborts the parent development session. A request already sent to a provider may still be billed. The host's UI disconnect or Ctrl+C behavior is not guaranteed to propagate cancellation. A wall-clock timeout provides an additional limit.

## Explicit comment boundary

Completed reviews are cached in memory (latest 20). Preview validates confirmed
finding IDs, body length, exact agreement with verified high/medium severity, changed-file coordinates, anchor shape,
coverage of eligible IDs, and a deterministic marker. It does not inspect MCP
outputs to verify source, HEAD, identity, or duplicates: those are model tasks.
Low-severity confirmed findings require a skip explanation; the planner cannot
raise their severity to publish them. Corrected claim semantics are supplied to
the planner but still require model compliance and human inspection of the preview.

Publishing requires a saved plan, the original conversation, comments.enabled,
and explicit --publish. The entire batch is marked UNKNOWN before the publisher
starts. The publisher chooses actual host tools and maps the saved content and
coordinates to their schemas. The plugin validates the returned report shape;
it never equates a model claim with an independently verified provider response.
The status MODEL_REPORTED_POSTED includes model-reported thread IDs. A publisher
with no completed tool calls cannot produce this status, but completed generic
calls alone do not prove any comment was created.

One publication attempt is allowed per completed review, including failures or
cancellations. This prevents orchestrator-level blind retries, not retries inside
a model turn or the host/server. Prompts prohibit those too, without guaranteeing
compliance. Empty plans start no publisher. No rollback or remote deletion is
performed. OpenCode still retains its normal history; there is no resumable disk cache.
See [comment limitations](COMMENTING.md).

## Optional local diagnostics

With `debug.enabled=true`, each run writes private diagnostic artifacts outside
the project by default, or to an explicitly selected location. Inputs, visible
answers, model errors, stage records, and rendered reports are preserved; private
reasoning and full tool traffic are not. A failed request with no answer can
read back the last child-session assistant message using the existing SDK,
bounded to five seconds and without resuming a model. Unique directories,
exclusive files, owner-only modes, and per-run Git ignores reduce accidental
overwrites and commits. Debug write failure is nonfatal and visible in receipts.
This is not DLP or automatic secret redaction. See [diagnostics](DEBUGGING.md).

Receipts explain that check READY and reviewer COMPLETE are compatible success
states. In receipt mode, child-session navigation is a human read-only UI action,
not an instruction to resume a revoked reviewer with Task or a new prompt. When
navigation is unavailable the parent should present the receipt and diagnostic
location. Full mode remains the explicit choice for returning the report text.

## Host and cost limits

A review stage may involve multiple model and tool calls. Step limits and timeouts are not token or spending limits. The host or provider may also retry requests internally.

The host may run the original model after the command hook returns, and auxiliary models retain their existing configuration. Model profiles constrain only this plugin's own stages, not all host spending. Model IDs may be reused across roles; independent sessions do not guarantee independent model reasoning or quality.

Private sessions do not copy the parent conversation, but they still run inside OpenCode. Other plugins, project configuration, provider behavior, and host version differences can affect them. The plugin does not provide OS isolation, enterprise DLP, protection from malicious local code, or a guarantee that code is safe to merge.

PR files, comments, requirements, and other reviewer reports are untrusted data.
In 1.18.31, native command substitution, shell expansion, and file resolution run
BEFORE `command.execute.before`. Removing the argument placeholder alone is not
safe: the host appends arguments when no placeholder exists. Installed templates
therefore use the deliberately unreachable positional placeholder `$9007199254740991`.
It expands to empty, suppresses implicit argument append, and keeps raw context
out of native shell/file parsing. The plugin reads `input.arguments` directly.
The index is JavaScript's maximum safe integer, beyond a realizable argument
array (including before the plugin checks its 16,000-character input limit).
An offline transcription test covers this host behavior; revalidate it before
changing host versions. Do not replace the template with `$ARGUMENTS` or `$1`.

## Module boundaries

The runtime uses seven JavaScript files, including the tiny required entry point:

| Module | Ownership |
| --- | --- |
| `plugin.js` | OpenCode entry export. |
| `runtime.mjs` | Host I/O, grants/hooks, one shared run lifecycle, and the review/comment workflows. |
| `config.mjs` | Settings validation, immutable mode/role/prompt catalogs, and pure compilation of private agent definitions. |
| `output.mjs` | Literal request parsing, JSON output schemas/parsing, snapshots, and review evidence contracts. |
| `comments.mjs` | Saved comment-plan contracts, markers, and publication-result bookkeeping. |
| `diagnostics.mjs` | Opt-in private filesystem output; no workflow authority. |
| `attribution.mjs` | Deterministic localized model/method disclosure from stage records. |

The former tiny request-only module is folded into the contracts module. Pure contracts and formatting remain outside the stateful runtime; filesystem diagnostics and comment publication keep their own boundaries. Prompts remain editable Markdown because they are review policy, not JavaScript routing logic. A shared deep supplement is appended to both initial roles and the verifier only in deep mode. Each required prompt is read once at startup, then the pure compiler constructs both profiles without mutating settings or the prompt inputs. Missing/empty policies fail before any agent is injected.

The current size does not justify a separate framework, controller class per stage,
or build pipeline. Keeping lifecycle/grants together makes revocation ordering
auditable; keeping contracts and agent compilation pure makes them independently
testable. This preserves seven JavaScript modules and the 24-file manual package.
The shell installer deliberately keeps a plain file list so it needs no Node
runtime. A contract test compares the operational catalogs, actual source files,
and documented manual package, while installer tests check every required file;
drift fails development tests instead of adding another required manifest file.

The Python settings migrator is installer-only, not another runtime service. It converts the previous four slots to schema version 2 and recursively fills missing defaults. `models._help` is documentation and is excluded from normalized runtime settings and model instructions. Runtime defaults apply to omitted optional fields, not explicit invalid values such as null; the installer preserves such values for the user to correct. The optional JSON schema supplies editor hints; runtime validation does not depend on that file. Installation retains no persistent backup; temporary rollback files are removed on success. See [migration and update behavior](../README.md#update-disable-or-uninstall).

## Interface references

The host compatibility baseline is **OpenCode 1.18.31**. The source references below are pinned to it; they are not a live certification of compatibility with your providers, MCP server, or TUI.

- [Plugins](https://opencode.ai/docs/plugins/)
- [Session SDK](https://opencode.ai/docs/sdk/)
- [Commands](https://opencode.ai/docs/commands/)
- [Agents](https://opencode.ai/docs/agents/)
- [Keybinds](https://opencode.ai/docs/keybinds/)
- [Plugin hook types](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/plugin/src/index.ts)
- [Session prompt implementation](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/opencode/src/session/prompt.ts)
- [System transform and model-parameter hook order](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/opencode/src/session/llm/request.ts)
- [Task implementation](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/opencode/src/tool/task.ts)
- [SDK request/response types](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/sdk/js/src/gen/types.gen.ts)
