# Architecture and trust boundaries

## System map

```text
Explicit /pr-review or /pr-deep + URL + literal context
  -> command hook / cancellable host readiness / session grants
       +-> functional session --+
       +-> risk session --------+  concurrent PR discovery + full review
  -> local repository/PR + source/target SHA comparison, union of paths
  -> verifier session (source checks + dispositions + PR-version recheck)
  -> final report + deterministic model/method disclosure
  -> completed-review memory cache (only when all publication contracts pass)
       -> explicit /pr-comment: preview
       -> explicit /pr-comment --publish: one attempted saved batch

Each stage -> OpenCode Session SDK -> configured providers and host tools/MCP
Optional diagnostics <- stage records (private files; not a resumable cache)
```

`/pr-check` is a standalone diagnostic using the normal profile's risk model;
it is not invoked by `/pr-review` or `/pr-deep`.
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
| Direct initial reviews with PR-reported versions | Removes a preliminary source-check model and ancestry investigation; discovery is duplicated and the target reference is not a proven merge base. | Live evaluation reveals unacceptable attribution gaps or instability. |
| Separate three-role normal/deep profiles | Direct configuration, static model bindings, and no hidden deep fallback; six configurable slots need not mean six distinct models. | A demonstrated workflow need outweighs added configuration complexity. |
| Host-owned tools with no MCP catalog | Supports renamed tools and existing connections; source truth and read-only compliance remain model/host responsibilities. | A separately approved adapter/security requirement justifies narrowing this scope. |
| Tolerant review delivery with separate publication contracts | Retains useful observations without extra format-repair requests; incomplete evidence remains disclosed and cannot authorize publication. | Representative live evaluation reveals a quality or reliability tradeoff. |
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

Both normal and deep profiles start functional and risk sessions concurrently,
with the same literal request and URL hints, without a checker snapshot or sibling
report. Each reads PR metadata, requests changes and reviews source. Once both
settle, the runtime compares identity/source/target versions, combines matching
paths and starts the verifier with available observations and explicit limitations. Deep adds instructions and its own model
profile, not a third initial or fallback. Neither mode has a plugin iteration
or stage-character limit. The whole-command timeout defaults to disabled.

The target comparison reference is PR-reported, not a certified merge base.
Prompts prefer native PR changes/diffs and exact-commit source, limit findings to
the PR, and disclose uncertain attribution where target-only changes can confuse
two-commit comparison. No ancestry/history or whole-tree proof is required.
PR metadata can lag branch state; this is not an atomic repository snapshot.

Standalone `/pr-check` retains its self-contained cumulative-readiness policy,
without common finding rules or deep instructions. Its result is not passed to
later reviews. The static role catalog and 24-file installation stay unchanged;
an unused deep check definition is not a run.

Each mode owns `functional`, `risk`, and `verifier` model settings. Its risk model also handles comments; standalone `/pr-check` uses the normal profile's risk model. The selected profile is bound to the run and cached with completed reviews, so later comment commands use the original profile even after a different mode runs.

Command input is parsed into `prUrl` and literal `userContext`, while retaining
the original request. All stages receive those fields directly; context is never
replaced by a model's summary or inherited from earlier commands. Receipt
diagnostics identify the failing workflow phase without echoing supplementary text.

Recognized cloud URL layouts also produce `urlIdentity` hints separating the
organization/project/repository; unknown server layouts remain untouched. Hints
are not verified server identity and never drive an API call. Each initial
confirms the requested PR and uses the stable target repository ID. The verifier
gets both original reviews and the combined snapshot. No checker recipe or
source cache is shared. Prompts request changed-file inclusion explicitly,
discourage deterministic retry loops and optional tree/history probes, and retain
pagination, independent reads and final freshness. No MCP catalog, adapter or
programmatic retry is added. See
[source-access discipline](AZURE_MCP.md#avoiding-repeated-lookup-failures).

Known, relevant supporting paths in initial evidence are untrusted lookup hints
for the verifier, never shared source evidence. Its own exact-commit reads can be
batched with changed source when selectors are known; unresolved dependencies and
guidance discovery still require follow-up. The final PR metadata read remains
after source checks. Compact report prose adds exclusions/corrections/limits to
the structured ledger instead of repeating it; no new word-count gate is imposed.

## Authorization

Only explicit command events create grants. Commands must have the expected ownership marker and must not override the original agent or model.

Each grant binds a run, session ID, private role, and exact model. The runtime checks grants in message, model-parameter, and tool hooks. Ordinary agents cannot invoke private reviewers through Task or mentions. Hidden agent metadata is a UI hint, not an authorization mechanism.

Each profile has six private agents: check, functional, risk, verifier, comment-plan, and comment-publish. Twelve static `azpr-review-*`/`azpr-deep-*` agent definitions bind the two profiles to their configured models; this is not twelve stages per run. No shared agent is rewritten per command, so simultaneous normal/deep runs from different origins cannot switch each other's model bindings. Partial deep configuration disables all deep agents and refuses deep commands without model calls.

Normal model, default agent, auxiliary model, permission, provider, MCP, and subagent-depth settings are preserved. Private auxiliary/compaction attempts are denied through the available V1 hooks. Ordinary chat and tool hooks return without reading review settings or calling the Session SDK, except to reject unauthorized access to private roles.

Configuration fingerprints prevent route changes during a run. Editing settings requires a restart. Grants are revoked after each stage and at completion or cancellation.

## Incomplete drafts

After a normal/deep workflow exception yields INCOMPLETE with accepted initial
output, deterministic rendering retains those initial observations, coverage gaps, their separate
snapshots, selected models, missing disposition IDs and the error. These are
unconfirmed candidates, not accepted final findings; failed verifier prose is not
promoted into the draft. Labels disclose incomplete adjudication and original
language. No formatter/model request or additional tool is started.

An active run with confirmed aborts can display the draft through the existing
noReply grant; an inactive or abort-uncertain run can only retain diagnostic data.
Drafts are stored as `draft.md` with `reportKind: incomplete-draft`, never as a
successful `report.md`. The available draft is included even in receipt mode. Drafts never enter
the completed-review cache, so preview/publication remain unavailable.

## Run lifecycle

Review and comment commands share one lifecycle owner inside the adapter. It
checks SDK availability, acquires origin/PR locks, starts the deadline, initializes
diagnostics, checks host model/MCP readiness, invokes the workflow, displays the result, revokes grants, and releases
locks. Workflow callbacks own only review/comment decisions, not a second copy of
timer and cleanup logic. Existing same-origin and comment-target serialization
rules are unchanged; separate origins may run normal and deep reviews concurrently.

Readiness runs after the origin lock and cancellation controller exist. V1
provider.list supplies connected providers and model capabilities.toolcall; mcp.status
must include a connected server. Only configured slots are checked, with no model
selection or pricing inference. SDK catalogs do not prove Azure authorization or
source validity. Cancellation races every preflight request even if the SDK
ignores its signal. A later command performs fresh checks.

V1 lacks V2's model.request kind and retry-decision hooks. chat.params guards the
available model boundary, experimental.session.compacting rejects known private
sessions, and session.status retry events are observations only. The runtime cannot
veto host-internal retry decisions through that event or claim full V2 parity.
Known-session tracking is process-local; after restart, private role invocations
still need new grants, but arbitrary ordinary-role reuse of historical sessions is
not certified as blocked. Ordinary agents retain their existing behavior.

UI toasts and setup logs are advisory, non-blocking requests with short deadlines.
A missing UI response cannot strand an active run. Session-abort and last-message
requests have five-second local deadlines even if an SDK ignores its signal.
Concurrent cancellation and cleanup await the same abort operation. Unconfirmed
aborts are disclosed; local grant revocation does not prove that remote work or
billing stopped.

When enabled, the deadline covers the whole workflow, including stage transitions, output
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

Stage diagnostics record serialized input and plugin instruction character counts
and remaining whole-run milliseconds at attempt start/end (null when the timeout
is disabled). These observations do not alter a deadline, reserve stage time,
impose a new iteration limit or add
instructions to model inputs. Host prompts, tools, history and billable tokens
are outside those character counts.

## Evidence contract

Report delivery and publication use separate decisions. Initial/verifier responses
are captured through native StructuredOutput or explicit JSON text, then locally
adapted. The strict evidence validators assess completeness; their failures become
review warnings rather than discarding readable content. Source checks, settings,
comment plans and publication receipts keep strict contracts.

Native review schemas describe preferred fields without required evidence keys or
enum gates at capture time. The strict schema catalog remains the preferred shape
and the assessment reference. Both native and text responses must belong to the
expected assistant session, role and model. Explicit truncated, filtered, cancelled
or error finishes and general host/provider errors remain failed executions.

### Local syntax and field recovery

The grammar-aware text parser can repair punctuation around complete values:
trailing commas, redundant closing delimiters, missing complete closers/separators,
missing colons, bare keys, single/smart quotes, JSON comments and literal controls.
It preserves string values and records zero-based JSON-body UTF-16 offsets.
Incomplete strings, missing values, array holes, multiple roots and duplicate keys
(including escaped equivalents) are not resolved by guessing. Their complete
visible text can instead become an unstructured PARTIAL observation. A JSON code
example cannot replace the surrounding review, and supplemental fenced prose is
retained. Settings and comment parsing do not use this recovery.

Known key spellings, enum case, numeric PR IDs and full SHA quote wrappers can be
normalized. Extra fields remain available, including content-bearing fields and
conflicting aliases; conflicts prevent full contract acceptance. Missing evidence,
locations, coverage and current versions are never filled with invented values.
Raw response artifacts remain separate from adapted results.

A stopped V1 assistant response may contain the exact host error
`StructuredOutputError` / `Model did not produce structured output` with retries=0.
If it has no native object or tool parts and no additional error data, existing
visible text can use the same local review recovery. This records
`accept-completed-text-without-native-submission`; it adds no request or model.
No other provider error is exempted. Native captures cannot retrospectively prove
that upstream raw tool arguments contained no duplicate keys.

### Initial handoff and final assessment

Both independent initials receive the literal PR URL/context. Their available
observations, coverage and limitations reach the verifier, even if an initial is
PARTIAL. A failed execution admitted through the required V1 hooks contributes a
clearly unavailable placeholder with no accepted findings; the sibling can still
finish. Configuration/routing failures, cancellation and guard revocation stop
the workflow. Failed-response text remains diagnostic only.

Missing or repeated initial IDs receive unique F/R bookkeeping IDs while preserving
the supplied original ID. This assigns identity, not evidence. Pending locations
and every expected ID are explicit in the verifier handoff. Matching snapshots
contribute a sorted path union. Unavailable frames remain null; conflicting PR
identities or versions are warnings and cannot qualify the run for publication.
The verifier is instructed to establish the requested PR independently.

Final category rows and legacy dispositions retain supplied decisions and extra
content. Missing decisions become runtime `UNREVIEWED` rows, with the original
observations shown separately. The runtime never infers a merge, rejection or
confirmation from prose. Cycles, unknown IDs, incomplete corrected findings and
missing current versions remain visible as limitations. Missing optional empty
sections or overview alone do not discard otherwise complete review evidence.

`COMPLETE` means the verifier result passes the canonical final assessment without
review warnings. `PARTIAL` retains useful structured or literal output with its
gaps. Explicit changed source/target versions, or a model STALE result, stay STALE.
When the final snapshot is omitted, an initial frame may be displayed only with an
explicit provenance warning; current versions are never copied from it.

Publication requires both initial contracts, a complete final contract, every
original decision and consistent PR identities/versions. Only final corrected
confirmed findings and V discoveries can reach a comment planner. Initial missing
locations may be resolved by the verifier; incomplete final evidence cannot be
published. A COMPLETE verifier after a partial initial remains readable but is
not cached for comments. None of these field checks proves source truth, full
coverage or factual quality.

### Source-check status amendment

`outputRetries` defaults to zero. When set to one, only standalone `/pr-check` may
use one fresh same-model status amendment after every other check contract passes
and an ordinary tool completed. It can change only status. The scoped system hook
replaces the checker instructions, preserving unrelated host context; one message,
one request and no ordinary tool are allowed. Missing isolation, changed fields,
provider errors, uncertain abort or cancellation prevents acceptance. A narrow
completed missing-native-error text path remains for that authorized amendment.
The original failure and successful amendment remain distinct diagnostic records.

Initial/verifier formatting and content gaps never start model amendments or final
resubmissions, even when outputRetries=1. No additional reviewer, fallback model,
iteration/character limit or deadline reset is introduced.

### Rejected native submissions

The pinned host routes rejected StructuredOutput arguments to its built-in
`invalid` tool through `tool.execute.before`. Native review sessions stop on the
second distinct invalid structured call; output-amendment and comment sessions
stop on the first. Call IDs deduplicate hook delivery; counters belong to the
individual session and do not combine independent reviewers. Built-in invalid
results never count as completed source work for the status-amendment gate.

This bounds an existing host loop, independently of outputRetries. It neither
starts another request/session nor repairs malformed JSON. The first review
rejection can still be followed by the host's next normal turn under the same
grant and optional deadline; other provider retries remain outside this guard. Only native
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
through independent source verification and the final PR-version check.

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

Common review policy owns one submission check for numerical state/delta claims,
static assertion order, evidence scope/quotes and impact-based severity. The final
role applies it to the localized findings, reasons and overview after independent
source verification, with a decisive explanation for changed severity. This uses
existing fields and already-read evidence; no extra stage, field, model request
or semantic runtime validator is added. The canonical finding retains the full
evidence packet and corrected location; reasons and overview add only necessary
decisions, exclusions, corrections and limits. See the concrete
[quality acceptance cases](VALIDATION.md#report-quality-acceptance-cases).

## Tools and reports

Private agents deny nested Task delegation and native bash/edit/skill/webfetch/
websearch tools by default. A grant-scoped before hook rejects the native calls, write and
apply_patch variants, and attempts redirected through the host's invalid tool.
A single prevented attempt can be followed by valid review work; two distinct
attempts per stage abort and revoke the run. Records and receipts disclose counts
and known native names, never arguments or rejected-call text. Ordinary agents
and global/project permissions are unchanged; origin-agent overrides are not copied.

The explicit `shellToolPermission` setting controls only private-role `bash`
permission compilation. `deny` is the default. `ask` keeps the shell schema in
host requests for providers that reject its absence; it does not remove bash
from the runtime's immutable blocked set. The before hook must reject execution
before host permission approval. All twelve roles use the same setting, including
source checks and comment roles; repair/display grants still deny ordinary tools.
The setting is independent of provider/model names and host versions. There is
no automatic downgrade, retry, model switch or `allow` mode. Diagnostics record
the selected permission. Changing back to `deny` requires only a settings change
and restart, not a provider-specific code patch. Actual-host acceptance and
forced-call tests remain necessary when host behavior changes.

No MCP name, prefix, action, argument or response-schema filter exists. The native
guard does not make arbitrary custom tools or mixed-action MCP dispatchers read-only.
Review prompts prohibit modifications and unrelated access. The shared policy
compiled in config.mjs allows bounded Read of host-saved tool output identified
by OpenCode in the same session, under existing host permissions. It excludes
arbitrary local files, cross-session artifacts and paths embedded in payloads;
it is not a runtime path/provenance check. A saved partial server response still
has missing evidence, and its line offsets are not original source coordinates.
The same policy applies to check, review and comment roles without importing
finding rules into check or expanding the 24-file package. A blanket read denial
would also disable host MCP resources.
Tool hooks retain lifecycle checks, completed-call bookkeeping and native-submission
limits. Display and output-repair grants deny all ordinary tools.
See [MCP ownership and limitations](AZURE_MCP.md).

The final Markdown is appended with `noReply: true`. A display-only grant rejects model and tool calls. If display fails, the original structured fields remain in the session; optional diagnostics preserve the rendered Markdown. Receipt mode returns status and location for COMPLETE reports; full mode also encloses them. PARTIAL/STALE reports and incomplete drafts are enclosed in either mode. Neither mode changes stage requests or parsing. A deterministic provenance section lists invoked model IDs, initial counts, dispositions, and the comparison method. The parent agent is instructed to reproduce it verbatim; the plugin cannot guarantee the parent's presentation.

The top-level `outputLanguage` (default `en`) is validated as a language tag and canonicalized. Only final-verifier and comment roles in each profile receive a generated language instruction and an input language field. Completed reviews retain that language for later comments. It controls final-report Markdown and comment prose, not intermediate review output, structured fields, code identifiers, or status receipts. Full-report receipts instruct the original agent not to translate the enclosed report. The publisher receives unchanged saved bodies and is instructed to send them verbatim. Language quality is model-dependent; no language detector or additional translation call is used.

Cancellation revokes grants before requesting session abort and never aborts the parent development session. A request already sent to a provider may still be billed. The host's UI disconnect or Ctrl+C behavior is not guaranteed to propagate cancellation. An explicitly configured wall-clock timeout provides an additional limit; it is disabled by default. SDK abort acknowledgement and advisory delivery keep their separate bounded waits even with no whole-command timeout.

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

Optional timing uses hook boundaries and a monotonic attempt-local clock.
Terminal host events can close missing after-hooks using their end timestamps
relative to the recorded wall-clock origin. Invalid/skewed timestamps and
post-response execution are rejected. Delayed events can settle known calls only
before the collector freezes and while their grant remains active. Duplicate or
conflicting events cannot rewrite a terminal outcome. Only matching session/call/
tool identities are accepted; events never add successful source evidence.
Stage failure counters contain no error text. Timelines contain tool names,
intervals and request windows, without arguments, outputs or call IDs. Overlap
forms a union; missing completions remain unknown. Timing never grants tools or
changes output acceptance. Each amendment gets a fresh collector.
SDK response settlement separates request time from response processing; workflow
render/display/cleanup timers describe local work. Provider queue/inference cannot
be isolated from these observations. Debug-disabled runs collect no timeline.

Receipts explain the applicable standalone READY or reviewer COMPLETE status;
neither is PR approval. In receipt mode, child-session navigation is a human read-only UI action,
not an instruction to resume a revoked reviewer with Task or a new prompt. When
navigation is unavailable the parent should present the receipt and diagnostic
location. Full mode includes COMPLETE reports; PARTIAL/STALE reports and drafts are included in either mode.

## Host and cost limits

No reviewer iteration or stage-character setting exists. Agent definitions omit
host iteration limits. Role catalogs and diagnostics have no step-budget fields.
Stage handoffs, native/text envelopes, scoped amendment text and diagnostic
answers have no plugin character cap. Diagnostics retain the complete selected
answer/error fields, without preview serialization or truncation flags. Observed
input/output sizes and `modelRequests` describe activity, never authorize work or
prove source completeness. No extra model request, evidence trimming or hidden
replacement cap compensates for large input.

Installation deletes obsolete `steps` and `maxStageCharacters` fields, then fills
missing defaults. Runtime validation rejects those removed settings like other
unknown keys; manually replaced runtime files require matching settings. The
settings version remains 2. This is removal, not an optional legacy limit mode.

`runTimeoutSeconds` accepts null/omission to disable the whole-command timeout, or
10..7200 integer seconds to enable it. Explicit installation values are preserved.
The runtime uses a null deadline and no timer when disabled; it does not pass
Infinity or zero to a timer. A finite deadline covers the entire command without
reset for later stages/amendments. Remaining-run diagnostics are null without a
deadline. Manual cancellation, disposal, grants, output/native guards and bounded
SDK cleanup work in either mode.

Removing these budgets does not enlarge model context, provider output limits or
MCP/host tool responses. Larger envelopes also use more local memory and debug
storage. The separate 16,000-character command URL/context bound, comment-count/
body/anchor contracts, and scoped amendment/invalid-submission guards remain;
none caps a review's source evidence or verifier handoff. A review stage may
involve multiple model/tool calls, including host/provider retries. The optional
timeout is not a token or spending limit.

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
| `output.mjs` | Literal request parsing, strict JSON parsing, shared output-key catalogs, snapshots, and review evidence contracts. |
| `comments.mjs` | Saved comment-plan contracts, markers, and publication-result bookkeeping. |
| `diagnostics.mjs` | Pure tool-observation summaries, timing, and opt-in private filesystem output; no workflow authority. |
| `attribution.mjs` | Deterministic reports, receipts, diagnostic notices and localized model/method disclosure. |

The former tiny request-only module is folded into the contracts module. Pure contracts and formatting remain outside the stateful runtime; filesystem diagnostics and comment publication keep their own boundaries. Prompts remain editable Markdown because they are review policy, not JavaScript routing logic. A shared deep supplement is appended to both initial roles and the verifier only in deep mode. Each required prompt is read once at startup, then the pure compiler constructs both profiles without mutating settings or the prompt inputs. Missing/empty policies fail before any agent is injected.

The current size does not justify a separate framework, controller class per stage,
or build pipeline. Keeping lifecycle/grants together makes revocation ordering
auditable; keeping contracts and agent compilation pure makes them independently
testable. This preserves seven JavaScript modules and the 24-file manual package.
The shell installer deliberately keeps a plain file list so it needs no Node
runtime. A contract test compares the operational catalogs, actual source files,
and documented manual package, while installer tests check every required file;
drift fails development tests instead of adding another required manifest file.

Runtime JSDoc defines Run, Grant and StageRecord handoffs.
Attempt records retain accepted results and limitations separately from raw failed
responses; display grants cannot execute models/tools. A shared active-amendment
check preserves settings, revocation and abort checks after eligibility planning.
These are editor-visible contracts, not a new build step or static type-checking
claim. Receipt rendering takes explicit settings and performs no host I/O or
state mutation. Contract tests exercise native, raw-text and fenced output for
both profiles, including legacy final submissions and the existing finding-only
tolerance. Host mock tests remain separate from actual-host certification.

The Python settings migrator is installer-only, not another runtime service. It converts the previous four slots to schema version 2, removes obsolete limits and recursively fills missing defaults. `models._help` is documentation and is excluded from normalized runtime settings and model instructions. Runtime defaults apply to omitted optional fields; explicit null is valid only where declared, including the disabled timeout. The installer preserves other invalid values for the user to correct. The optional JSON schema supplies editor hints; runtime validation does not depend on that file. Installation retains no persistent backup; temporary rollback files are removed on success. See [migration and update behavior](../README.md#update-disable-or-uninstall).

Both paths reject duplicate raw JSON keys at every object level, including
escaped-equivalent names. Runtime settings loading shares the structural key
scanner used for review text, with strict syntax and no normalization. This check
also precedes the disabled-mode shortcut; ambiguous input cannot silently select
a model or disable the plugin. User-visible syntax/duplicate errors omit key names
and values. The installer remains Python-only and preserves its existing rollback.

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
