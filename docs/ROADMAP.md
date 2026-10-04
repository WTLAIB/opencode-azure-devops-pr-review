# Roadmap and validation gates

This is an evidence-driven backlog, not permission to execute every item.
Quality comes first. Keep the current functional/risk split until representative
evaluation supports changing it. Dates, accounts, local paths, and individual
run results belong in the ignored `.local/HANDOVER.md`, not this public backlog.

## Current baseline

The V1 repository targets OpenCode 1.18.31 and remains separate from the V2
repository. Applicable V2 output-delivery and stability work is backported through
V1 APIs; V2's domain APIs and package loader are not installed into V1.

- Two independent initial reviews and one verifier in normal/deep modes. Literal
  context, independent source reads, generic host-owned MCP and model selection
  remain. No extra review stages, fallback models, iteration or character caps.
- Tolerant initial/final delivery: local JSON punctuation recovery, known field
  normalization, preserved extra content and prose, explicit incomplete evidence,
  unique bookkeeping IDs and missing final decisions as UNREVIEWED. No model calls
  for review-format repair or final resubmission.
- Report status and publication eligibility are separate. COMPLETE describes the
  verifier's structured result; initial gaps still disable comments. PARTIAL and
  STALE output remains visible. Publication keeps complete evidence/ID/version
  checks, explicit saved preview and one authorized publishing attempt.
- Native StructuredOutput remains the V1 default; explicit text mode is supported.
  Review capture schemas accept partial content. The exact completed V1
  missing-native error can retain existing text, while provider failures and
  interrupted output stay failed. Raw output and corrections remain auditable.
- Cancellable host model/MCP readiness precedes private sessions. Native execution,
  role/model/session identity, exact prompt input, private auxiliary/compaction,
  cancellation and display guards remain. V1 retry events are observations, not
  the V2 retry-decision hook; full V2 restart/request-kind parity is not claimed.
- outputRetries now applies only to the optional standalone source-check status
  amendment. Source-check/comment contracts, private diagnostics, tool-error and
  truncation counters, full saved evidence and settings migration remain.
- Installer behavior stays V1-specific: source-only 24-file package, nested helpers
  and a top-level loader. Disposable fresh/replacement tests preserve settings and
  historical data. No personal V2 installation is changed by a V1 source commit.
- CI includes an isolated actual OpenCode 1.18.31 fixture with a local fake provider
  and MCP, native/text output, partial reports, forced-shell protection with a
  positive control and cancellation. The fixture supplements mock regressions;
  it does not certify a real provider, official ADO MCP or content quality.

Earlier V1 work used strict delivery and opt-in location/merge/final amendments.
Those policies are superseded for review delivery; prior private failures and
measurements remain historical evidence, not retroactive successes. Older accepted
policy work includes exact-source guidance, honest MCP limitations, bounded reads
of same-session host-saved output, severity/scope checks and concise final prose.
These instructions do not independently guarantee model compliance.

The earlier single-PR V1 acceptance established only its recorded execution case.
Factual/presentation quality remained PARTIAL, including unsupported permanence/
recovery claims, incorrect ordering claims for equivalent timezone representations
and repeated summary content. The V2 samples and this backport's local fixtures
cannot close those V1 live-quality limitations. No new live V1 review is implied
by a passing offline or deterministic-host suite.

## Deferred validation tasks

- [ ] Broaden PR cases after the current fixed-PR smoke scope: clean changes,
  guard-refuted candidates, changed cross-file contracts, and contrasting impact
  or recovery scope. Keep independent ground truth outside reviewer inputs.
- [ ] Compare alternative models in a separately authorized evaluation. Freeze
  the PRs, prompts and budgets for each comparison; record first-pass completion,
  factual quality, false positives/misses, justified severity and recovery use.
  Model selection, costs and live-run budgets require their own agreed scope.

These are later tasks, not additional calls or environment changes authorized by
the current implementation's fixed-PR validation.

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
  or missing review envelopes. The workflow adds no shared-source adapter or
  maintained server fork; unavailable capabilities remain explicit limitations.
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
