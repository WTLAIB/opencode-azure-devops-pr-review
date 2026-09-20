# Human-readable Azure PR comments

`/pr-comment` is a separate, opt-in workflow for turning a completed review into a small number of actionable inline discussions. Review commands remain read-only. This command uses `freeB` for planning and, only when explicitly requested, for publishing the saved preview. It does not rerun the reviewers or switch to paid slots. The slot name does not guarantee cost.

## Policy and rationale

The policy draws on three public practices:

- [Google's review-comment guidance](https://google.github.io/eng-practices/review/reviewer/comments.html): explain the reason, be constructive, and distinguish important changes from optional advice. Here, comments describe the triggering condition and impact, then suggest a focused correction or test.
- [Conventional Comments](https://conventionalcomments.org/): structured labels make feedback easier to scan. Here, `issue (high):` and `issue (medium):` identify actionable defects. These are this project's severity labels, not Azure votes or assertions that a merge is blocked.
- [Microsoft's Azure PR guidance](https://learn.microsoft.com/en-us/azure/devops/repos/git/review-pull-requests?view=azure-devops): use line-specific discussion for local code issues. Here, publish inline only; keep the long report and all skipped findings in OpenCode.

The following limits are project choices, not universal standards:

| Rule | Default |
| --- | --- |
| Eligibility | Confirmed high/medium-impact defects only |
| Volume | At most 5 create attempts per completed review; configurable from 1 to 10 |
| Comment size | At most 1,200 characters plus a small hidden deduplication marker |
| Anchor | Smallest useful 1-5 line range in a changed HEAD file |
| Structure | Short issue title; triggering condition and impact; correction or regression test |
| Language | Shared `outputLanguage` for the final report and comment prose; identifiers and machine-readable labels unchanged |
| Duplicates | One root cause per thread; skip existing discussions, including resolved ones |
| Exclusions | Speculation, unanswered questions, cosmetic nits, optional refactoring, praise, and no-issues summaries |
| Unlocatable findings | Explain the skip locally; never invent an inline location |

Example body (shown in English; the actual body uses the shared `outputLanguage` setting):

```text
issue (high): Missing records bypass the fallback

When the lookup returns no record, this property access throws before the fallback runs. A previously supported request then returns an error.

Check for a missing record before dereferencing it, and add a regression test for an empty lookup result.
```

The final verifier's `CONFIRMED` original findings and structured `newFindings` (`V-*`) are eligible. `NEEDS_INFO`, `REJECTED`, and `MERGED` originals are not published. A new concern mentioned only in free-form report text is not automatically converted into a publishable finding. Every eligible finding is either in the preview or explicitly skipped with a reason. The model assesses severity, relevance, and semantic duplicates; the runtime cannot prove those judgments correct. Inspect the preview.

## Enable and use

Before reviewing, set this in your **installed, private** `azpr/settings.json`, then restart OpenCode:

```json
"comments": {
  "enabled": true,
  "maxComments": 5
}
```

`enabled` defaults to `false`: previews work, publishing does not. Do not change settings between reviewing and publishing; settings changes require a restart, which clears the in-memory review cache.

Run from the same original development conversation in the same OpenCode process:

```text
/pr-review https://dev.azure.com/ORG/PROJECT/_git/REPO/pullrequest/123
/pr-comment <review-id>
/pr-comment <review-id> --publish
```

Replace `<review-id>` with the eight-character ID from the **completed review** receipt, not the preview command's ID. `/pr-deep` reports also work. `/pr-check`, stale, incomplete, unknown, and another conversation's reports do not.

The first comment command is read-only and returns the exact proposed bodies, locations, and skip reasons to your original conversation, even when `returnReport` is `receipt`. `--publish` uses that saved plan, not newly generated text. OpenCode may still ask permission for writes. There is no one-shot publish shortcut.

Review the body and location of every previewed comment. If a human has since raised the same issue, refresh the preview before publishing. Empty plans do not create a summary thread. Success receipts include verified Azure thread IDs; a model's claim of success is insufficient. Cancel using `/pr-stop [comment-run-id]`. Already dispatched comments may still appear; cancellation does not delete them.

Only the latest 20 completed reports are cached, in memory. OpenCode's normal session storage still contains reports and tool history; this is not ephemeral-data or retention protection. After a restart, run a new review; importing arbitrary old report text for publishing is intentionally unsupported.

## Azure MCP requirements

The adapter targets Microsoft's unified tool schemas, inspected at [this upstream revision](https://github.com/microsoft/azure-devops-mcp/blob/aacff1ea3dff23362d538cc61cc57d5f5dedc437/src/tools/repositories.ts). Check your installed MCP server before enabling it. Legacy differently named tools and arbitrary custom dispatchers are not automatically compatible.

With `azure.prefix: "ado"`, these exact read tools must be in the existing Azure read allowlist:

- `ado_repo_pull_request`: `get`, including identity, active status, and `lastMergeSourceCommit.commitId`.
- `ado_repo_pull_request_thread`: unfiltered `list`, `fullResponse=true`, `top=100`, and sequential `skip` pages until the final short page.
- `ado_repo_file`: `get_content` at the full reviewed SHA with `versionType=Commit`.

The separate write tool is `ado_repo_pull_request_thread_write`. Do **not** put it in `azure.toolNames` or `azure.fullToolNames`; those remain read-only. The publisher alone receives this exact tool, capped at `ask` and respecting global denial. Runtime guards authorize only `action=create`, `status=Active`, and the exact preview arguments. Reply, edit, delete, resolve, vote, approve, merge, and pipeline/work-item changes are not authorized.

Tool names use the configured prefix. The MCP connection itself is organization-scoped; the adapter checks the returned repository web URL against the requested organization, project, repository, and PR before allowing writes. Canonical `https://dev.azure.com/...` and `https://ORG.visualstudio.com/...` URLs are supported; on-premises Azure DevOps Server URLs need a separately audited adapter.

Use an Azure identity allowed to read source and contribute PR comments. Enforce the narrowest feasible permissions on the server/account; if the connection is completely read-only, preview works but publishing cannot. The plugin never installs an MCP server, changes credentials, or broadens global OpenCode permissions.

## Runtime checks and limits

Before each create, the publisher must fetch all current discussions and re-read PR metadata. The runtime checks actual tool outputs, not the model's claimed HEAD. The HEAD must equal the reviewed source SHA and the PR must be active; metadata older than 60 seconds must be re-read. Complete exact-commit source must match the preview's exact anchor text. Unrecognized, errored, or reported-truncated output fails closed. Plain text, flattened MCP text envelopes, and the upstream randomized untrusted-content wrapper are supported.

Each create is sequential. The runtime consumes its evidence before dispatch, prevents concurrent writes, allows no changed body or target, checks existing deterministic markers, and records an attempted finding before the request can be sent. A successful response must contain a thread ID and the expected content and anchor. An error, timeout, or unverifiable response leaves the attempt `UNKNOWN`. Automatic retries are blocked: inspect Azure, then explicitly run a new review if appropriate. Earlier successful posts remain; there is no rollback or automatic deletion. The attempt cap applies across refreshed previews of the same review.

The upstream adapter supports right-side anchors. This version sends `threadContext` line coordinates without explicit iteration/change-tracking IDs; deleted-side-only findings are skipped. See Microsoft's [thread creation API](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads/create?view=azure-devops-rest-7.1) for the underlying distinction. It verifies HEAD-file coordinates, not membership in a specific displayed diff hunk; the model must select the relevant changed code, and a live Azure smoke test must confirm rendering.

The create API has no expected-HEAD/idempotency precondition in this adapter. A push or a new human comment can race the final read and create. The host/server may also retry internally. This is best-effort stale/duplicate prevention, not an atomic transaction or an exactly-once guarantee. The source HEAD check does not revalidate target-branch changes or the entire original review. Existing markers detect identical normalized evidence and locations; different wording across independent reviews still needs semantic inspection. No automated comment policy replaces human judgment or a merge gate.

## Customization and updates

Installed policy: `azpr/prompts/comment-policy.md`. Installed stage instructions: `azpr/prompts/comment-plan.md` and `comment-publish.md`. The review-wide `common.md` still prohibits writing. Change tone or team-specific policy locally, then restart; do not weaken the runtime's target, evidence, or authorization checks. Hard limits are enforced in `src/comments.mjs`; prompt edits alone cannot bypass them.

Set top-level `outputLanguage` in your installed `azpr/settings.json` to choose the language of both final-report Markdown and human-facing comment prose. It defaults to `en`; use `zh-TW` for Traditional Chinese, `zh-CN` for Simplified Chinese, or another language tag such as `ja`. Comment skip reasons use the same language. Initial reviews, structured fields, status receipts, identifiers, source quotes, and `issue (high):` / `issue (medium):` labels stay unchanged. The runtime retains the configured language with the completed review and provides it to the comment stages; publishing always sends the exact saved preview, with no translation pass.

Change the setting before reviewing and restart OpenCode. Settings changes invalidate the current process's workflow and restarting clears cached reports/previews, so changing language requires a new review and preview. The language is an instruction to the configured model, not a deterministic translation guarantee; inspect the generated text.

Installation with `--replace` preserves settings, including `outputLanguage`, but replaces prompts, archiving old files under `azpr-backups/`. Migrate any old prompt-based language override to this setting rather than reapplying conflicting language instructions. Reapply unrelated policy customizations from the backup as needed. Keep personal settings and model mappings out of Git; the repository's example remains English by default.

## Acceptance test before real use

1. Use a disposable/test PR and an approved account/provider. Record OpenCode and MCP versions.
2. Set `outputLanguage`, restart, and verify final-report prose and preview bodies use it while intermediate reviews stay English. Preview must create zero threads.
3. Publish one known issue and inspect the line placement and returned thread ID in Azure.
4. Repeat publishing, update the PR source, and add an equivalent human comment in separate tests: each must stop or skip appropriately, never silently duplicate or move the issue.
5. Deny the write permission or cancel; inspect Azure before retrying any uncertain request.

Offline tests cover the adapter and workflow with fixtures. They do not establish live Azure compatibility or successful publication in your organization.
