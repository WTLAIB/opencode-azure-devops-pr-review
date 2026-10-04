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
| Operational integrity | Correct routing, preserved output/limitations, execution authorization, source/ID/version evidence and disclosed recovery. | Distinguish readable delivery from complete publication contracts. COMPLETE is not factual perfection or PR approval. |
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

Run from the repository root with Node.js 22 and Python 3:

```sh
npm run check
npm test
git diff --check
```

The suite uses mock V1 SDK responses and isolated installer directories, without
real models or Azure writes. Important boundaries are exercised independently:

- Two initial sessions, literal URL/context, exact role/model bindings, independent
  profiles, source checks, zero-finding verification and saved comment provenance.
- Local JSON recovery with unchanged values/raw responses, large evidence without
  iteration/character caps, literal ambiguous/prose retention, supplemental fields,
  conflicting aliases and unique bookkeeping IDs. Settings remain strict.
- PARTIAL initial handoff, unavailable/conflicting versions, missing final decisions
  as UNREVIEWED, stale source/target references, full observations in readable
  reports, and publication unavailable when any required contract is missing.
- Native/text modes, exact completed V1 missing-native fallback, broad provider-error
  rejection, truncated/unknown finishes, wrong response identity, hook admission,
  no review-format model requests and strict comment/source-check output.
- One isolated opt-in source-check status amendment, immutable evidence, no ordinary
  tools, one request, preservation of unrelated system context and failed attempts.
- Cancellable model/MCP preflight, missing/disconnected catalogs, no model fallback,
  native guards, auxiliary/compaction denial, value-free host retry observations,
  same-origin locks, timeout/disposal, uncertain abort and display-only reports.
- Comment contracts, explicit publication, saved exact plans, source-profile/model
  attribution, host-denial simulations, whole-batch uncertainty and no automatic
  retry. No test posts to Azure.
- Settings migration, missing defaults, removed legacy limits, duplicate keys,
  permission modes, preserved preferences and strict rejection before replacement.
  The real installer is tested for fresh/replacement installs, 24-file manual
  packages, missing files, rollback, symlinks, locks and archival uninstall.

Strict low-level evidence helpers remain independently tested as the publication
assessment reference. Runtime tests exercise tolerant delivery instead of the
superseded initial/final model-amendment flow. Old private failure artifacts and
Git history remain unchanged. A lower or higher test count is not a quality score.

## Isolated OpenCode 1.18.31 fixture

Use an exact V1 binary in a disposable prefix, without replacing your normal
OpenCode installation. The fixture installs this checkout only into an isolated
configuration, uses a deterministic loopback provider and a fake stdio MCP, and
keeps its generated evidence under ignored .local/. It does not read personal
provider settings, start a real hosted model or contact Azure.

```sh
node tests/host-v1-smoke.mjs /absolute/path/to/opencode-1.18.31
node tests/host-v1-smoke.mjs /absolute/path/to/opencode-1.18.31 --text --replace
```

The fixture checks actual version, loader/commands, host provider/MCP catalogs,
source check, normal/deep review, local syntax correction, incomplete native
capture, literal prose delivery, blocked shell calls, a harmless ordinary-shell
positive control and cancellation. Native default and explicit text transport
are separate processes. Replacement preserves the private fixture settings.
The host is stopped on success or failure; failed artifacts are retained locally.
CI runs the fixture on Ubuntu 22.04 with the pinned host. The offline suite also
runs on Ubuntu 24.04. Passing these checks does not certify real provider parsing,
ADO MCP behavior, TUI navigation, factual review quality or a different host build.

## What remains unverified

Mock tests do not prove actual host behavior. The isolated host fixture covers
only its explicit local cases; it does not prove real-service provider routing,
Azure MCP capabilities, child-session navigation, remote cancellation or billing. A recorded live acceptance sample applies only to its tested
host, settings and PR; it does not certify other configurations or a success rate.

## Environment acceptance

1. Confirm `opencode --version` is **1.18.31**, and record normal Plan/Build model and tool behavior. Other host versions require a new compatibility audit. Do not share credential-bearing debug configuration.
2. Confirm ordinary chat does not create private review sessions. Existing agents should still edit files and use their original tools and subagents.
3. Leave the `models.deep` roles empty initially. Deep mode must refuse to start. Run `/pr-check` against a small known PR and verify `models.review.risk` routing, complete cumulative changes, pagination, and exact-commit source access.
4. Run normal review without a preceding check. Inspect actual session/model IDs for exactly two independent initials followed by the separately configured verifier. The parent development conversation must not be copied into them.
5. Inspect the final report through child-session navigation. Completed private sessions must refuse reuse.
6. Configure all three approved `models.deep` roles only when ready. Verify exactly two initial reviews, deeper analysis instructions, routing, and finding dispositions. Partial initial observations must reach verification with explicit limitations; changed heads must not automatically rerun a review. Inspect provider usage records. Run a normal review afterward and confirm comments for the earlier deep review still use `models.deep.risk`.
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

If a run reports output-format-corrections, compare the original response with the
adapted result. Verify syntax recovery preserves values and unstructured retention
preserves literal text. Check every warning and bookkeeping ID; missing evidence
must stay missing, and no extra review-format request may appear. A recovered
format defect remains a model output defect, separate from unmodified success.

For PARTIAL outputs, verify omitted final decisions become UNREVIEWED and the
original observations remain visible. Test both a prose-only initial and a final
with evidence gaps. They should deliver useful content without enabling comments.
A failed/truncated provider execution cannot be accepted as that initial's evidence.
Changed current versions remain STALE even alongside other missing fields.

If enabling outputRetries=1, test only a qualifying standalone source-check status
failure: one fresh same-model session, one-field amendment, unchanged evidence,
no ordinary tool, no second request and no deadline reset. Review initials/finals
must never start status/location/disposition/final-content amendments.

For the exact V1 missing-native fallback, retain the original StructuredOutputError
and correction record, compare all already-returned text and verify no added
request. General errors, truncation, cancellation and mismatched identities remain
failed executions. Pending initial locations require independent final anchors;
none may be invented to enable comments.

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
permissions, standalone check and both initial reviewers remain intact.
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
