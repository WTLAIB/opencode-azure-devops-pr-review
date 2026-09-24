# Architecture and trust boundaries

## Workflow ownership

The local plugin controls a fixed workflow through the OpenCode-provided Session SDK. It does not use nested Task orchestration, a global review skill, an external model SDK, or a separate launcher.

The source entry is `src/plugin.js`, which imports the runtime beside it. Installation creates a small `plugins/azpr.js` loader that re-exports `./azpr/plugin.js`. Runtime code, prompts, settings, generated module metadata, and any supplied optional uninstaller/docs/schema live under `plugins/azpr/`. The source `package.json` is not required; installation generates the minimal `type: module` declaration. The loader does not import through a parent directory. OpenCode 1.18.31 scans top-level plugin `.js`/`.ts` files; nested helpers are not separate entries.

A source check runs first. Both normal and deep profiles then run two initial reviewers (functional and risk) concurrently in separate child sessions, each receiving the same request and snapshot but no other initial review. Their configured verifier starts only after both initial reviews complete successfully. Deep adds depth instructions and its own initial iteration budget, not a third initial reviewer or an automatic fallback.

Each mode owns `functional`, `risk`, and `verifier` model settings. Its risk model also handles source checks and comments; standalone `/pr-check` uses the normal profile's risk model. The selected profile is bound to the run and cached with completed reviews, so later comment commands use the original profile even after a different mode runs.

Command input is parsed into `prUrl` and literal `userContext`, while retaining
the original request. All stages receive those fields directly; context is never
replaced by the checker's summary or inherited from earlier commands. Receipt
diagnostics identify the failing workflow phase without echoing supplementary text.

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

Completed review records become available for comments only after the workflow
finishes without cancellation. Cancelling during report display does not leave a
publishable completed review. Cancelling or failing a refreshed comment preview
invalidates both the previous and newly prepared plan. Publication attempts remain
uncertain/reported records and are never automatically retried or rolled back.

## Evidence contract

Every stage returns a JSON envelope. By default, the OpenCode 1.18.31 native JSON-schema transport puts it in `info.structured`; `structuredOutput: false` selects text compatibility. A single unambiguous JSON fence is accepted, but invalid/truncated JSON is not repaired and no failed stage is automatically rerun. Snapshot validation requires a repository, positive PR ID matching the requested URL, full base/head hashes, cumulative scope, and a nonempty unique file list. Initial and final snapshots must match, including file order. URL/ID consistency is not independent verification of repository identity or source contents.

Source checks, initial reviews, final verification, comment plans, and publication
receipts all pass their local contract validator inside the stage boundary before
the stage records a valid result. A malformed READY plan or DONE publication report
therefore appears as a failed stage with its original response/session preserved,
not a successful stage followed by an unexplained workflow failure. A valid but
incomplete publication report remains incomplete and model-reported.

Initial finding IDs use `F-` and `R-` prefixes in both modes. Every original ID must have exactly one final disposition: `CONFIRMED`, `NEEDS_INFO`, `REJECTED`, or `MERGED`. Only merged items may name a merge target, which must be another original ID. Chains must terminate at a non-merged disposition; cycles are rejected rather than hiding every finding as a duplicate. Confirmed final-verifier discoveries use `V-` IDs in both the report and the structured `newFindings` array. Without that structured entry they cannot be automatically published.

The final verifier reports the current PR head. A mismatch becomes `STALE`, with no automatic rerun. Invalid JSON, inconsistent snapshots, missing dispositions, or partial initial reviews produce an incomplete result.

Every stage must observe message and parameter hooks. Source access, coverage, and current HEAD are model-reported; the runtime does not classify MCP calls or decode their results to verify those claims. Missing access should be reported as NOT_READY by the checker, not rejected because a preferred tool name was absent.

## Tools and reports

Private agents add only task=deny to prevent nested model delegation. No MCP name, prefix, action, argument, or response-schema filter exists. OpenCode supplies tools and applies its normal global/project permission rules; agent-only overrides from the originating Build/Plan session are not copied. Review prompts prohibit modifications and unrelated tool use, but the plugin does not enforce a read-only MCP boundary. Generic tool hooks retain only lifecycle checks and completed-call bookkeeping, never semantic read/write classification. See [MCP ownership and limitations](AZURE_MCP.md).

The final Markdown is appended with `noReply: true`. A display-only grant rejects model and tool calls. If display fails, the original JSON report remains in the session. Receipt mode returns only status and location information to the original conversation; full mode also returns the final report. Neither mode changes stage requests or parsing. A deterministic provenance section lists invoked model IDs, initial counts, dispositions, and the comparison method. The parent agent is instructed to reproduce it verbatim; the plugin cannot guarantee the parent's presentation.

The top-level `outputLanguage` (default `en`) is validated as a language tag and canonicalized. Only final-verifier and comment roles in each profile receive a generated language instruction and an input language field. Completed reviews retain that language for later comments. It controls final-report Markdown and comment prose, not intermediate review output, structured fields, code identifiers, or status receipts. Full-report receipts instruct the original agent not to translate the enclosed report. The publisher receives unchanged saved bodies and is instructed to send them verbatim. Language quality is model-dependent; no language detector or additional translation call is used.

Cancellation revokes grants before requesting session abort and never aborts the parent development session. A request already sent to a provider may still be billed. The host's UI disconnect or Ctrl+C behavior is not guaranteed to propagate cancellation. A wall-clock timeout provides an additional limit.

## Explicit comment boundary

Completed reviews are cached in memory (latest 20). Preview validates confirmed
finding IDs, body length, severity, changed-file coordinates, anchor shape,
coverage of eligible IDs, and a deterministic marker. It does not inspect MCP
outputs to verify source, HEAD, identity, or duplicates: those are model tasks.

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
- [Task implementation](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/opencode/src/tool/task.ts)
- [SDK request/response types](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/sdk/js/src/gen/types.gen.ts)
