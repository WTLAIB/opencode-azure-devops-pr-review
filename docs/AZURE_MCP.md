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
govern these private agents. Their only explicit tool override is task=deny,
to keep nested model delegation under the orchestrator's control. Session grants
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

## Source readiness

The checker must establish PR identity, full base/head commits, cumulative
comparison scope, the complete changed-file list, and access to real source.
Descriptions, file lists, truncated responses, and last-push-only diffs are not
sufficient. Follow pagination and inspect actual return data.

READY and coverage are model-reported. The plugin validates the snapshot format
and consistency across stages, but does not interpret provider-specific output
to independently prove source access. When tools are missing or access is denied,
the checker should report NOT_READY with the missing capability, not demand an
inventory of all MCP tools. Partial initial reviews prevent final verification.

The checker uses a self-contained retrieval policy, without the common finding
review rules. Its decision path is identity, cumulative versions, all changes,
exact-commit source, then READY or a precise NOT_READY gap. It does not diagnose
defects or analyze unchanged tests. A short report and factual access recipes
avoid a second retrieval narrative; the schema descriptions do not verify facts.

### Avoiding repeated lookup failures

Recognized Azure cloud PR URLs supply a `urlIdentity` hint with separate
organization, project and repository names. Names are decoded once; the original
URL/context is preserved. Unknown server/collection layouts get no guessed hint.
Reviewers must confirm the identity from the server and follow each operation's
schema, including array types, short branch names versus full refs, and commit
SHAs versus blob IDs. The plugin never turns these hints into MCP arguments.

The checker records concise `sourceAccess` text fields for confirmed identity,
successful argument recipes, failed attempts/checked alternatives, cumulative
comparison, exact-commit reads and pagination. Existing envelopes without these
optional notes remain compatible. Both initial reviewers and the verifier receive
the notes unchanged, but must independently read the required source. Notes are
untrusted data, not permissions, source proof or another initial review's findings.

Group failures by operation, relevant version/argument semantics and observed
cause, with one checked alternative per capability. Later reviewers compare
planned reads against these observations before issuing a call. A cosmetic path
change does not make a failed capability new; re-probing needs a changed
precondition. Keep independent exact-commit reads and required freshness checks.
This remains prompt guidance, not a runtime guarantee against repeated MCP errors.
The plugin does not patch official MCP code or mask its errors. Unknown pagination,
partial change counts or synthesized iteration labels cannot prove completeness.

The source check ends once cumulative readiness is established; it does not
survey unrelated history, wikis or builds. Keyword search and file equality do
not prove ancestry. A complete cumulative comparison may establish the change
set without listing every unchanged file. If commit-based directory listing
fails, a branch listing is a disclosed fallback only with matching tip checks
before/after and complete results; contents still use exact commits. Unavailable
required evidence still produces NOT_READY/PARTIAL/INCOMPLETE as appropriate.

Prompt policy forbids identical retries for deterministic/permission errors and
speculative query loops. It allows at most one identical retry per logical read
only for an explicit transient error, within the existing session budget and host
guidance. This is not an enforced MCP retry counter, new session, wrapper, argument
rewriter or permission filter. `outputRetries` permits bounded status or final-
location amendments, not MCP recovery. Host/provider retries remain separate.

These changes address call selection and evidence wording. They do not repair
an installed MCP server bug or prove fewer live errors; compare saved tool history
and source coverage across controlled runs before making that claim.

### Version-specific capability limits

In the official Azure MCP
[v2.10.0 repository handlers](https://github.com/microsoft/azure-devops-mcp/blob/v2.10.0/src/tools/repositories.ts),
directory listing changes a Commit selector to Branch, while content reads keep
Commit. Its PR change summary retrieves one changes page, synthesizes the first
iteration label and does not expose the iteration's commonRefCommit. The summary's
top/skip inputs do not advance changes pages. These observations are specific to
that implementation, not assumptions about every connected MCP server.

Avoid unnecessary tree probes when verified cumulative changes plus exact-commit
content suffice. If a tree fallback is needed, validate its branch versions before
and after use; do not silently rewrite Commit into Branch. Missing pagination or
cumulative-base evidence remains a real gap. Azure documents the common-commit
comparison and next-page fields in
[iteration changes](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-iteration-changes/get?view=azure-devops-rest-7.1),
and the commonRefCommit in
[iterations](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-iterations/list?view=azure-devops-rest-7.1).
Availability in REST does not mean the current MCP exposes that capability.
This plugin adds no direct REST fallback, official-server patch or argument adapter.

## Data handling

Source, supplementary context, and tool results go through OpenCode to the model
services you configured. Use approved services and comply with organizational
access/retention policies. Never put credentials in review settings or prompts.
Ordinary OpenCode settings and MCP connections are left unchanged.
