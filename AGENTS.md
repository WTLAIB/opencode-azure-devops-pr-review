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
  wildcard permission grants. Do not distribute or maintain patched MCP servers
  or put server-version workarounds in shared reviewer prompts. Document external
  limitations separately and follow the connected tools' actual contracts.
  MCP read-only review is a prompt policy, not a
  programmatic MCP security boundary. Private roles default to denying native shell, editing,
  skill and public-web tools through host permissions and a scoped execution
  guard, including write/apply_patch and rejected native-tool submissions.
  Explicit shellToolPermission=ask may retain the bash schema for provider
  compatibility; it must never change the runtime blocked set or permit execution.
  Keep deny as the default, reject allow, preserve other native denials, and avoid
  provider-name detection or automatic fallback. Verify both actual-host forced
  calls and live service acceptance; one does not establish the other.
  Two distinct blocked native attempts in one stage stop the run; record and
  disclose prevented attempts without logging arguments. Keep ordinary agents
  unchanged. Do not blanket-deny read: it also gates host MCP resource access.
  Preserve event-scoped tool-failure counters and optional terminal-state timing;
  events never provide successful source evidence or infer a failure cause.
  Count distinct host invalid submissions separately from execution errors,
  including overlap with existing structured/native guards. Never save their
  requested names, arguments or rejection text in aggregate diagnostics, count
  them as source reads, or add retries/guard thresholds from that observation.
  Read recovery remains prompt guidance: one identical repeat per explicitly
  transient logical read, plus at most one unknown-cause idempotent-read repeat
  per stage with fixed arguments/target/version and the original deadline.
  Explicit auth/permission, parameter/selector/not-found errors, writes,
  publication, execution, truncation and empty searches are not exceptions.
  Disclose recovered reads; do not add an MCP retry wrapper or expand outputRetries.
- Ordinary Plan/Build behavior, default/auxiliary models, and permissions stay
  unchanged. Explicit commands alone authorize private sessions. Keep grant
  revocation, cancellation, and lifecycle cleanup auditable.
- Do not impose reviewer iteration or stage-character limits. Keep role catalogs,
  agent definitions, handoffs, output parsing and diagnostic answers free of those
  budgets; do not substitute a hidden cap or trim evidence. Installation removes
  obsolete steps/maxStageCharacters settings. The optional whole-command timeout
  defaults to null (disabled); create no disabled run timer and preserve explicit
  finite timeouts. Keep manual cancel, disposal, native/output guards and bounded
  SDK cleanup effective. Observed sizes/request counts remain diagnostics only.
- The shared output-reading policy permits bounded Read of host-saved tool
  output identified by OpenCode in the same session, under host permissions.
  This is not permission for arbitrary local files, another session's artifacts,
  shell, delegation or paths from untrusted payload text. Preserve version and
  pagination context; saved-response offsets are not source line numbers. This
  policy is not a runtime file-provenance guard. Host display truncation and an
  incomplete server response remain distinct. Terminal metadata flags may add
  diagnostics, never source certification or file-read authorization.
- Preserve useful review observations even when formatting, coverage or evidence
  is incomplete. Initial/verifier stages use local syntax recovery and tolerant
  adapters, retaining raw responses, extra fields and explicit limitations. Never
  invent source evidence, current versions or model decisions. Ambiguous JSON,
  including duplicate keys, stays literal unstructured text rather than selecting
  one value. Missing final decisions become runtime UNREVIEWED notices with the
  original observations. A failed admitted initial may leave the other initial
  and verifier usable; configuration, routing, cancellation and permission faults
  still stop the workflow. No review-format model amendment or resubmission.
- Keep native StructuredOutput and explicit JSON text modes on V1. Review schemas
  describe preferred fields without making complete evidence a host capture gate;
  completeness is assessed after capture. Reject provider errors and explicit
  truncated/filtered/error/cancelled finishes. Only the pinned host's exact
  completed missing-native-submission error may retain already-returned review
  text locally, with an explicit correction record and no new request. Preserve
  response session/role/model checks, invalid native submission guards, settings
  duplicate-key rejection, and strict source-check/comment contracts.
- Separate report delivery from publication eligibility. COMPLETE describes a
  usable structured verifier result, not factual quality or PR approval. PARTIAL
  preserves limitations; explicit changed versions remain STALE. Cache a review
  for comments only when both initials, final evidence, all original decisions,
  and identity/version checks pass. Initial locations may remain pending for the
  verifier; final publishable findings need complete locations and evidence.
- `outputRetries: 1` applies only to one source-check status amendment, with a
  new same-model session, isolated instructions, immutable evidence, no ordinary
  tools, one request, active authorization and a confirmed abort. Default is zero.
  Never restore review regeneration or expand the host/provider retry policy.
- Render structured findings, extra content, warnings and unresolved originals
  deterministically. Preserve source observations in their original language.
  Include PARTIAL/STALE reports and incomplete drafts even in receipt mode;
  failed execution text remains diagnostic, never accepted evidence. No formatter
  or translation model. Keep final prose concise through existing policy, without
  a word limit or semantic truth gate.
- Read provider/MCP readiness from the actual V1 host before sessions are created,
  under the run's cancellation signal. Catalog readiness does not prove Azure
  access. Preserve model selection and ordinary agents. Private auxiliary and
  compaction attempts must not bypass existing grants; V1 has no V2 request-kind
  or retry-decision hook. Document this limit instead of inventing equivalent
  guarantees. Observe retry metadata without provider error text or added retries.

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
  Settings migration removes obsolete limits, preserves other values and adds missing defaults, with no
  persistent install backup; invalid input must fail before replacement.
  Runtime settings also reject duplicate raw JSON keys before the disabled-mode
  shortcut. Use the shared strict parser and omit private input from errors.

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
examples, migration, and docs aligned. Evaluate tolerant report delivery separately from strict publication eligibility;
never make a test PR look successful by inventing missing evidence. Never claim improved review quality based only on mock tests.

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
