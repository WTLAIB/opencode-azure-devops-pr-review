# Validation

## Offline checks

Run from the repository root with a supported Node.js development runtime:

```sh
npm test
npm run check
```

Workflow tests use mock OpenCode SDK responses and hooks. They cover configuration preservation, ordinary-chat no-ops, private-role authorization, exact model routing, independent initial sessions, paid-stage restrictions, snapshot consistency, complete finding dispositions, stale heads, cancellation, and display-only reports.

Comment tests cover saved-plan validation, explicit publishing, arbitrary MCP tool names/arguments, host-denial simulations, confirmed-only eligibility, caps, whole-batch uncertainty bookkeeping, cancellation, and honest model-reported publication labels. They do not assert a programmatic read-only MCP boundary or parse provider-specific responses. No test posts to Azure.

Language tests cover the default, language-tag validation/canonicalization, final-only localization in both review modes, propagation to comment preview/publishing, unchanged saved comment bodies, restart requirements, and settings preservation across installer replacement. They check routing and instructions with mocks, not real-model translation quality.

Installer tests execute the real shell scripts in disposable directories. They cover fresh installs, the actual installed plugin import, replacement backups, settings preservation, rollback after an injected failure, conflicts, symlinks, locks, and archival uninstall.

Compatibility tests target OpenCode **1.18.31**: a pure transcription of its
pre-hook command substitution checks that literal context cannot reach native
shell/file expansion through the supplied templates. This is not execution of
the full host. Tests also cover multiline/Unicode context through every review
stage, no cross-command inheritance, arbitrary MCP calls without name/action
filtering, unchanged host permission configuration, deprecated-setting handling,
and old-to-nested installation migration/rollback.

Test output is generated on demand rather than committed as a historical log.

## What remains unverified

Offline tests do not prove real OpenCode CLI/TUI compatibility, provider routing, Azure MCP capabilities, child-session navigation, cancellation propagation, or actual billing. No live end-to-end result is claimed.

## Environment acceptance

1. Confirm `opencode --version` is **1.18.31**, and record normal Plan/Build model and tool behavior. Other host versions require a new compatibility audit. Do not share credential-bearing debug configuration.
2. Confirm ordinary chat does not create private review sessions. Existing agents should still edit files and use their original tools and subagents.
3. Leave deep/final slots empty initially. Deep mode must refuse to start. Run `/pr-check` against a small known PR and verify complete cumulative changes, pagination, and exact-commit source access.
4. Run economy mode. Inspect actual session/model IDs for source check, both independent initial reviews, and final verification. The parent development conversation must not be copied into them.
5. Inspect the final report through child-session navigation. Completed private sessions must refuse reuse.
6. Configure approved deep-mode models only when ready. Verify routing and finding dispositions. Partial initial reviews must prevent final verification; changed heads must not automatically rerun a review. Inspect provider usage records.
7. Cancel from another ordinary session in the same process with `/pr-stop <run-id>`. Confirm only review sessions are affected.
8. Disable the plugin with `enabled: false`, restart, and confirm normal development still works.

Read-only behavior is a prompt rule. Inspect tool history to check model compliance,
and verify actual host/server permission enforcement on a disposable PR. The
plugin does not copy agent-only restrictions from the originating Plan/Build
agent. Do not mistake mock hook tests for a live permission or security audit.

Before wider adoption, evaluate known historical PRs for missed issues, false positives, coverage, time, and cost. This integration is not a merge gate.

Also run `/pr-check <URL> <context>` and `/pr-review <URL> <same context>` against
a test PR with a concrete acceptance requirement. Inspect the private-stage
inputs for `prUrl` and `userContext`, and confirm the final report addresses the
requirement. Check-only context is intentionally not remembered. A mock test
proves propagation, not that every model will follow the instructions perfectly.

For optional comment publishing, also complete the [disposable-PR acceptance checks](COMMENTING.md#acceptance-test-before-real-use). Live anchor rendering, installed MCP schema/output compatibility, and race behavior remain environment-specific.

## Directory traversal diagnostics

A prior `Blocked: directory traversal violation` during `/pr-check` could not be
reproduced without its surrounding log. Moving the runtime under `plugins/azpr/`
removes the old parent-directory loader import; protecting raw command text also
removes native argument expansion from this workflow. Neither observation proves
the original exception's source or establishes that OpenCode bans parent imports.
Do not disable host path protections or grant unrestricted filesystem access.

Close OpenCode, run `sh install.sh --replace`, check the printed settings path,
and restart. Only `plugins/azpr.js` should be the top-level AZPR plugin entry;
helpers stay in `plugins/azpr/`. Do not keep additional manually copied loaders.
Old files/settings are recoverable under `azpr-backups/`; unrelated files are not
automatically removed. If you flattened files manually, inspect duplicate entries
before changing them. Never delete the entire plugins directory.

If the error recurs, record these boundaries, with company details redacted:

- Before the AZPR start notification: check command/config/plugin loading and
  native command expansion. The runtime cannot label errors that occur before
  its hook. Do not assume the Azure server was called.
- After start: the receipt labels source check, initial reviews, or final
  verification. Record the private session and failing tool name, if any.
- An ADO tool error: inspect that tool's path/commit parameters and MCP-side logs.
  A server's repository-path validation is different from local plugin loading.

Keep logs private. Share only the error and a few sanitized surrounding lines,
never tokens, authentication configuration, source contents, or full debug dumps.
