# Azure DevOps MCP setup

The plugin uses your existing Azure MCP connection. It does not create a server, change credentials, check out a PR, or run Azure CLI. Review permissions apply only to private review sessions.

## Tool mapping

Inspect the actual tools and schemas exposed in your OpenCode environment. You need PR metadata, cumulative changes and iterations, source at exact commits, and any relevant read-only requirements, discussions, or CI data.

If a tool is named `ado_repo_pull_request`, use prefix `ado` and include `repo_pull_request` in `toolNames`. Alternatively, list complete names in `fullToolNames`. Wildcards and approximate matches are rejected.

```json
{
  "prefix": "ado",
  "permission": "ask",
  "readOnlyToolsVerified": false,
  "toolNames": ["repo_pull_request", "repo_file"],
  "fullToolNames": []
}
```

The example settings are a starting point, not a verified tool list for your environment. Remove unavailable tools and check the schemas of those you keep.

Keep `ask` until a maintainer has verified every exposed action is read-only. Use `allow` only with `readOnlyToolsVerified: true` and appropriate server permissions. Existing global ask/deny restrictions are preserved.

For dispatchers with an `action` or `operation`, the runtime accepts only: `get`, `list`, `search`, `get_changes`, `get_content`, `get_diff`, `get_file`, `get_files`, `get_iteration`, `get_iterations`, `get_comments`, `get_commit`, `get_commits`, `get_logs`, `get_log`, and `get_threads`.

Unknown actions are rejected. Add an action only after checking its schema and adding a regression test. Dedicated tools without dispatcher fields still need manual verification. A tool name alone cannot establish that it is read-only.

## Source readiness

`/pr-check` must establish the PR identity, full base/head hashes, cumulative comparison scope, complete paginated file list, and access to real differences and source at selected commits.

If no native diff is available, complete and trustworthy before/after source versions are required. Titles, descriptions, filenames, and truncated diffs are not sufficient.

| Status | Meaning |
| --- | --- |
| `READY` | Source prerequisites are available; this is not a code-quality verdict. |
| `NOT_READY` | Required data or tool capabilities are missing. |
| `INCOMPLETE` | Model, SDK, hook, output, or snapshot validation failed. |

Each stage must complete at least one permitted Azure call. That does not prove full file coverage; inspect reports and sample evidence during validation.

## Data access

Enforce read-only permissions on the MCP server or in Azure as well. Reviewers must not comment, vote, approve, merge, modify work items, or trigger pipelines.

Source and tool results are sent to the configured model services through OpenCode. Use approved providers and follow organizational access and retention policies. Never put tokens or passwords in plugin settings or reports. Starting OpenCode in an untrusted PR's configuration directory can expose the host to unrelated configuration or plugin behavior.
