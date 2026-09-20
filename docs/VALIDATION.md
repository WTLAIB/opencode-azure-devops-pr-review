# Validation

## Offline checks

Run from the repository root with a supported Node.js development runtime:

```sh
npm test
npm run check
```

Workflow tests use mock OpenCode SDK responses and hooks. They cover configuration preservation, ordinary-chat no-ops, private-role authorization, exact model routing, independent initial sessions, paid-stage restrictions, snapshot consistency, complete finding dispositions, stale heads, cancellation, and display-only reports.

Comment tests additionally cover read-only previews, explicit saved-plan publishing, strict target/action/body/anchor checks, tool-output parsing, source-head freshness, complete thread pagination, duplicate markers, confirmed-only eligibility, comment caps, global permission denial, uncertain-write bookkeeping, cancellation, and observed rather than model-claimed success. No test posts to Azure.

Language tests cover the default, language-tag validation/canonicalization, final-only localization in both review modes, propagation to comment preview/publishing, unchanged saved comment bodies, restart requirements, and settings preservation across installer replacement. They check routing and instructions with mocks, not real-model translation quality.

Installer tests execute the real shell scripts in disposable directories. They cover fresh installs, the actual installed plugin import, replacement backups, settings preservation, rollback after an injected failure, conflicts, symlinks, locks, and archival uninstall.

Test output is generated on demand rather than committed as a historical log.

## What remains unverified

Offline tests do not prove real OpenCode CLI/TUI compatibility, provider routing, Azure MCP capabilities, child-session navigation, cancellation propagation, or actual billing. No live end-to-end result is claimed.

## Environment acceptance

1. Record the installed OpenCode version and normal Plan/Build model and tool behavior. Compare after installation. Do not share credential-bearing debug configuration.
2. Confirm ordinary chat does not create private review sessions. Existing agents should still edit files and use their original tools and subagents.
3. Leave deep/final slots empty initially. Deep mode must refuse to start. Run `/pr-check` against a small known PR and verify complete cumulative changes, pagination, and exact-commit source access.
4. Run economy mode. Inspect actual session/model IDs for source check, both independent initial reviews, and final verification. The parent development conversation must not be copied into them.
5. Inspect the final report through child-session navigation. Completed private sessions must refuse reuse.
6. Configure approved deep-mode models only when ready. Verify routing and finding dispositions. Partial initial reviews must prevent final verification; changed heads must not automatically rerun a review. Inspect provider usage records.
7. Cancel from another ordinary session in the same process with `/pr-stop <run-id>`. Confirm only review sessions are affected.
8. Disable the plugin with `enabled: false`, restart, and confirm normal development still works.

Before wider adoption, evaluate known historical PRs for missed issues, false positives, coverage, time, and cost. This integration is not a merge gate.

For optional comment publishing, also complete the [disposable-PR acceptance checks](COMMENTING.md#acceptance-test-before-real-use). Live anchor rendering, installed MCP schema/output compatibility, and race behavior remain environment-specific.
