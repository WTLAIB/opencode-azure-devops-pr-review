# Architecture and trust boundaries

## Workflow ownership

The local plugin controls a fixed workflow through the OpenCode-provided Session SDK. It does not use nested Task orchestration, a global review skill, an external model SDK, or a separate launcher.

The source entry is `src/plugin.js`, which imports the runtime beside it. Installation creates a small `plugins/azpr.js` loader that re-exports `azpr/plugin.js`. Runtime code, prompts, settings, and the uninstaller live under `azpr/`.

A source check runs first. Initial reviewers then run concurrently in separate child sessions, each receiving the same request and snapshot but no other initial review. Final verification starts only after all initial reviews complete successfully.

## Authorization

Only explicit command events create grants. Commands must have the expected ownership marker and must not override the original agent or model.

Each grant binds a run, session ID, private role, and exact model. The runtime checks grants in message, model-parameter, and tool hooks. Ordinary agents cannot invoke private reviewers through Task or mentions. Hidden agent metadata is a UI hint, not an authorization mechanism.

All eight private roles (six reviewers plus two comment stages) use the stable `azpr-*` prefix. Normal model, default agent, auxiliary model, permission, provider, MCP, and subagent-depth settings are preserved. Ordinary chat and tool hooks return without reading review settings or calling the Session SDK, except to reject unauthorized access to private roles.

Configuration fingerprints prevent route changes during a run. Editing settings requires a restart. Grants are revoked after each stage and at completion or cancellation.

## Evidence contract

Every stage returns a JSON envelope. Snapshot validation requires a repository, positive PR ID, full base/head hashes, cumulative scope, and a nonempty unique file list. Initial and final snapshots must match, including file order.

Initial finding IDs use `F-`, `R-`, or `D-` prefixes. Every original ID must have exactly one final disposition: `CONFIRMED`, `NEEDS_INFO`, `REJECTED`, or `MERGED`. Merged items reference another original ID. Confirmed final-verifier discoveries use `V-` IDs in both the report and the structured `newFindings` array. Without that structured entry they cannot be automatically published.

The final verifier reports the current PR head. A mismatch becomes `STALE`, with no automatic rerun. Invalid JSON, inconsistent snapshots, missing dispositions, or partial initial reviews produce an incomplete result.

Every stage must observe message and parameter hooks and at least one completed allowed Azure tool call. This detects missing integration hooks and completely unsupported evidence claims, but does not establish completeness of source coverage or truth of model-reported evidence.

## Tools and reports

Private reviewers deny shell, local file access, editing, Task, Skill, public web, and unlisted tools. Exact Azure tool names are combined with existing global ask/deny restrictions. Dispatcher actions are restricted separately. Server-side permissions remain necessary; see [Azure setup](AZURE_MCP.md).

The final Markdown is appended with `noReply: true`. A display-only grant rejects model and tool calls. If display fails, the original JSON report remains in the session. Receipt mode returns only status and location information to the original conversation; full mode also returns the final report.

The top-level `outputLanguage` (default `en`) is validated as a language tag and canonicalized. Only the two final-verifier roles and two comment roles receive a generated language instruction and an input language field. Completed reviews retain that language for later comments. It controls final-report Markdown and comment prose, not intermediate review output, structured fields, code identifiers, or status receipts. Full-report receipts instruct the original agent not to translate the enclosed report. The publisher sends saved comment bodies unchanged. Language quality is model-dependent; no language detector or additional translation call is used.

Cancellation revokes grants before requesting session abort and never aborts the parent development session. A request already sent to a provider may still be billed. The host's UI disconnect or Ctrl+C behavior is not guaranteed to propagate cancellation. A wall-clock timeout provides an additional limit.

## Explicit comment boundary

Completed reviews are cached in memory (latest 20). `/pr-comment <review-id>` creates a read-only plan; `--publish` requires that saved plan, the original conversation, and `comments.enabled`. `src/comments.mjs` validates the supported unified MCP adapter's actual tool results and freezes the allowed write target/content/anchor. Only the publisher role can request the exact thread-write tool, only with `create`; permissions remain capped at `ask` and global restrictions. Reviewer prompts keep their write prohibition; comment stages have their own narrowly scoped policy.

Attempt bookkeeping occurs before dispatch. Uncertain results block automatic retries and are never labeled posted. `/pr-stop` and timeouts revoke comment grants as well. No on-disk report cache is added; OpenCode sessions still retain their ordinary history. See [comment policy and race/adapter limitations](COMMENTING.md).

## Host and cost limits

A review stage may involve multiple model and tool calls. Step limits and timeouts are not token or spending limits. The host or provider may also retry requests internally.

The host may run the original model after the command hook returns, and auxiliary models retain their existing configuration. Economy mode constrains this plugin's reviewer slots only.

Private sessions do not copy the parent conversation, but they still run inside OpenCode. Other plugins, project configuration, provider behavior, and host version differences can affect them. The plugin does not provide OS isolation, enterprise DLP, protection from malicious local code, or a guarantee that code is safe to merge.

PR files, comments, requirements, and other reviewer reports are untrusted data. Custom command templates may support shell/file expansion before plugin hooks execute; use trusted URLs and your own context as command arguments.

## Interface references

These references describe the intended integration. They are not a certification of compatibility with your installed OpenCode version. Pin the actual host version when auditing behavior; upstream development branches can change.

- [Plugins](https://opencode.ai/docs/plugins/)
- [Session SDK](https://opencode.ai/docs/sdk/)
- [Commands](https://opencode.ai/docs/commands/)
- [Agents](https://opencode.ai/docs/agents/)
- [Keybinds](https://opencode.ai/docs/keybinds/)
- [Plugin hook types](https://github.com/anomalyco/opencode/blob/dev/packages/plugin/src/index.ts)
- [Session prompt implementation](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/prompt.ts)
- [Task implementation](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/task.ts)
- [SDK request/response types](https://github.com/anomalyco/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts)
