# Roadmap and validation gates

This is an evidence-driven backlog, not permission to execute every item.
Quality comes first. Keep the current functional/risk split until representative
evaluation supports changing it. Dates, accounts, local paths, and individual
run results belong in the ignored `.local/HANDOVER.md`, not this public backlog.

## Current baseline

Implemented and covered by offline tests:

- Explicit native/text transport evaluation for incomplete submissions, with
  status-only initial/final diagnostics. Text parsing rejects duplicate keys
  instead of replacing evidence; explicit truncated/filtered/error/cancelled
  finishes cannot enter validation or recovery. Models, evidence requirements
  and retry budgets stay unchanged; no automatic transport fallback is added.
  One controlled live text-mode review on OpenCode 1.18.33 completed after two
  native-mode failures with missing review content. It confirmed all three seeded
  defects without output recovery; two MCP read failures were resolved and
  disclosed. This is one acceptance sample, not a measured reliability increase.

- Private-role native shell/edit/skill/public-web denial with a scoped guard,
  bounded repeated-attempt stop and receipt disclosure. MCP actions remain
  host/server-controlled, without a catalog or read/write classifier.
- Explicit `shellToolPermission: "ask"` compatibility for providers that require
  a visible shell schema, with `deny` remaining the default. The runtime guard,
  repeated-attempt stop and other native denials remain unchanged. Settings and
  migration regressions cover both values; no provider-specific fallback exists.
  A controlled OpenCode 1.18.33 experiment accepted live requests with ask and
  blocked five injected shell calls. That native-mode live review failed an initial
  envelope check; shell compatibility alone does not establish review completeness.
- Unambiguous seven-field findings/eight-field confirmed rows; bounded
  unknown-cause read-retry guidance, distinct from output recovery. No automatic
  MCP retries or installed server patch. Terminal tool events supplement missing
  after-hook diagnostics without providing source evidence.
- Reachable reproductions, static-versus-observed test wording, path-bounded
  counterevidence, exact quotes and impact-based severity guidance. Known verifier
  source/contract reads are grouped in the first read round where possible.
  These changes still need representative live quality and latency evaluation.

- Verifier submissions use fixed confirmed/merged/rejected/needs-info/new-finding
  arrays, adapted to the unchanged final evidence/disposition contract. Unique
  snapshot path sets compare independently of ordering. Both transports and
  profiles retain strict evidence, ID accounting and stale-version checks.
- Parsed COMPLETE final output failures with a matching known version frame may
  receive one same-session content resubmission, sharing the existing amendment
  budget. Frozen identity/versions, no ordinary tools, one model request, confirmed
  abort, original deadline, full revalidation and retained failure diagnostics apply.
  This is explicit model-authored recovery; initial status-only envelopes still
  cannot regenerate a review. Live completion and semantic quality gains remain
  unverified, including harmless-change false positives and source/test accuracy.

- Opt-in normal/deep orchestration with two concurrent independent initial
  sessions and one final verifier; mode-specific three-role configuration.
- PR-version snapshots, complete coverage ledgers, counterevidence, corrected
  verified findings, complete dispositions, and stale source/target handling.
- Native structured output plus explicit text compatibility; each role receives
  only its selected submission policy. The verifier's source/target versions use
  scalar strings while unknown/stale-version validation remains strict. Receipt/full
  presentation, opt-in diagnostics, final/comment language, model attribution.
- Audited local finding-key whitespace/empty-string-or-null extension normalization, exact
  finding-key validation and field-path errors, without extra model requests or
  altered evidence values. Collisions, missing evidence and meaningful extras
  remain failures. Native/text regressions cover both profiles and retain the
  raw responses; improved live repeatability still needs user-run evaluation.
- Exact duplicate V-disposition normalization with raw reasons retained and
  original F/R accounting unchanged. Initial candidates may omit location with
  an explicit pending-ID handoff; final confirmations still require all fields.
  Scoped native amendments can accept complete, unambiguous JSON text after the
  pinned missing-submission error, with notices and no additional request.
  Live improvement remains unverified; offline recovery is not a completed run.
- Narrow status, absent final-location OR missing merged-disposition amendments share the same
  allowance with final content resubmission. Narrow amendments keep immutable original values,
  bounded model requests, ordinary-tool denial and retained failure diagnostics.
  Amendment instructions are isolated to granted repair sessions; normal
  reviewers receive only the full-review contract. Location amendments retain
  that reviewer's existing session context; unavailable source cannot be guessed.
  Missing-row recovery appends only model-authored merges into existing confirmed
  originals; all other gates must pass and no evidence or existing decision changes.
  Live reliability gains remain unverified.
- A per-session stop at two native structured-submission rejections (one for
  output repair/comments), with retained counts and explicit whole-run TIMED_OUT
  versus manual CANCELLED diagnostics. Host/provider acceptance remains pending.
- Saved inline-comment previews and explicit, uncertainty-aware publication.
- Shared lifecycle/cancellation handling, private-role grants, literal context,
  direct settings conversion, and the 24-file minimal installer.
- Source-access identity hints and independent initial discovery, guidance against
  deterministic lookup loops/unrelated discovery, exact-source line recounting,
  and receipt guidance that does not resume completed reviewers. Offline routing
  and policy checks are not proof of improved live MCP error rates or report quality.
- Compact initial reports without duplicate finding prose, explicit base/head
  direction checks including excluded changes, and failed-call guidance
  by cause/version semantics. No official MCP or OpenCode host patch is included.
  Diagnostics add per-attempt timing, model-request and output-size observations.
- A self-contained readiness policy avoids loading full finding-review rules in
  standalone check. Its short decision path and report preserve cumulative versions,
  full changes/source and failure statuses. Content/directory selector guidance,
  batched independent reads and concise final prose target unnecessary work;
  the runtime still supplies the complete attribution/disposition tables.
  Diagnostics add input/instruction sizes and remaining whole-run time per attempt.
  Live latency, model compliance and error-rate improvement remain unverified.

Single-source report rendering now uses localized final structured findings and
disposition reasons, with a short verifier overview instead of a duplicate full
Markdown report. Missing-ID diagnostics and explicit expected IDs improve feedback.
Incomplete drafts preserve unconfirmed valid initial observations, remain outside
the comment cache, and have a separate diagnostic file. Selector guidance addresses
the observed official MCP 2.10.0 directory Commit-to-Branch behavior without a
server patch or tool filter. Evaluate live error rate, first-pass completion,
latency, merge decisions and content quality; offline recovery alone proves none
of these improvements.

Report guidance now removes repeated version/coverage/finding inventories from
overview prose without length gates or lost evidence. Known supporting paths can
be read alongside changed source by the independent verifier, with final freshness
retained. Optional monotonic tool/model-window/response-processing timings and
workflow rendering/display/cleanup measurements support latency comparisons;
overlap and missing completions are explicit. Offline tests cover instrumentation
and unchanged requests; live speed/quality gains still require measurement.

The automatic check stage has been removed from normal/deep reviews. Initials
establish PR-reference snapshots independently; runtime compares identity and
versions and passes their combined paths to the verifier. Missing metadata can
be PARTIAL without placeholder SHAs. Offline routing and contract coverage do
not establish live stability, latency or finding-attribution gains.

Repeated normal-profile smoke runs on one fixed synthetic PR are recorded
privately. They completed with the expected defects but exposed variable latency,
recoverable MCP errors and inaccurate final locations. The access/presentation
changes above need further live evaluation. A subsequent initial-stage failure
exposed malformed finding keys; the local normalization and diagnostics now have
offline regression coverage. A later native submission omitted finding locations
despite successful host capture; bounded location amendments now have sanitized
regressions. Direction errors also occurred despite correctly versioned source
responses. Neither amendment success nor prompt compliance proves review quality.
Clean controls, the broader acceptance
matrix and general review-quality improvement remain unestablished.
CI is configured for Ubuntu 22.04/24.04 with Node 22;
the workflow file alone is not evidence that a particular CI run passed.

## P0: Establish one reproducible live acceptance run

Status: partial. Initial normal-profile smoke evidence has been independently
checked. Keep the tested configuration steady while collecting repeat and clean
control cases; the broader gates below remain open. Use only synthetic/disposable
PRs and approved model accounts. Individual evidence stays in the private handover.

### 1. Verify the actual environment

- [ ] Confirm OpenCode 1.18.31 and distinguish source checkout from installed files.
- [ ] Validate local settings without disclosing model IDs or credentials. Resolve
  invalid/ambiguous settings before invoking migration; do not overwrite them.
- [ ] Install the current source and restart, preserving unrelated OpenCode config.
- [ ] Verify the approved models and MCP connection. Git authentication and MCP
  authentication are separate; package installation proves neither connection.
- [ ] Confirm actual permissions with a read-only operation. Do not grant blanket
  write access to make source-check failures disappear.

### 2. Prepare a controlled PR

- [ ] Commit a passing synthetic baseline to the test repository's default branch.
- [ ] Verify remote history before push; preserve an existing README/initial commit.
- [ ] Branch from the pushed baseline, then introduce a small set of reproducible
  defects. Keep the spec and baseline tests intact. Do not merge this test PR.
- [ ] Keep expected defects and reproductions outside reviewer-visible PR content.
  Include a correct/guarded change to observe false positives, not only defects.

### 3. Record acceptance evidence

- [x] Independently check initial normal-profile smoke results against a fixed
  synthetic snapshot and private expected outcomes, including a correct control.
  This milestone alone does not establish repeatability or general review quality.
- [ ] Optional standalone `/pr-check` establishes cumulative readiness or reports
  concrete missing capabilities; its success is not a prerequisite for review.
- [ ] Normal review starts both initials directly, validates identity/versions and
  full coverage, and invokes the verifier even with no initial findings. Evaluate
  discovery differences, mid-run versions and target-only changes.
- [ ] Receipt and full modes preserve the same stage contracts. Check the actual
  final report against saved diagnostics; evaluate configured report/comment
  language and the model/method disclosure, not just status text.
- [ ] Preview produces short, correctly anchored comments from corrected eligible
  findings. No comments, votes, merges, source edits, or unrelated writes happen
  during review/preview. Inspect host history; prompt compliance is not enforcement.
- [ ] If explicitly authorized, publish to the disposable PR once and independently
  inspect Azure for anchors, bodies, attribution, and duplicates. Never use an
  uncertain attempt as a retry test on the same review.
- [ ] Exercise deep configuration refusal/routing, literal multiline context,
  stale-head behavior, cancellation, and ordinary-chat non-interference.

Definition of done: dated private evidence records source/host/MCP versions,
commit snapshot, command/profile/return mode, expected versus actual outcomes,
session/run identifiers, verified external effects, and remaining limitations.
Publish only a sanitized acceptance summary. Follow [VALIDATION.md](VALIDATION.md)
and [COMMENTING.md](COMMENTING.md) for the detailed checks. A seeded small PR is
a smoke test, not proof of quality on real projects.

## P1: Measure quality before changing review policy

Status: planned after P0; methodology proposed, not executed.

- Build an independently labeled sample of historical and synthetic PRs with
  functional failures, authorization/data risks, guarded non-bugs, conditional
  failures, scoped rules, and clean changes. Include multi-file examples beyond
  the initial sandbox. Record reachable triggers and impact, not only line labels.
- Compare the current focused full-scope pair with two general full reviews and,
  if useful, a single-review baseline. Hold the verifier, snapshot, tool access,
  models/budgets, and evaluation protocol as constant as possible; repeat runs
  to expose variance and record any unavoidable differences.
- Evaluate the implemented three-session flow against the recorded check-first
  baseline: concurrent initials, local PR/version comparison, combined paths,
  then verification. Keep models/budgets/source steady and record duplicated
  discovery, MCP/output failures, final versions and remaining verifier time.
  The accepted comparison uses PR-reported SHAs, not timestamps or independent
  ancestry proof. Test target-only changes and metadata lag explicitly.
- Compare source coverage, finding attribution and report quality before claiming
  removal improves reliability. Fewer optional queries cannot repair server bugs
  or missing review envelopes. No shared-source adapter or official MCP patch
  is included in this change.
- Match claims by root cause/trigger/impact. Report missed defects, false positives,
  duplicate rate, evidence/coverage gaps, contract failures, and comment usefulness.
  Record latency and actual usage/cost where available as secondary measurements.
- Do not put answer keys in PR descriptions, reviewer context, or shared agent
  instructions. Do not use the same verifier as the sole ground-truth judge.
- Before running the comparison, agree on acceptance thresholds and the quality
  tradeoffs allowed. Do not pick a faster policy based on one convenient example.

Definition of done: a reproducible, sanitized evaluation summary supports either
keeping the current policy or an explicitly approved change. Avoid claims of
statistical certainty from a small convenience sample.

## P2: Reliability and release work, driven by findings

Status: conditional proposals; no promised deadlines or automatic implementation.

- Turn reproduced live failures into sanitized regression fixtures. Fix only the
  demonstrated layer (host integration, contracts, settings, MCP capability, or
  model behavior); do not relax evidence requirements to mask an outage.
- Re-audit any requested OpenCode upgrade against pinned hook, session, tool,
  command-expansion, and structured-output behavior before changing the baseline.
- Recheck manual-copy installation when the operational file set changes. Keep
  public docs optional and private handovers out of distributions.
- When a release is requested, review data leakage, local changes, tests, and
  environment acceptance, then choose version/tag/release notes. Generate
  checksums only if distributing release archives; do not commit test logs.

Not currently planned: a provider SDK, Azure API wrapper, MCP name allowlist,
automatic posting/merging, per-finding agent fan-out, model fallback, a database,
or a framework split solely to reduce file size. Revisit only for a demonstrated
need and an explicitly accepted design.

## Keeping this roadmap useful

Keep proposals separate from accepted behavior in [ARCHITECTURE.md](ARCHITECTURE.md).
Check off a gate only with evidence, not because code or a package was installed.
Keep individual machine problems in the local handover. At each handoff, identify
the next actionable gate and its blocker instead of appending a chat transcript.
