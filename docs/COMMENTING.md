# Human-readable Azure PR comments

`/pr-comment` is a separate, opt-in workflow for turning a completed review into a small number of actionable inline discussions. Review prompts instruct models not to modify anything; MCP permissions are governed by OpenCode. This command uses `freeB` for planning and, only when explicitly requested, for publishing the saved preview. It does not rerun the reviewers or switch to paid slots. The slot name does not guarantee cost.

## Policy and rationale

The policy draws on three public practices:

- [Google's review-comment guidance](https://google.github.io/eng-practices/review/reviewer/comments.html): explain the reason, be constructive, and distinguish important changes from optional advice. Here, comments describe the triggering condition and impact, then suggest a focused correction or test.
- [Conventional Comments](https://conventionalcomments.org/): structured labels make feedback easier to scan. Here, `issue (high):` and `issue (medium):` identify actionable defects. These are this project's severity labels, not Azure votes or assertions that a merge is blocked.
- [Microsoft's Azure PR guidance](https://learn.microsoft.com/en-us/azure/devops/repos/git/review-pull-requests?view=azure-devops): use line-specific discussion for local code issues. Here, publish inline only; keep the long report and all skipped findings in OpenCode.

The following limits are project choices, not universal standards:

| Rule | Default |
| --- | --- |
| Eligibility | Confirmed high/medium-impact defects only |
| Volume | At most 5 saved comments; configurable from 1 to 10; one publishing stage per review |
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

In your private plugins/azpr/settings.json, set comments.enabled=true before
reviewing and restart OpenCode. The default is false; preview is still available.
Set outputLanguage (for example, zh-TW) to control both final-report and comment
prose. Intermediate review output and structured keys stay in English.

From the same original conversation/process:

```text
/pr-review https://dev.azure.com/ORG/PROJECT/_git/REPO/pullrequest/123
/pr-comment <completed-review-id>
/pr-comment <completed-review-id> --publish
```

The preview shows bodies, locations, and skip reasons even in receipt mode.
Inspect it before requesting publication. The publisher receives the saved
content and coordinates, not a freshly generated plan. It is instructed to
send the content exactly, without translation or relocation.

The workflow does not start a publisher without explicit --publish. This is not
a guarantee that a model cannot misuse a host-permitted tool during review or
preview: read-only behavior there is a prompt instruction.

## MCP calls

Models use the tools and schemas actually exposed by OpenCode. There is no fixed
tool prefix, name, action list, read adapter, or create-thread adapter. The model
must find suitable operations to read exact-commit source, enumerate all threads,
check current PR identity/HEAD, and create an inline comment if authorized.

A tool listing comments in one thread is not enough to verify all PR discussions.
If a required capability is unavailable, the model must stop rather than guess,
skip verification, or substitute a long general comment. OpenCode and the MCP
server still enforce their own permissions; the plugin adds no MCP overrides.

The target parser currently accepts canonical dev.azure.com and hosted
organization.visualstudio.com PR URLs. This identifies the intended target;
it does not independently verify the identity returned by an MCP operation.
On-premises Azure URLs are not currently supported for the comment workflow.

## What is enforced and what is instructed

The runtime checks plan structure: known confirmed finding IDs, maximum plan
size, high/medium labels, body length, changed-file paths, 1-5 line ranges, anchor
line count, and an explanation for every skipped eligible finding. It adds stable
markers. These checks are not proof that source lines or findings are correct.

Reading source, checking HEAD/identity, finding duplicate discussions, using only
create operations, sending exact content to the intended PR, and verifying the
actual create response are **model instructions**, not MCP-call guards.

Before starting a publisher, the runtime marks the whole batch UNKNOWN. A valid
publisher report with all planned IDs can produce MODEL_REPORTED_POSTED, showing
the reported thread IDs. This is explicitly model-reported, not independent Azure
verification. No completed tool call, a malformed report, missing posts, failure,
or cancellation leaves an incomplete or uncertain result. Generic completed tool
calls do not establish that a write happened or that it was correct.

Only one publishing attempt is allowed per completed review. After any attempt,
inspect Azure before starting a new review. The plugin cannot identify which
calls were writes and never retries the batch automatically. This is not an
exactly-once guarantee: the model, host, or server could still retry operations.
Prompts forbid blind retries. A push or new discussion can race the last check.
Cancellation cannot undo already dispatched operations; no remote rollback or
deletion is attempted.

Completed reviews/previews are kept only in this process (latest 20 reviews).
Restarting clears that cache, not OpenCode history. Empty plans start no publisher
and do not request a summary thread.

## Customization

Installed instructions are in plugins/azpr/prompts/comment-policy.md,
comment-plan.md, and comment-publish.md. Review-only instructions remain in
common.md. Use outputLanguage for localization rather than translating prompts.
Changing installed settings requires a restart; updating replaces prompt files
and archives old copies. Never commit private settings, model IDs, or PR data.

## Acceptance test before real use

1. Use a disposable PR, OpenCode 1.18.31, and approved model/MCP services.
2. Verify host asks/denies remain in effect for all private stages.
3. Confirm the final report and preview use outputLanguage and the requested
   review context. Inspect actual tool history: review and preview should make
   no modifications, but this is not guaranteed by the plugin.
4. Publish one saved comment. Check its actual Azure target, text, line anchor,
   marker, and thread ID; do not rely solely on MODEL_REPORTED_POSTED.
5. Test unavailable tools, stale HEAD, existing discussions, cancellation, and
   denied writes. The model should stop; the workflow must not retry a batch.

Offline tests exercise orchestration and report/plan validation with mocks, not
real-model policy compliance, Azure rendering, or live server compatibility.
