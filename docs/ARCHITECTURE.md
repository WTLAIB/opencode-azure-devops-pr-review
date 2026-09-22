# Architecture and trust boundaries

## Workflow ownership

The local plugin controls a fixed workflow through the OpenCode-provided Session SDK. It does not use nested Task orchestration, a global review skill, an external model SDK, or a separate launcher.

The source entry is `src/plugin.js`, which imports the runtime beside it. Installation creates a small `plugins/azpr.js` loader that re-exports `./azpr/plugin.js`. Runtime code, prompts, settings, and the uninstaller live under `plugins/azpr/`. The loader does not import through a parent directory. OpenCode 1.18.31 scans top-level plugin `.js`/`.ts` files; nested helpers are not separate entries.

A source check runs first. Initial reviewers then run concurrently in separate child sessions, each receiving the same request and snapshot but no other initial review. Final verification starts only after all initial reviews complete successfully.

Command input is parsed into `prUrl` and literal `userContext`, while retaining
the original request. All stages receive those fields directly; context is never
replaced by the checker's summary or inherited from earlier commands. Receipt
diagnostics identify the failing workflow phase without echoing supplementary text.

## Authorization

Only explicit command events create grants. Commands must have the expected ownership marker and must not override the original agent or model.

Each grant binds a run, session ID, private role, and exact model. The runtime checks grants in message, model-parameter, and tool hooks. Ordinary agents cannot invoke private reviewers through Task or mentions. Hidden agent metadata is a UI hint, not an authorization mechanism.

All eight private roles (six reviewers plus two comment stages) use the stable `azpr-*` prefix. Normal model, default agent, auxiliary model, permission, provider, MCP, and subagent-depth settings are preserved. Ordinary chat and tool hooks return without reading review settings or calling the Session SDK, except to reject unauthorized access to private roles.

Configuration fingerprints prevent route changes during a run. Editing settings requires a restart. Grants are revoked after each stage and at completion or cancellation.

## Evidence contract

Every stage returns a JSON envelope. Snapshot validation requires a repository, positive PR ID, full base/head hashes, cumulative scope, and a nonempty unique file list. Initial and final snapshots must match, including file order.

Initial finding IDs use `F-`, `R-`, or `D-` prefixes. Every original ID must have exactly one final disposition: `CONFIRMED`, `NEEDS_INFO`, `REJECTED`, or `MERGED`. Merged items reference another original ID. Confirmed final-verifier discoveries use `V-` IDs in both the report and the structured `newFindings` array. Without that structured entry they cannot be automatically published.

The final verifier reports the current PR head. A mismatch becomes `STALE`, with no automatic rerun. Invalid JSON, inconsistent snapshots, missing dispositions, or partial initial reviews produce an incomplete result.

Every stage must observe message and parameter hooks. Source access, coverage, and current HEAD are model-reported; the runtime does not classify MCP calls or decode their results to verify those claims. Missing access should be reported as NOT_READY by the checker, not rejected because a preferred tool name was absent.

## Tools and reports

Private agents add only task=deny to prevent nested model delegation. No MCP name, prefix, action, argument, or response-schema filter exists. OpenCode supplies tools and applies its normal global/project permission rules; agent-only overrides from the originating Build/Plan session are not copied. Review prompts prohibit modifications and unrelated tool use, but the plugin does not enforce a read-only MCP boundary. Generic tool hooks retain only lifecycle checks and completed-call bookkeeping, never semantic read/write classification. See [MCP ownership and limitations](AZURE_MCP.md).

The final Markdown is appended with `noReply: true`. A display-only grant rejects model and tool calls. If display fails, the original JSON report remains in the session. Receipt mode returns only status and location information to the original conversation; full mode also returns the final report.

The top-level `outputLanguage` (default `en`) is validated as a language tag and canonicalized. Only the two final-verifier roles and two comment roles receive a generated language instruction and an input language field. Completed reviews retain that language for later comments. It controls final-report Markdown and comment prose, not intermediate review output, structured fields, code identifiers, or status receipts. Full-report receipts instruct the original agent not to translate the enclosed report. The publisher receives unchanged saved bodies and is instructed to send them verbatim. Language quality is model-dependent; no language detector or additional translation call is used.

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
performed. OpenCode still retains its normal history; there is no new disk cache.
See [comment limitations](COMMENTING.md).

## Host and cost limits

A review stage may involve multiple model and tool calls. Step limits and timeouts are not token or spending limits. The host or provider may also retry requests internally.

The host may run the original model after the command hook returns, and auxiliary models retain their existing configuration. Economy mode constrains this plugin's reviewer slots only.

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
