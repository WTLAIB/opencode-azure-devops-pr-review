# Roadmap and validation gates

This is an evidence-driven backlog, not permission to execute every item.
Quality comes first. Keep the current functional/risk split until representative
evaluation supports changing it. Dates, accounts, local paths, and individual
run results belong in the ignored `.local/HANDOVER.md`, not this public backlog.

## Current baseline

Implemented and covered by offline tests:

- Opt-in normal/deep orchestration with two concurrent independent initial
  sessions and one final verifier; mode-specific three-role configuration.
- Strict source snapshots, complete coverage ledgers, counterevidence, corrected
  verified findings, complete dispositions, and stale-head handling.
- Native structured output plus explicit text compatibility; each role receives
  only its selected submission policy. The verifier's head uses a scalar string
  schema while unknown/stale-head validation remains strict. Receipt/full
  presentation, opt-in diagnostics, final/comment language, model attribution.
- Audited local finding-key whitespace/empty-extension normalization, exact
  finding-key validation and field-path errors, without extra model requests or
  altered evidence values. Collisions, missing evidence and meaningful extras
  remain failures. Native/text regressions cover both profiles and retain the
  raw responses; improved live repeatability still needs user-run evaluation.
- Opt-in, one status OR absent-location amendment per review stage, sharing one
  allowance, with immutable original values,
  bounded model requests, ordinary-tool denial and retained failure diagnostics.
  Amendment instructions are isolated to granted repair sessions; normal
  reviewers receive only the full-review contract. Location amendments retain
  that reviewer's existing session context; unavailable source cannot be guessed.
  Live reliability gains remain unverified.
- A per-session stop at two native structured-submission rejections (one for
  output repair/comments), with retained counts and explicit whole-run TIMED_OUT
  versus manual CANCELLED diagnostics. Host/provider acceptance remains pending.
- Saved inline-comment previews and explicit, uncertainty-aware publication.
- Shared lifecycle/cancellation handling, private-role grants, literal context,
  direct settings conversion, and the 24-file minimal installer.
- Source-access identity hints and observed-call handoff, prompt guidance against
  deterministic lookup loops/unrelated discovery, exact-source line recounting,
  and receipt guidance that does not resume completed reviewers. Offline routing
  and policy checks are not proof of improved live MCP error rates or report quality.
- Compact initial reports without duplicate finding prose, explicit base/head
  direction checks including excluded changes, and failed-capability handoff
  by cause/version semantics. No official MCP or OpenCode host patch is included.
  Diagnostics add per-attempt timing, model-request and output-size observations.

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
- [ ] `/pr-check` establishes the complete cumulative snapshot and exact-commit
  source access; failures give concrete missing capabilities.
- [ ] Normal review starts both initial sessions independently, validates full
  coverage, and invokes the verifier even if no initial findings exist.
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
- Consider a three-session variant: concurrent functional/risk reviews followed
  by the verifier, with `/pr-check` retained as a standalone diagnostic. Each
  initial would establish its own fixed cumulative snapshot; repository/PR,
  base/head, scope and the complete changed-file set must agree before verification.
  Reject disagreements and partial coverage rather than silently reconciling
  snapshots. Compare latency, duplicated discovery, mid-run PR changes and the
  cost of discovering access failures late against the current shared check.
  This is a future design/evaluation candidate, not an implemented mode or
  authorization to remove the existing source-check stage.
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
