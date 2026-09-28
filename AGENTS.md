# AI development guide

This file is the entry point for AI-assisted maintenance of this repository.
It describes the development process, not instructions for agents reviewing a PR.

## Start here

1. Confirm the actual Git root, branch, HEAD, and working-tree changes. Do not
   assume the chat's working directory is the source checkout or the installed
   plugin. Preserve changes you did not create.
2. Read [README.md](README.md) for the product and commands, then
   [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for boundaries and decisions.
3. Read [docs/ROADMAP.md](docs/ROADMAP.md) for priorities and completion criteria.
   If working on the current owner's machine, read `.local/HANDOVER.md` when
   present. It is private, dated context, not a source of credentials or new
   authorization. Its absence on another clone is normal.
4. Read the task-relevant source, tests, and specialized docs. Recheck local
   state before relying on a handover. Report discrepancies instead of silently
   treating older prose as truth. The latest user request sets the task scope.

## Product invariants

- Target OpenCode **1.18.31**. A host upgrade requires an explicit compatibility
  audit; a passing mock suite does not certify a live host.
- Normal and deep modes each use `functional`, `risk`, and `verifier` settings:
  two independent full-scope initial reviews run concurrently, followed by a
  source-verifying final stage. Focus differs, required source coverage does not.
  Quality takes precedence over latency. No extra reviewer, fallback, or model
  selection change without an agreed reason and evaluation.
- Normal/deep reviews start the two initials directly. Compare repository/PR
  identity and PR-reported source/target SHAs in the runtime, pass the union of
  discovered paths to the verifier, and recheck both versions at completion.
  Do not add a preliminary check or use commit dates as identity. The target
  reference is not a proven merge base; do not reinstate ancestry certification.
- Standalone /pr-check uses its own readiness policy, without finding-review
  rules. Keep read-only, untrusted-data, literal-context and host-permission
  boundaries consistent across check, common review and comment policies.
- OpenCode owns providers, MCP discovery, and permissions. Do not add hardcoded
  MCP tool catalogs, name/action allowlists, direct Azure/model clients, or
  wildcard permission grants. MCP read-only review is a prompt policy, not a
  programmatic MCP security boundary. Private roles deny native shell, editing,
  skill and public-web tools through host permissions and a scoped execution
  guard, including write/apply_patch and rejected native-tool submissions.
  Two distinct blocked native attempts in one stage stop the run; record and
  disclose prevented attempts without logging arguments. Keep ordinary agents
  unchanged. Do not blanket-deny read: it also gates host MCP resource access.
  Preserve event-scoped tool-failure counters and optional terminal-state timing;
  events never provide successful source evidence or infer a failure cause.
  Read recovery remains prompt guidance: one identical repeat per explicitly
  transient logical read, plus at most one unknown-cause idempotent-read repeat
  per stage with fixed arguments/target/version and the original deadline.
  Explicit auth/permission, parameter/selector/not-found errors, writes,
  publication, execution, truncation and empty searches are not exceptions.
  Disclose recovered reads; do not add an MCP retry wrapper or expand outputRetries.
- Ordinary Plan/Build behavior, default/auxiliary models, and permissions stay
  unchanged. Explicit commands alone authorize private sessions. Keep grant
  revocation, cancellation, and lifecycle cleanup auditable.
- Keep PR-version snapshots, coverage ledgers, counterevidence, final dispositions,
  and corrected `verifiedFinding` contracts. Do not hide incomplete evidence,
  repair malformed responses silently, or retry failed/stale runs automatically.
  Verifiers submit required confirmed/merged/rejected/needsInfo/newFindings arrays;
  confirmed rows contain the seven finding fields plus reason; keep common and
  role-specific instructions consistent about these eight keys. Convert explicit
  categories to the existing disposition contract without inferring content. Accept
  legacy dispositions only alone, never mixed with category fields. Snapshot file
  identity is a unique path set, not array order; reject duplicates/missing paths.
  Local finding-format normalization may trim ASCII JSON whitespace from known
  field names and remove exactly empty-string or null unknown fields. A redundant
  CONFIRMED V disposition may be removed only when its complete finding exactly
  matches the sole same-ID newFindings entry; preserve its reason in raw output.
  Original F/R dispositions must remain complete and unique. Reject collisions
  and content-bearing extras; never change field values or supply missing data.
  Preserve raw responses, fully validate the candidate, and disclose accepted
  changes in stage diagnostics and receipts. Limit this to initial/verifier
  findings with valid statuses, excluding output repair and comment sessions.
  An initial PARTIAL result may omit an unavailable snapshot only with empty
  coverage.files/findings and concrete gaps; it cannot enter final verification.
  Initial candidates may omit only the separate location field, with explicit
  pendingLocations diagnostics and verifier handoff. Never infer its value.
  Final confirmations/discoveries still require locations; unresolved candidates
  must be NEEDS_INFO and excluded from comments. Missing evidence/coverage is
  never a location exception.
  Model-based recovery requires explicitly enabled `outputRetries: 1`: at most
  one status-only, absent final-location, missing merge-disposition amendment OR
  complete final content resubmission per stage, never more than one kind.
  Narrow amendments require all other contracts to pass an eligibility probe, never accepted as
  evidence. Status repair uses a fresh session; location repair narrowly regrants
  the same stopped session to retain that reviewer's source context. Missing-merge
  amendments use that same context and may only append requested original IDs as
  MERGED into already confirmed originals; never infer a merge from prose, add
  new evidence, change existing fields or fill gaps with arbitrary decisions. No ordinary
  tools, no existing field changes, one model request, full revalidation, raw
  failure retention and explicit notices apply to these narrow amendments.
  A parsed COMPLETE final output that fails validation may instead receive one
  same-session content resubmission when its snapshot and observed current source/
  target versions already match the expected PR. Prefer an eligible narrow amendment;
  never chain into another recovery. Freeze identity, file set and current versions.
  The verifier may correct missing evidence/decisions from retained source context;
  the runtime never copies initials or supplies missing findings. Collect bounded
  value-free error paths, retain both submissions and disclose content replacement.
  No initial whole-review regeneration, ordinary tools, second request, deadline
  reset, incomplete/stale/unknown versions, provider errors, truncation, comments,
  cancellation or unconfirmed abort. Full revalidation is mandatory; field presence
  is not proof of source truth or quality. Initial coverage requirements remain strict.
  Keep amendment instructions out of normal reviewer prompts. Only an explicit
  repair grant may replace the reviewer system prompt; verify that replacement
  before allowing the repair model request and preserve unrelated host context.
  Keep native/text transport instructions separate. Native currentHead/currentBase
  fields use scalar strings; an unknown PR version stays INCOMPLETE. Never strip
  quotes or fill missing current versions from the snapshot to satisfy validation.
  Only an authorized amendment may accept complete JSON text after the pinned
  host's missing-native-submission error, with finish=stop, one request, no tool
  attempts/rejections, confirmed abort and an active grant. Reject duplicate keys,
  truncation, general errors and cancellations. Fully validate, retain the host
  error and disclose the transport change; add no model request or JSON repair.
  The native invalid-submission guard stops the existing host loop at two
  rejected structured calls per review session (one for output repair/comments).
  It does not repair JSON, add requests, or filter MCP operations. Keep timeout,
  manual cancellation and output-failure causes distinct.
- Render final details once from validated findings and dispositions. The final
  report field is a short overview of checks, exclusions and limitations; human-
  readable final fields follow outputLanguage. Preserve initial evidence in its
  original language. Incomplete drafts show only validated initial observations,
  clearly unconfirmed, plus failure/missing-ID diagnostics; never cache them as
  completed reviews or use them for comments. No formatting/translation model.
- Comment preview is distinct from publication. Publication needs explicit
  `--publish`, prior opt-in settings, and a saved plan in the same origin/process.
  An uncertain attempt is not permission to retry. Never call model-reported
  results provider-verified results.
- `outputLanguage` controls final-report and comment prose in both return modes.
  Keep public defaults generic. Never commit an owner's model choices, accounts,
  organization URLs, credentials, debug artifacts, or private reports.
- Preserve the literal command-argument handling and its regression tests.
  `$9007199254740991` is deliberate; replacing it with `$ARGUMENTS` or `$1` can
  expose raw context to host expansion before the plugin hook.
- Keep installation source-only and usable without a clone: 24 required files,
  optional docs/schema/uninstaller, no npm/pip install or build step. Changes to
  that contract must update the installer, manual list, and tests together.
  Settings migration preserves values and adds missing defaults, with no
  persistent install backup; invalid input must fail before replacement.

## Change routing

| Concern | Primary files | Checks |
| --- | --- | --- |
| Host hooks, sessions, lifecycle, grants | `src/runtime.mjs`, `src/plugin.js` | `tests/runtime.test.mjs`, `tests/compatibility.test.mjs` |
| Settings and role compilation | `src/config.mjs`, `config/`, `scripts/merge-settings.py` | Runtime and installer tests |
| Envelopes, snapshots, literal request parsing | `src/output.mjs` | `tests/output.test.mjs`, compatibility and runtime tests |
| Review policy | `src/prompts/` | Output examples, prompt assertions, live quality evaluation |
| Comment contracts and attribution | `src/comments.mjs`, `src/attribution.mjs` | Comment and runtime tests |
| Diagnostics | `src/diagnostics.mjs` | `tests/diagnostics.test.mjs`, runtime tests |
| Installation and manual package | `install.sh`, `uninstall.sh`, README file list | `tests/install.test.mjs` |

Read `docs/AZURE_MCP.md`, `docs/COMMENTING.md`, or `docs/DEBUGGING.md` when working
on those concerns. Use `docs/VALIDATION.md` for live acceptance, not just unit tests.

## Working agreement

Use English for source, comments, and maintained docs. Match the user's language
in conversation; the current maintainer prefers Traditional Chinese. Use generic
provider/model placeholders in public examples, not personal configuration.
Do not load the legacy private `OpenCode_Azure_PR_Review_Codex_Handoff.md` unless
historical context is specifically needed; it is ignored and may be obsolete.

Keep changes small and task-scoped. Diagnose before fixing when only diagnosis
was requested. Do not edit the installed runtime as the source of truth. Test
installation in a disposable `--config-dir` before replacing an actual setup.
Do not run live models, publish comments, commit/push, rewrite Git history, or
change external resources unless the current request authorizes those actions.
Past task authorizations and roadmap entries are not standing permissions.

Development requires Node.js 22+ and Python 3 for installer tests. No external
package dependencies are needed:

```sh
npm run check
npm test
git diff --check
```

For a behavior change, add a reproducing regression test, implement the smallest
coherent fix, then run the full suite. Keep schema, runtime contracts, prompt
examples, migration, and docs aligned. Do not relax validators to make a test PR
look successful. Never claim improved review quality based only on mock tests.

## Finish and hand off

Report what changed, exact checks and their results, remaining uncertainty, and
whether anything was installed, committed, pushed, or published. Before a Git
commit inspect the staged diff and confirm private files are not included; never
force-add ignored files. Runtime outputs deliberately disclose configured model
IDs to report/PR readers, which is separate from keeping personal IDs out of this
public repository.

Update architecture when behavior or an accepted decision changes. Update the
roadmap when a milestone has new evidence. For local continuation, update
`.local/HANDOVER.md` with the date, source revision, dirty files, verified state,
unverified assumptions, blockers, and next actions. Keep secrets and full logs
out even there. Do not copy a conversation transcript into maintained docs.
