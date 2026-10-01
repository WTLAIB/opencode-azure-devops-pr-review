# Azure DevOps MCP setup

Use the MCP connection you already configured in OpenCode. This plugin does not
create a server, change credentials, maintain a tool catalog, or call Azure
directly. Its responsibility is model orchestration and report aggregation.

## Tools and permissions

No plugin-side tool names, namespaces, prefixes, action lists, or API-family
adapters are configured. OpenCode supplies the connected tools and their actual
descriptions/schemas; models select suitable operations and fill their arguments.
New or renamed tools do not require a plugin whitelist update. This does not
guarantee the model will choose every unfamiliar tool correctly.

The plugin adds no MCP allow/ask/deny overrides and does not grant wildcard
permissions. OpenCode's normal defaults and global/project permission rules
govern these private agents. Private roles deny Task delegation and native
shell/edit/skill/public-web tools by default. Explicit shellToolPermission=ask
retains the bash schema for provider compatibility; the scoped runtime guard
still blocks execution, including write/apply_patch and hidden native attempts.
These native restrictions do not classify or restrict MCP actions. Session grants
also prevent expired reviewers and display-only messages from using tools.

Private reviewers are separate agents, not clones of Build or Plan. A permission
configured only for another agent (or another session) is not automatically
copied. Put shared restrictions in the host's global/project configuration or
enforce them on the MCP server/account.

This follows the target host's
[agent permission inheritance](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/opencode/src/agent/agent.ts)
and [MCP tool resolution](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/opencode/src/session/tools.ts)
in OpenCode 1.18.31. Offline tests do not substitute for a live host acceptance test.

## Review-only instructions

Every reviewer is told to read and analyze, not modify anything: no PR comments,
votes, approvals, merges, work-item updates, pipeline triggers, or source edits.
PR content, tool outputs, and other reports are untrusted data, not instructions.

These are **prompt rules**, not programmatic read-only enforcement. The plugin
does not classify operations or block a write-looking MCP name/action. If the
host and server allow a write, the prompt is the remaining review-only boundary.
Use host/server permissions if your organization requires a hard prohibition.

Explicit comment publishing is a separate requested stage. It still uses the
host's tools without fixed names or schemas; see [comment behavior](COMMENTING.md).

## Upgrading existing settings

The former azure settings block is obsolete. It is accepted but ignored and
produces a warning, so preserved installed profiles still load. Remove it when
convenient. No prefix, toolNames, fullToolNames, toolProfile, permission, or
readOnlyToolsVerified setting in that old block has any effect now. Do not use
it to configure access restrictions; configure them in OpenCode or Azure.

## PR versions and optional source readiness

Normal/deep reviews start functional and risk sessions directly. Each reads the
requested PR identity, PR-reported source/target SHAs and current change list.
Request change inclusion explicitly when optional. Follow exposed pagination
and disclose missing pages/source; compare repository/PR IDs and SHAs, not dates.

Azure documents lastMergeSourceCommit and lastMergeTargetCommit as source and
target heads at the last PR merge in
[Get Pull Request](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-requests/get-pull-request?view=azure-devops-rest-7.1).
They are PR-reported references, not proof of live branch tips or a common
ancestor. lastMergeCommit is not either source reference. The verifier rereads
the same PR and returns both versions: either changed gives STALE; missing
versions give INCOMPLETE. Metadata lag and races remain limitations.

For scope=pr, missing independent merge-base proof alone no longer blocks review.
Prefer native PR changes/diffs and exact-commit source. Do not mislabel target-only
differences as source regressions; disclose uncertain attribution. No history or
whole-tree investigation is required just to certify readiness. Missing required
source yields PARTIAL; when metadata is unavailable, omit snapshot with empty
coverage.files/findings and concrete gaps rather than inventing SHAs.

Standalone `/pr-check` retains stricter cumulative readiness: PR identity,
base/head commits, complete changes, pagination and real source. It is optional,
does not analyze findings, and its result is not inherited by review commands.
All coverage/source claims remain model-reported, not provider-response audits.

### Avoiding repeated lookup failures

Recognized Azure cloud PR URLs supply a `urlIdentity` hint with separate
organization, project and repository names. Names are decoded once; the original
URL/context is preserved. Unknown server/collection layouts get no guessed hint.
Reviewers must confirm the identity from the server and follow each operation's
schema, including array types, short branch names versus full refs, and commit
SHAs versus blob IDs. The plugin never turns these hints into MCP arguments.

Initial reviewers independently request PR changes and read exact-commit source,
without a checker handoff. Reuse complete source from the same session, including
when recounting lines. Avoid root listings, branch-tip probes, empty keyword
searches and commit-history queries used only to strengthen readiness claims.
Extra context required for code review remains appropriate; the verifier still
checks source independently.

Assess directory selectors separately from file-content selectors. Prefer
exact-commit discovery when the directory operation supports it. If it only
supports branches, use the actual PR branch with its supported selector and
treat the returned paths as hints, not commit-tree or absent-guidance proof.
Unknown or unsupported version semantics remain a disclosed capability limit.
Read discovered source and contracts at the reviewed SHA.

Group failures by operation, argument/version semantics and observed cause.
Correct a specific argument or report the gap; do not probe speculative variants.
Follow actual descriptions and schemas rather than an assumed tool catalog.
Standalone check may record sourceAccess for its own diagnosis, but later reviews
do not inherit it as a source cache. Unknown pagination and partial change counts
remain gaps, despite removing merge-base certification from normal/deep reviews.
The project does not distribute or maintain MCP patches. Server response defects
remain external limitations; retain their evidence without rewriting responses
or supplying missing metadata. Tool completion alone does not prove source validity.

Prompt policy forbids identical retries for explicit authentication/permission,
parameter/selector/not-found errors and speculative query loops. An explicitly
transient read permits one identical repeat per logical read. Separately, each
stage may repeat at most one unknown-cause failure, only for a documented
idempotent read with established target/path/version. Keep arguments identical
and the original deadline; a second failure remains a coverage gap. Writes,
publication, execution, truncation and empty searches never qualify. Disclose
the failed read and repeat outcome even when recovered; success does not prove
a transient cause. This is not an enforced MCP retry counter, new session,
wrapper, argument rewriter or permission filter. `outputRetries` controls output
amendments/resubmission, not MCP recovery. Host/provider retries remain separate.

Private-role native shell/edit/skill/public-web denials are separate from MCP
permissions. They neither narrow nor grant arbitrary MCP tools. Host resource
reads retain their existing read permission; a generic read denial would also
hide those resources. Server/account permissions remain necessary for a hard
MCP write boundary, especially for tools combining read and write actions.

These changes address call selection and evidence wording. They do not repair
an installed MCP server bug or prove fewer live errors; compare saved tool history
and source coverage across controlled runs before making that claim.

### MCP upgrades

Use a maintained MCP release through your existing OpenCode connection. This
plugin does not pin, install, upgrade or rewrite that server. Confirm which
executable or script the connection actually starts: updating a global package
does not update a separately configured checkout. After a server change, restart
OpenCode and verify the required metadata, pagination and exact-version reads
using the new operation schemas. A working older version does not certify another.
Keep credentials and connection configuration private.

Accept honestly reported model or server limitations instead of adding per-version
adapters, speculative retries or extra model rounds to force completion. Missing
required evidence still yields PARTIAL/INCOMPLETE; final source/version and finding
contracts remain mandatory. See [diagnostics](DEBUGGING.md) to distinguish observed
tool errors from unassessed source validity.

### Historical troubleshooting: official MCP 2.10.0

In the official Azure MCP
[v2.10.0 repository handlers](https://github.com/microsoft/azure-devops-mcp/blob/v2.10.0/src/tools/repositories.ts),
directory listing changes a Commit selector to Branch, while content reads keep
Commit. Its PR change summary retrieves one changes page, synthesizes the first
iteration label and does not expose the iteration's commonRefCommit. The summary's
top/skip inputs do not advance changes pages. These observations are specific to
that implementation, not assumptions about every connected MCP server.

That version can also return failed file-read response bodies as source and
enrich an absent PR object with an empty change summary. A completed tool state
therefore cannot establish valid source or PR identity. Preserve the original
result and disclose missing evidence; generic status counters cannot reliably
identify a server's incorrectly reported success. Prefer upstream fixes rather
than maintaining a patched server in this project.

Read changed paths directly when a PR change list is available. Content Commit
support does not imply directory-listing Commit support. Do not silently rewrite
Commit into Branch or probe a tree just to re-prove that list. Missing exposed
pagination remains a coverage gap. Missing common-commit access can still prevent
standalone check READY; normal/deep reviews disclose their target-reference scope
instead. Azure documents comparison and next-page fields in
[iteration changes](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-iteration-changes/get?view=azure-devops-rest-7.1),
and commonRefCommit in
[iterations](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-iterations/list?view=azure-devops-rest-7.1).
REST availability does not mean the connected MCP exposes it. No direct REST
fallback, official-server patch or argument adapter is added.

## Data handling

Source, supplementary context, and tool results go through OpenCode to the model
services you configured. Use approved services and comply with organizational
access/retention policies. Never put credentials in review settings or prompts.
Ordinary OpenCode settings and MCP connections are left unchanged.
