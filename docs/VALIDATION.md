# Validation

## Offline checks

Run from the repository root with a supported Node.js development runtime:

```sh
npm test
npm run check
```

Workflow tests use mock OpenCode SDK responses and hooks. They cover configuration preservation, ordinary-chat no-ops, private-role authorization, exact model routing, two independent initial sessions in both modes, incomplete-profile refusal, snapshot consistency, complete finding dispositions, stale heads, cancellation, and display-only reports. Concurrent normal/deep tests verify static model bindings; comment tests verify the cached originating profile survives later reviews in another mode. Guidance-only settings never reach model instructions.

Lifecycle regressions cover unresponsive advisory UI/log requests, SDK abort calls
that ignore cancellation signals, abort API errors, lock release, and cancellation
during final-report or preview display. Cancelled reviews/previews cannot authorize
publication. Contract tests reject wrong-PR readiness, merge cycles, inconsistent
merge targets, explicit null settings, and empty prompts. Invalid source/planner/
publisher envelopes must be marked FAILED in stage diagnostics, not just at the
outer workflow. These are local orchestration checks, not remote cancellation or
source-authenticity guarantees.

Quality-contract tests require complete per-reviewer coverage ledgers, concrete
gap explanations for PARTIAL, counterevidence/severity/suggestion fields, and a
complete corrected finding for each CONFIRMED disposition. Native/text transports
both reject coverage omissions. Prompt JSON examples are checked against the
same validators and native schema fields. A two-session barrier test verifies
that both initial sessions start before either returns; zero findings still
invoke the final verifier. Comment tests verify corrected-claim handoff and reject
severity changes, low-severity promotion, or fallback to stale initial wording.
These are contract and routing checks, not empirical review-quality results.

Comment tests cover saved-plan validation, explicit publishing, arbitrary MCP tool names/arguments, host-denial simulations, confirmed-only eligibility, caps, whole-batch uncertainty bookkeeping, cancellation, and honest model-reported publication labels. They do not assert a programmatic read-only MCP boundary or parse provider-specific responses. No test posts to Azure.

Language tests cover the default, language-tag validation/canonicalization, final-only localization in both review modes, propagation to comment preview/publishing, unchanged saved comment bodies, restart requirements, and settings preservation across installer replacement. They check routing and instructions with mocks, not real-model translation quality.

Installer tests execute the real shell scripts in disposable directories. They cover fresh installs, the actual installed plugin import, no-backup replacement, settings preservation, rollback after an injected failure, emergency file retention if restoration also fails, conflicts, symlinks, locks, and archival uninstall. Existing historical backups remain untouched.

Manual-package tests install and import the plugin using only the 24 required
files, without docs, README, source package metadata, editor schema, or uninstaller.
They also cover replacement/migration from a full install, generated module
metadata, optional-copy failure warnings, and early rejection of every missing
required runtime, prompt, command, or migration file without replacing old files.
The manual list is also checked against the operational catalogs and source files.

Settings migration tests cover all four old model slots mapped to two three-role profiles, installed agent loading after conversion, nested missing defaults, explicit partial profiles, legacy directory migration, preserved non-model false/empty/null/array/custom values, repeated-install idempotence, private file permissions, and rejection of malformed/duplicate-key/non-object JSON, unsupported versions, or ambiguous mixed layouts before replacement. Python 3 standard library is required for these installer tests and for installation, not for plugin execution.

Compatibility tests target OpenCode **1.18.31**: a pure transcription of its
pre-hook command substitution checks that literal context cannot reach native
shell/file expansion through the supplied templates. This is not execution of
the full host. Tests also cover multiline/Unicode context through every review
stage, no cross-command inheritance, arbitrary MCP calls without name/action
filtering, unchanged host permission configuration, deprecated-setting handling,
and old-to-nested installation migration/rollback.

Test output is generated on demand rather than committed as a historical log.

Source-access regressions cover cloud URL identity hints without rewriting literal
context or guessing custom layouts, propagation of arbitrary successful/failed
call notes to both independent initials and the verifier, and unchanged host MCP
configuration/permissions. Prompt checks retain cumulative proof, before/after
tip checks for branch-listing fallback, bounded query exploration and independent
reads. Location guidance requires counting actual source lines without transport
wrappers; receipt checks distinguish successful READY from COMPLETE and forbid
retasking a reviewer to retrieve a report. These tests do not execute a model or
MCP server and cannot establish fewer errors, accurate line numbers or lower cost.

For live comparisons, keep the snapshot/configuration fixed and record all MCP
errors (including recovered ones), query arguments, per-stage/whole-run duration,
structured rejections and status amendments. Verify successful exact-commit reads,
complete coverage, source-access notes, final line anchors and evidence wording.
Check report retrieval separately from review completion. Do not interpret empty
warnings or a passing output schema as proof of error-free tool use or correct
claims. Repeat seeded and clean controls before generalizing a reliability gain.

Output/debug tests cover native structured envelopes, text compatibility,
ambiguous/malformed/oversized responses, identical receipt/full stage requests,
private diagnostic file modes, Git ignores, symlink refusal, failed-stage visible
output, last-message recovery, deterministic model attribution and merge tables,
and identical preview/publication disclosures. Tests do not prove a provider
will support native structured output or obey language/attribution instructions.

Finding-format regressions reproduce a padded evidence key and an empty unknown
field in native/text output for both profiles. They verify unchanged evidence,
raw-response retention, an explicit receipt/diagnostic audit and exactly four
ordinary review requests. Conflicting aliases, nonempty/nonstring extras,
misspellings, missing evidence, bad severity, duplicate IDs and snapshot/coverage
failures cannot pass or start a retry. Verifier paths and stale/unknown-head gates
remain covered. These are sanitized fixtures, not uploaded session exports.

Status-retry regressions cover the invalid top-level enum token seen in a live
review, immutable evidence, one-field amendments, the opt-in limit of one,
separate same-model sessions, ordinary-tool denial, a single repair model
request, both output transports/profiles, and preservation of both attempts.
Incomplete evidence, malformed output, host errors, stale heads, missing tool
bookkeeping, cancellation and unconfirmed aborts remain terminal. Comment
preview/publication never retry. Installer checks retain explicit opt-in while
adding missing `outputRetries` as zero. These tests use synthetic fixtures,
not private session exports, and do not establish improved live success rates.

Prompt-isolation regressions check that ordinary review sessions never receive
one-field amendment instructions, while granted repairs replace only the known
reviewer prompt and retain unrelated system context. They model the pinned host's
system-transform-before-params order and retained array reference. Missing or
ambiguous prompt replacement prevents repair inference. A status-only initial
submission reports the missing full-review fields and is never repaired.

Transport regressions require only the selected native/text submission policy
in each compiled role. The verifier schema uses a scalar string currentHead;
tests retain 40/64-character SHA support, reject missing or extra-quoted heads
for COMPLETE/STALE, keep unknown heads INCOMPLETE and different heads STALE.
These contract tests do not emulate every hosted tool parser or prove that a
schema change fixes a particular provider's streaming conversion.

Native-submission regressions reproduce bare-SHA JSON rejection through the
pinned host's invalid-tool hook shape. They cover the per-session limit, duplicate
hook delivery, independent reviewers, revocation of a hanging sibling, rejection
of another model request after the limit, comment uncertainty and exclusion of
invalid calls from source bookkeeping. Timeout tests retain the explicit cause
even when an SDK ignores or replaces the abort signal, and distinguish TIMED_OUT
from manual CANCELLED. No test repairs or adopts the malformed output.

## What remains unverified

Offline tests do not prove real OpenCode CLI/TUI compatibility, provider routing, Azure MCP capabilities, child-session navigation, cancellation propagation, or actual billing. No live end-to-end result is claimed.

## Environment acceptance

1. Confirm `opencode --version` is **1.18.31**, and record normal Plan/Build model and tool behavior. Other host versions require a new compatibility audit. Do not share credential-bearing debug configuration.
2. Confirm ordinary chat does not create private review sessions. Existing agents should still edit files and use their original tools and subagents.
3. Leave the `models.deep` roles empty initially. Deep mode must refuse to start. Run `/pr-check` against a small known PR and verify `models.review.risk` routing, complete cumulative changes, pagination, and exact-commit source access.
4. Run normal review mode. Inspect actual session/model IDs for source check, both independent initial reviews, and the separately configured verifier. The parent development conversation must not be copied into them.
5. Inspect the final report through child-session navigation. Completed private sessions must refuse reuse.
6. Configure all three approved `models.deep` roles only when ready. Verify exactly two initial reviews, deeper analysis instructions, routing, and finding dispositions. Partial initial reviews must prevent final verification; changed heads must not automatically rerun a review. Inspect provider usage records. Run a normal review afterward and confirm comments for the earlier deep review still use `models.deep.risk`.
7. Cancel from another ordinary session in the same process with `/pr-stop <run-id>`. Confirm only review sessions are affected.
8. Disable the plugin with `enabled: false`, restart, and confirm normal development still works.

Also enable debug on a disposable review in both return modes. Check all stage
artifacts and the receipt's path, set `outputLanguage: "zh-TW"`, and compare the
saved final report to the main conversation. Inspect AI/model disclosure in the
preview and actual test-PR comments. If a provider rejects `StructuredOutput`,
inspect the error before explicitly selecting text compatibility; do not retry
an uncertain publishing attempt. See [output troubleshooting](DEBUGGING.md).

Read-only behavior is a prompt rule. Inspect tool history to check model compliance,
and verify actual host/server permission enforcement on a disposable PR. The
plugin does not copy agent-only restrictions from the originating Plan/Build
agent. Do not mistake mock hook tests for a live permission or security audit.

If a run reports output-format-corrections, compare the original response with
the accepted stage result and outputFormatCorrections. Verify only allowed key
formatting or exactly empty unknown fields changed, all required values stayed
identical and no extra session was started. A recovered formatting defect still
counts as a model output defect; report it separately from unmodified successes.

If opting into `outputRetries: 1`, verify a qualifying failure's original FAILED
record and new `retryOf` session. Confirm the amendment returns only `status`,
all other fields remain unchanged, no ordinary tool executes during repair,
and a second model request is refused. Confirm cancellation still wins and
the overall deadline does not restart. Count original contract failures and
recovered outcomes separately; repeated synthetic successes are a smoke test,
not a guarantee for other models or repositories.

Before wider adoption, evaluate known historical PRs for missed issues, false positives, coverage, time, and cost. This integration is not a merge gate.

For the quality-first policy, inspect at least a real conditional failure, a
plausible but guarded non-bug, a file-scoped repository rule, and a review with no
initial findings. Verify the coverage ledgers against source, check the claimed
counterevidence, and inspect the verifier's corrected findings and reasons for
NEEDS_INFO/REJECTED/MERGED. A zero-finding review should still describe independent
checks and limitations. Do not use the verifier itself as the ground-truth judge
of whether the new policy improved recall or precision.

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
Replacement converts settings directly and retains no backup after success;
older existing `azpr-backups/` directories are left untouched. Unrelated files are not
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
