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

## Data handling

Source, supplementary context, and tool results go through OpenCode to the model
services you configured. Use approved services and comply with organizational
access/retention policies. Never put credentials in review settings or prompts.
Ordinary OpenCode settings and MCP connections are left unchanged.
