# Validation

## Native tools, recovery guidance and terminal diagnostics

Regression coverage includes private native-tool denials and hidden-tool attempts,
the second-attempt abort, ordinary-agent/MCP permission preservation, comment
preview/publisher grants, and unchanged repair/display restrictions. Test the
real host in an isolated directory with a local fake provider/MCP before installation:
verify denied schemas disappear, forced native calls never execute, a blocked
attempt remains disclosed, and repeated attempts revoke the run.

Repeat with explicit `shellToolPermission: "ask"`: bash must remain in provider
schemas while other denied native tools stay absent. Force native bash calls in
both initial roles and the verifier, and two calls in one stage. Check tool states,
runtime prevention counts, process execution traces and a harmless marker; no
command or approval request may occur. Validate the trace/marker detector with
a separate positive control outside review sessions. Use the actual unmodified
runtime without an extra blocking plugin. Test settings migration from omission
to deny, preservation of ask, rejection of allow/null, and unchanged ordinary
agents/MCP permissions. Then separately test the selected real provider: record
service acceptance and completed-review validation as different outcomes. A
fake provider cannot establish compatibility with a hosted service.

Terminal event tests cover failed calls without after-hooks, duplicate/conflicting
states, unrelated sessions, invalid timestamps, cancellation and late events.
These events never supply successful evidence; diagnostics omit raw arguments,
output and errors. Prompt/schema checks distinguish seven-field findings from
eight-field confirmed rows and retain all existing evidence/version validators.

Unknown-cause read recovery is model guidance, not a hard runtime retry counter.
Evaluate one identical idempotent-read repeat, repeated failure becoming a gap,
and no repeats for explicit denied/deterministic errors or writes. Quality tests
still need independently labeled live examples for reachable triggers, static
versus executed tests, bounded counterevidence, exact quotes and severity impact.
Known-file batching must retain every necessary source read and final freshness;
passing mocks does not prove less latency or improved model compliance.

## Report-quality acceptance cases

Define expected outcomes independently before changing prompts. Keep the answer
key outside reviewer-visible source, context and instructions. Evaluate the final
finding fields, disposition reasons and overview, not only the COMPLETE status.
Use these cases for manual assessment of recorded outputs and separately authorized
live comparisons; they are not semantic regex checks or runtime acceptance gates.

| Case | Evidence supplied by the case | Acceptance criterion |
| --- | --- | --- |
| Numeric state and delta | Expected balance 40; resulting balance 46 after two excess adjustments of 3. | Any stated excess is 6 and agrees with the trace. Do not confuse final balance, per-operation change and total deviation. |
| Assertion order | An exception assertion fails before later state assertions in the same test; no test was executed. | Identify the first predicted failure. Describe later state differences as static predictions, never executed assertion failures. A general caveat cannot excuse a contradictory finding. |
| Evidence scope and quotes | One function and caller at a fixed commit, a branch path listing, and a file containing several classes. | Name the inspected guards and version. Do not infer repository-wide absence or class counts from partial evidence. Keep quotations exact and paraphrases unquoted. |
| Severity and recovery | Contrast a reachable cross-account destructive operation with a bounded, recoverable same-account error; deployment scope may be unknown. | Explain affected authority/state, scope and recovery in existing evidence. Support severity changes with a decisive reason; neither an authorization keyword nor a test-fixture label decides the rating. Disclose unknown deployment impact. |
| Concise, complete output | Duplicate candidates with a corrected location and distinct supported impacts. | One complete evidence packet per confirmed issue; all original IDs retain decisions. Merge reasons identify the shared cause, and the overview adds exclusions or limits. Correct the canonical location without repeatedly narrating offsets; preserve distinct impacts and counterevidence. |
| Guarded and clean controls | A reachable guard refutes a plausible candidate, an equivalent rewrite, and a clean change. | No invented defect. Keep independent verification, full coverage and final source/target checks even with zero findings. |
| Cross-file contract | A changed function depends on another file, including a changed supporting contract. | Verify the relevant versions and call path independently; do not omit support evidence to shorten the report. |

For a fixed seeded PR, require all independently known defects, no false-positive
control, complete original-ID decisions, correct final locations and versions.
Score each quality case as pass, fail or not exercised, with the concrete claim,
supporting evidence and impact. Keep the following assessments separate:

| Assessment | Required evidence | Interpretation |
| --- | --- | --- |
| Operational integrity | Validated stages, independent source verification, complete coverage/IDs, current versions, correct workflow and disclosed recovery. | Blocking for execution acceptance. COMPLETE establishes the implemented workflow contract, not factual perfection or PR approval. |
| Factual quality | Actual defect identity, reachable trigger, exact evidence/locations, numerical and assertion accuracy, bounded scope and justified severity. | Record concrete errors and whether they change the finding, impact or recommended fix. A supported high/medium difference alone is not a failure; do not silently correct or overlook wrong claims. |
| Presentation | Concision, clear language and one complete canonical evidence packet. | Record redundancy or awkward wording separately. They do not by themselves invalidate execution; lost evidence belongs in the stronger assessments above. |

Define the release scope before live validation. A bounded smoke check may establish
that a change executes correctly while leaving documented model-quality work open;
it cannot be reported as passing every quality case. A false positive, missed known
defect, missing evidence or materially wrong correction must remain explicit.
Keep older rubrics and their historical scores unchanged when adopting this grading.
One successful PR cannot exercise this entire matrix.
Record prompt composition, models, settings, source versions and budgets; preserve
failed samples and original outputs. Compare completion and quality before timing.
Prompt tests establish delivery and unchanged contracts, not truthful model prose;
a same-model submission check is not independent verification or a speed guarantee.

## Offline checks

Run from the repository root with a supported Node.js development runtime:

```sh
npm test
npm run check
```

Workflow tests use mock OpenCode SDK responses and hooks. They cover configuration preservation, ordinary-chat no-ops, private-role authorization, exact model routing, two independent initial sessions in both modes, incomplete-profile refusal, snapshot consistency, complete finding dispositions, stale source/target versions, cancellation, and display-only reports. Concurrent normal/deep tests verify static model bindings; comment tests verify the cached originating profile survives later reviews in another mode. Guidance-only settings never reach model instructions.

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

Source-access regressions cover URL identity hints without altering literal
context or guessing custom layouts, independent initial inputs, and unchanged
host MCP permissions/configuration. Normal/deep tests require three stages,
matching PR identities and source/target SHAs, sorted path union, retained
original lists, and a final check of both versions. Identity/version mismatches
prevent verification. Missing metadata can produce honest PARTIAL without fake
SHAs; a status-only placeholder remains a failed review, not an amendment.

Standalone policy retains cumulative proof and branch-fallback limits; review
policy avoids ancestry/tree discovery and requests changed-file inclusion.
Location guidance counts source lines without wrappers; receipts forbid
retasking completed reviewers. These tests do not prove fewer live errors,
accurate source anchors or lower cost.

For live comparisons, keep the snapshot/configuration fixed and record all MCP
errors (including recovered ones), query arguments, per-stage/whole-run duration,
structured rejections and status amendments. Verify successful exact-commit reads,
complete coverage, independently discovered change lists, final line anchors and evidence wording.
Check report retrieval separately from review completion. Do not interpret empty
warnings or a passing output schema as proof of error-free tool use or correct
claims. Repeat seeded and clean controls before generalizing a reliability gain.

Output/debug tests cover native structured envelopes, text compatibility,
ambiguous/malformed/oversized responses, identical receipt/full stage requests,
private diagnostic file modes, Git ignores, symlink refusal, failed-stage visible
output, last-message recovery, deterministic model attribution and merge tables,
and identical preview/publication disclosures. Tests do not prove a provider
will support native structured output or obey language/attribution instructions.

Trailing-comma tests cover normal/deep initial and final text, raw preservation,
exact correction offsets, nested objects/arrays, escapes, quoted source punctuation,
and unchanged values. Negative cases reject holes, doubled/leading commas, missing
values/brackets, invalid tokens, multiple envelopes, duplicate/escaped-equivalent
keys, bad finishes and oversized data. Runtime tests keep full evidence, coverage,
versions and original-ID validation, and ensure a failed normalized candidate cannot
unlock a model amendment. Checks, native transport, comments and amendments remain
strict. Historical failures replayed offline remain historical failures; no absent
verifier is inferred to have completed.

Finding-format regressions reproduce a padded evidence key and empty-string/null unknown
field in native/text output for both profiles. They verify unchanged evidence,
raw-response retention, an explicit receipt/diagnostic audit and exactly three
ordinary review requests. Conflicting aliases, content-bearing extras,
misspellings, missing evidence, bad severity, duplicate IDs and snapshot/coverage
failures cannot pass through local normalization. A verifier with a known unchanged
version frame may qualify for the separately tested final content resubmission;
initial evidence/coverage gaps remain terminal. Verifier paths and stale/unknown-head gates
remain covered. Exact duplicate V-disposition tests retain raw reasons and reject
conflicting values, missing original IDs, duplicate discoveries and extra rows.
These are sanitized fixtures, not uploaded session exports.

Status-retry regressions cover the invalid top-level enum token seen in a live
review, immutable evidence, one-field amendments, the opt-in limit of one,
separate same-model sessions, ordinary-tool denial, a single repair model
request, both output transports/profiles, and preservation of both attempts.
Incomplete evidence, malformed output, host errors, stale heads, missing tool
bookkeeping, cancellation and unconfirmed aborts remain terminal. Comment
preview/publication never retry. Installer checks retain explicit opt-in while
adding missing `outputRetries` as zero. These tests use synthetic fixtures,
not private session exports, and do not establish improved live success rates.

Final submission regressions cover required category arrays, unchanged conversion
to complete corrected findings/dispositions, legacy-only compatibility and mixed-
format rejection. Snapshot file permutations pass while duplicate/missing paths
and changed identity do not. Bounded final resubmission tests cover malformed
array containers and missing corrected findings, same session/model/context,
frozen source/target versions, one request, no ordinary tools, complete validation,
retained failures, safe diagnostics, cancellation, unchanged deadlines and no
second repair. Both transports/profiles and corrected comment-preview inputs are
covered. A well-shaped false positive still requires semantic evaluation: repeat
seeded-defect and clean-control live cases with separate first-pass/recovered
completion, false positives, location/test accuracy, latency and request counts.
Passing fixtures does not certify improved real-model reliability.

Initial-location regressions pass unchanged candidates to the verifier in both
profiles/transports with explicit pendingLocations and no extra request. Missing
evidence, coverage gaps and malformed existing locations still fail. Unresolved
candidates use NEEDS_INFO and are excluded from comment planning.

Absent final-location regressions retain the same verifier session, raw failed
response and immutable original fields while accepting exactly one locations
amendment. Tests cover final findings, mixed local normalization, altered IDs
or evidence, duplicate/extra IDs, invalid line ranges, shared retry limits, denied
tools, isolated prompts, cancellation and abort uncertainty. Missing other evidence,
coverage gaps, empty existing locations and stale/unknown heads remain failures.

Missing-merge regressions require explicit expected IDs, complete missing-ID
diagnostics and one same-context amendment into already confirmed representatives.
Exercise native/text output in both profiles, multi-ID merges, invalid/extra IDs,
cycles, changed evidence/status/report, decline, exhausted budgets, source/target
changes, missing source/location, denied tools, isolated instructions and cancellation.
A diagnostic eligibility placeholder must never become an accepted decision.

Rendered-report tests preserve full localized evidence and reasons without a
duplicate report body. Incomplete drafts retain only valid initial candidates,
label them unconfirmed and never populate the completed cache or comment plans.
Verify noReply display, separate draft.md diagnostics and original-language data.

Amendment text tests recognize only the pinned missing-native error, then require
one complete JSON object and the original validators. Duplicate/escaped keys,
ambiguous or truncated text, pending tools, ordinary tool attempts, denied extra
requests, wrong sessions, general errors, cancellation and invalid native calls
cannot use the compatibility path. Accepted transport changes are disclosed;
no new request or model is started. This is not provider reliability evidence.

Prompt-isolation regressions check that ordinary review sessions never receive
one-field amendment instructions, while granted repairs replace only the known
reviewer prompt and retain unrelated system context. They model the pinned host's
system-transform-before-params order and retained array reference. Missing or
ambiguous prompt replacement prevents repair inference. A status-only initial
submission reports the missing full-review fields and is never repaired.

Transport regressions require only the selected native/text submission policy
in each compiled role. The verifier schema uses scalar string currentHead/currentBase fields;
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

## JSON text compatibility

For explicit JSON text compatibility, exercise the actual host with a local
provider that returns complete review JSON as text after MCP source calls.
Verify no StructuredOutput schema/call appears, native execution is still
blocked, all three stages validate, and source versions/dispositions are retained.
Then compare real native/text runs at fixed models, PR versions and budgets.
Distinguish malformed native submissions from transport-independent missing
evidence; one passing text run does not prove the provider's root cause is fixed.
Regressions reject duplicate top-level/nested/escaped keys in raw and fenced
text, while preserving repeated keys across separate objects and literal source
strings. Syntactically complete objects with truncated/filtered/error/cancelled
finishes fail before recovery. Status-only responses in either transport cannot
complete initials/finals, consume an evidence-filling retry or enable comments.

## What remains unverified

Offline tests do not prove real OpenCode CLI/TUI compatibility, provider routing,
Azure MCP capabilities, child-session navigation, cancellation propagation, or
actual billing. A recorded live acceptance sample applies only to its tested
host, settings and PR; it does not certify other configurations or a success rate.

## Environment acceptance

1. Confirm `opencode --version` is **1.18.31**, and record normal Plan/Build model and tool behavior. Other host versions require a new compatibility audit. Do not share credential-bearing debug configuration.
2. Confirm ordinary chat does not create private review sessions. Existing agents should still edit files and use their original tools and subagents.
3. Leave the `models.deep` roles empty initially. Deep mode must refuse to start. Run `/pr-check` against a small known PR and verify `models.review.risk` routing, complete cumulative changes, pagination, and exact-commit source access.
4. Run normal review without a preceding check. Inspect actual session/model IDs for exactly two independent initials followed by the separately configured verifier. The parent development conversation must not be copied into them.
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
formatting, empty-string/null unknown fields or exact duplicate V rows changed;
all required values stayed
identical and no extra session was started. A recovered formatting defect still
counts as a model output defect; report it separately from unmodified successes.

If opting into `outputRetries: 1`, verify a qualifying failure's original FAILED
record and `retryOf` attempt. A status amendment uses a new session and only
`status`; a location amendment uses the original session and only the requested
`locations`; a missing-merge amendment uses the original session and only requested
`dispositions` with MERGED targets already confirmed. Confirm all original field values remain unchanged, no ordinary tool executes during repair,
and a second model request is refused. Confirm cancellation still wins and
the overall deadline does not restart. Count original contract failures and
recovered outcomes separately; repeated synthetic successes are a smoke test,
not a guarantee for other models or repositories.

When output-transport=json-text appears, retain the original missing-native error
and verify the complete text amendment and final envelope. Do not count it as an
unmodified native success. When pending-locations appears, inspect every affected
ID's final disposition and independently check confirmed source anchors.

For CLI automation, set the process cwd and PWD consistently and pass an absolute
`opencode run --dir /path/to/review-workspace`. Verify the host-reported directory
and resolved configuration before comparing runs. The pinned CLI prefers PWD
when --dir is omitted; subprocess cwd alone can leave a different host workspace.
Do not load development guidance or private answer keys into the review context.

Compare the optimized prompts against fixed-source defect, guarded/equivalent,
clean and repair-control cases with an external answer key. Check base/head
direction in both findings and excluded changes. Count failed-capability queries
repeated across stages, full coverage, missed defects, false positives and amended
versus first-pass success separately. Record per-attempt timing/output size before
claiming less latency; concise reports must not discard findings or evidence.
Official MCP defects and model compliance remain outside deterministic guarantees.

Readiness-policy regressions check that both normal/deep check agents retain
read-only, literal-context, untrusted-data and complete-source requirements while
excluding finding-review instructions. Native/text transport, model bindings,
steps, permissions, standalone check and both initial reviewers remain intact.
Policy assertions about paging, ancestry and before/after branch reads verify
instructions, not actual model compliance. The runtime does not interpret MCP
results to prove those claims. Live evaluation must compare notes to raw calls.
Input/instruction sizes and remaining-budget diagnostics are checked for both
successful and invalid check results; they must not change requests or deadlines.

Compare the three-session path with recorded four-session runs at the same
models, PR and budgets where possible. Record duplicated discovery, MCP errors
(including recovered ones), gaps, identity/version disagreements, changed-path
differences, final source/target changes, verifier budget and elapsed time.
Include an independently moved target branch: target-only changes must not
become invented source regressions. Disclose possible PR metadata lag.

Keep seeded defects, guarded changes, clean controls and independent source
checks. A quicker unsupported COMPLETE is not an optimization success. Diagnose
status-only output separately from access failure; removing check cannot make
an absent review valid. Standalone NOT_READY diagnoses its stricter requirements
and is not a prerequisite for direct review.

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
