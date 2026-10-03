# OpenCode Azure DevOps PR Review

Opt-in, multi-model pull request reviews inside OpenCode. The plugin uses your existing model providers and Azure DevOps MCP connection. Each review stage runs in a separate session; normal Plan and Build sessions keep their model and tool settings.

**Status:** offline workflow and installer tests are available. Real OpenCode, provider, Azure MCP, cancellation, and TUI compatibility still require validation in your environment.

**Target host:** OpenCode **1.18.31**. Host integration changes and command-expansion regression tests are based on this version, not an unpinned development branch. This is a compatibility baseline, not a claim of a live end-to-end certification.

## Install

Requires Linux or WSL, a POSIX shell, Python 3 (standard library only, for installation-time JSON merging), and an existing OpenCode installation with working model providers and Azure DevOps MCP. Installation needs no pip packages, jq, sudo, or npm packages. Node.js is needed only for development tests. Running the installed plugin does not require Python.

CI runs the installation and offline tests on Ubuntu 22.04 and 24.04. The installer uses `/bin/sh`, standard file utilities from `coreutils`, and `grep`, normally present on Ubuntu. Git is only needed to clone the repository. No separate Node.js or Bun installation is required by this plugin's installer; your existing OpenCode and MCP setup may have their own requirements. Passing these tests does not validate live OpenCode/provider/MCP compatibility.

Close OpenCode processes that use the same configuration directory, then run:

```sh
git clone https://github.com/WTLAIB/opencode-azure-devops-pr-review.git
cd opencode-azure-devops-pr-review
sh install.sh
```

Edit the settings file printed by the installer. By default it is at `~/.config/opencode/plugins/azpr/settings.json`; `XDG_CONFIG_HOME` and `--config-dir` can change that location.

Both installation and runtime loading reject duplicate JSON keys, including
escaped-equivalent spellings and duplicates inside nested objects. Resolve the
ambiguity before restarting; the runtime never chooses the last model or setting
silently. Syntax errors are reported without copying private setting values.

1. Run `opencode models` to find the exact provider/model IDs.
2. Configure `models.review.functional`, `risk`, and `verifier`. Leave the three `models.deep` values empty until you want deep reviews. The `models._help` entries explain each role and model-selection criteria directly in the settings file.
3. Confirm your existing OpenCode MCP connection can read the PR. No tool-name mapping, prefix, or plugin allowlist is required; host permissions apply.
4. Fully restart OpenCode and try `/pr-check` on a small, known PR.

See [Azure MCP setup](docs/AZURE_MCP.md) and [validation](docs/VALIDATION.md) before enabling reviews for a team.

### Manual copying without Git

The installer needs only these **24 files**, preserving the relative paths below.
Copy raw UTF-8 text from the same revision, use LF line endings, and keep the
original extensions (not `.txt`). No Git checkout or npm installation is needed.

```text
install.sh
config/settings.example.json
scripts/merge-settings.py
commands/pr-check.md
commands/pr-review.md
commands/pr-deep.md
commands/pr-comment.md
commands/pr-stop.md
src/plugin.js
src/runtime.mjs
src/config.mjs
src/output.mjs
src/comments.mjs
src/diagnostics.mjs
src/attribution.mjs
src/prompts/common.md
src/prompts/check.md
src/prompts/functional.md
src/prompts/risk.md
src/prompts/deep.md
src/prompts/final.md
src/prompts/comment-policy.md
src/prompts/comment-plan.md
src/prompts/comment-publish.md
```

Run `sh install.sh` in that folder, or `sh install.sh --replace` to migrate an
existing installation. The installer checks all required files before replacing
anything. The Markdown files in `commands/` and `src/prompts/` are operational
instructions, not optional documentation; all are required even if you initially
use only normal reviews.

`README.md`, `docs/`, `uninstall.sh`, and `config/settings.schema.json` are optional:
they are copied if supplied, and copy failures only warn. The schema provides
editor hints, not runtime validation; omitting it can produce an editor warning
about the settings file's `$schema` reference but does not prevent reviews.
The installer generates the minimal installed `package.json` module declaration,
so the repository's `package.json` is not needed for manual installation.
Tests, CI files, Git metadata, private settings, handoff documents, and debug logs
are not part of this package.

Replacement installs only the supplied optional files; it does not retain old
copies when they are omitted. If you want the installed uninstall command later,
include `uninstall.sh` now or obtain the matching script when needed.

## Commands

| Command | Workflow |
| --- | --- |
| `/pr-check <Azure PR URL> [context]` | Check complete PR changes and fixed-commit source with `models.review.risk`. |
| `/pr-review <Azure PR URL> [context]` | Two independent initial reviewers start directly, then evidence verification. |
| `/pr-deep <Azure PR URL> [context]` | The same three-stage flow, using the deep profile and deeper analysis instructions. |
| `/pr-comment <review-id> [--publish]` | Preview concise inline feedback; explicitly publish that saved preview. |
| `/pr-stop [run-id]` | Revoke the run's grants and request cancellation of its review sessions. |

```text
/pr-check https://dev.azure.com/ORG/PROJECT/_git/REPO/pullrequest/123 This repository supports older clients. Check API compatibility and retry behavior.
/pr-review https://dev.azure.com/ORG/PROJECT/_git/REPO/pullrequest/123
/pr-deep https://dev.azure.com/ORG/PROJECT/_git/REPO/pullrequest/123 Focus on retry safety and transaction boundaries.
```

Mentioning a PR or asking for a review in ordinary chat does not activate this workflow. The normal agent can still review code using its existing capabilities.

Everything after the URL is optional, literal `userContext`: repository background,
acceptance criteria, or review priorities. No quoting is required; Unicode,
embedded quotes, and newlines are preserved. The URL plus context is limited to
16,000 characters. Each review stage receives the original context separately
from PR data and other model-authored notes. Reviewers are instructed to report any
unverified requirements; this does not guarantee perfect model compliance.

Context applies **only to that command**. `/pr-check` checks readiness, not defects;
repeat the context on a later `/pr-review` or `/pr-deep` to apply it to the full
review. It is not saved as a repository-wide policy or inherited by other PRs.
It does not authorize modifications or changes to the review policy. Model
routing and configured `outputLanguage` remain controlled by the workflow. Do not put secrets in it: OpenCode sessions and model
requests retain it like other review input. The installed command templates
prevent native argument expansion before the plugin handles this text.

Normal and deep reviews start the initial reviewers directly. Each reads PR
identity and source/target commit references, requests the changed files, and
reviews them. The runtime compares identities/versions before verification.
`/pr-check` remains an optional separate diagnostic with stricter cumulative
readiness requirements; its result is not a prerequisite or cached review input.

This removes a model session and ancestry/whole-tree discovery from the review
path. It does not guarantee fewer live errors or faster models. See
[source access](docs/AZURE_MCP.md) for limits and evaluation needs.

### Optional PR comments

The workflow never starts a publishing stage automatically; reviewer prompts prohibit modifications. To enable publishing, set `comments.enabled: true` in your installed settings **before reviewing**, then restart OpenCode. After a complete review, run `/pr-comment <review-id>` to inspect a read-only preview, then `/pr-comment <review-id> --publish` in the same original conversation/process. Both stages use the originating review's `risk` model: `models.review.risk` or `models.deep.risk`. They do not rerun the review, even if another mode has since completed.

The shared `outputLanguage` setting controls the final report and comment prose. The default policy posts at most five confirmed, actionable defects as short inline threads, with no long summary or cosmetic nits. The runtime validates the saved plan's format and passes it unchanged to the publisher. The model chooses tools from OpenCode and is instructed to verify HEAD, anchors, and duplicates, then create only the saved comments. There are no hardcoded MCP names, action filters, or provider-specific response adapters. No votes, approvals, merges, or existing-thread edits are authorized by the prompts. Publishing requires host/server permission and is disabled by default. A success receipt is explicitly `MODEL_REPORTED_POSTED`, not independently verified by the plugin. See [comment policy, setup, and limitations](docs/COMMENTING.md).

## MCP responsibility

This plugin orchestrates models and combines their results. OpenCode supplies tools,
schemas, and normal permission checks; each model selects the appropriate calls.
There is no plugin MCP tool-name, prefix, or action allowlist. Unknown/new MCP names do
not require a code change. Prompts instruct reviewers to read and analyze without
changing code, PRs, work items, votes, or pipelines. Prompt compliance is not a
security guarantee. Nested `task` delegation is disabled so models cannot start
unbudgeted reviewer agents. A separate guard stops repeated rejected native
`StructuredOutput` submissions; it does not filter MCP operations.

Private roles also deny native shell, editing, skill and public-web tools by default. A
command-scoped guard blocks attempted execution, including write/apply_patch
variants and rejected calls to hidden native tools. Two distinct blocked attempts
in a stage stop the run; receipts disclose even a single prevented attempt.
This does not classify MCP calls or make mixed read/write MCP dispatchers read-only.
Local-file access is prohibited by prompt policy except for the same session's
host-saved tool output, read in bounded chunks under existing host permissions.
This does not grant access to a working tree, settings or another session's files.
A blanket `read` permission denial would also disable MCP resource reads.

If a provider rejects requests when the shell tool is hidden, explicitly set
`"shellToolPermission": "ask"` in the installed AZPR settings and restart OpenCode.
This retains the native `bash` schema for provider compatibility. The same runtime
guard still rejects execution before the host asks for approval, and two distinct
attempts in a stage still stop the run. Other native permissions, ordinary agents,
MCP permissions and output validation are unchanged. Only `deny` (default) and
`ask` are accepted; there is no `allow` option, provider-name detection, automatic
fallback, or extra model request. Return to `deny` when your provider accepts it.
Verify compatibility and forced-call blocking on your actual host before use;
service acceptance alone does not establish review completeness or quality.

Old installed `azure` settings are accepted but ignored, with a startup warning.
You may remove that obsolete block; the installer preserves your private settings.
Global/project OpenCode permissions remain unchanged. Private reviewers are their
own agents; they do not inherit another agent's private permission overrides.

To reduce avoidable lookup errors, reviewers receive URL identity hints and
request the PR change list explicitly. They read changed files at exact commits,
avoid directory/history probes used only to prove readiness, reuse source within
their own session, and do not repeat deterministic parameter errors. No official
MCP patch, wrapper, argument adapter, automatic source-workflow restart or allowlist is added.
Actual error reduction needs live verification; see
[source-access discipline](docs/AZURE_MCP.md#avoiding-repeated-lookup-failures).
Prompt guidance permits at most one unknown-cause idempotent-read repeat per
stage, with identical arguments and the original deadline. Explicit denied or
deterministic errors and writes are excluded. Recovered failures stay disclosed;
the plugin neither performs the retry nor labels an unknown cause transient.

## Model roles

Configure three roles under `models.review` and the same three under `models.deep`. Models are local configuration, not hardcoded workflow choices. The example's `models._help` strings and schema descriptions explain the roles; `_help` is documentation only, never model instructions. The file remains ordinary JSON, without JSONC comments.

| Role in either profile | Responsibility | Selection criteria |
| --- | --- | --- |
| `functional` | Independent correctness review: requirements, boundaries, state changes, API compatibility, and regressions. | Strong code comprehension in the repository's languages. |
| `risk` | Independent failure/risk review: exceptions, retries, concurrency, authorization, and data consistency. Also the profile's comments and standalone normal-profile source check. | Evidence-based cross-path reasoning and reliable MCP tool use. |
| `verifier` | Recheck both initial reports against source, seek counterevidence, merge duplicates, and write the final report. | Strong evidence judgment, long-context handling, and instruction following; not just summarization. |

Every role needs reliable tool use and structured output. Use services approved for the PR's data and check actual cost and latency; neither mode implies a pricing tier. The same model ID may fill multiple roles or both profiles. Sessions stay separate, but model diversity and independent reasoning quality are not guaranteed. Never commit your private model mappings, internal endpoints, credentials, or review output.

Both modes run **two independent initial reviews** concurrently, then one final verification stage: three child sessions in the ordinary case. There is no automatic check stage. Initial reviewers discover and review the current PR changes without seeing each other's results. They use `F-` and `R-` finding IDs. The final verifier receives both reports and must check the source again, accounting for every original finding as confirmed, requiring information, rejected, or merged. It does not decide by majority vote.

Quality takes priority over speed: no file sampling, confidence-score cutoff,
automatic skip for small/draft/already-commented PRs, or removal of final
verification when the initial reviewers find nothing. Each initial review must
return a coverage ledger for all snapshot files and explicitly disclose gaps.
Each finding includes source evidence, checks for counterevidence/safeguards,
impact severity, and a correction/verification suggestion. Relevant repository
rules must be scoped and cited; they cannot override the review's instructions.

The verifier submits fixed `confirmed`, `merged`, `rejected`, `needsInfo` and
`newFindings` arrays. Each confirmed row contains all seven corrected finding
fields plus a reason. The runtime converts these explicit decisions to its
internal dispositions and `verifiedFinding` contract; it never supplies missing
evidence. Legacy dispositions are accepted alone for compatibility, not mixed
with categories. Comment planning uses the corrected version, not the initial
claim, and cannot change its severity or promote low-severity findings. The runtime validates the ledger
and evidence fields in both output transports; it cannot prove that a model
actually read the files or that its conclusions are true. See the
[evidence contract](docs/ARCHITECTURE.md#evidence-contract).

Deep mode uses its own three models and additional instructions for cross-file/system impact, failure interleavings, security boundaries, and counterevidence. Normal mode does not silently reduce source coverage. Deep is not an extra third initial reviewer and does not automatically guarantee higher quality; choose models and evaluate results accordingly. All three deep roles must be configured, otherwise `/pr-deep` refuses before any model call; it never falls back to normal models.

The plugin imposes no reviewer iteration or stage-character limit. The former
`steps` and `maxStageCharacters` settings have been removed, along with the
verifier input-size gate and diagnostic-answer previews. Complete responses are
parsed, passed between stages, saved when debug is enabled, and rendered without
plugin size truncation. This does not guarantee they fit the host/provider context.

The whole-command timeout defaults to disabled. To disable an existing timeout,
set this value in the updated installed AZPR settings and restart OpenCode:

```json
"runTimeoutSeconds": null
```

Omitting `runTimeoutSeconds` also disables it; an explicit integer from 10 to 7200
enables a timeout in seconds. Zero, strings and `Infinity` are not disable values.
No private agent receives a host iteration limit, and a disabled timeout creates
no whole-command timer. Manual cancellation,
native-tool guards, bounded output amendments and SDK cleanup remain in effect.
Model/context limits and OpenCode/MCP tool-output truncation remain separate.
More iterations cannot restore missing source; see
[large tool responses](docs/AZURE_MCP.md#large-tool-responses).

Each initial establishes a `scope: "pr"` snapshot: repository identity, PR ID,
PR-reported source/target SHAs and discovered changed paths. The PR ID must match
the URL. Both initials must agree on identity and versions; different file order
or discovery lists become a sorted union for the verifier to inspect. Original
lists and coverage remain in the reports. This is not proof of a common ancestor
or of independently complete file discovery.

The verifier rereads the same PR and returns `currentHead` and `currentBase`.
A changed source or target reference gives `STALE`; an unknown version gives
`INCOMPLETE`. Commit timestamps cannot substitute for SHAs. PR metadata may lag
branch changes; this is not an atomic server-side guarantee. Missing source gives
PARTIAL with concrete gaps, not invented values. Incomplete initials prevent
verification, circular finding merges remain invalid, and no review reruns
automatically.

## Reports and cancellation

Set the top-level `outputLanguage` in your installed `plugins/azpr/settings.json` to control **both the final report and Azure comment prose**, without editing prompts. For example, add or update this field in your existing settings for Traditional Chinese:

```json
"outputLanguage": "zh-TW"
```

The default is `en` (English), including when the field is omitted. Other examples are `zh-CN` (Simplified Chinese), `ja` (Japanese), and `zh-Hant-TW` (Traditional Chinese with an explicit script). Use a language tag, not a language name or free-form instruction. Change it before starting a review, then restart OpenCode. To use another language after a preview, restart and run a new review/preview; the publisher is instructed not to translate an already saved preview.

Final human-readable finding fields, disposition reasons, the brief report, comment prose, and comment skip explanations are localized. Intermediate reviews, status receipts, JSON keys/status values, finding IDs, code identifiers, paths, and source quotes remain unchanged. The runtime passes the language to the final-verifier and comment roles in each profile; actual language quality depends on the model. No translation model or extra review stage is added.

With the default `returnReport: "receipt"`, your original conversation gets the run status, session IDs, and model IDs. The runtime attempts to append the complete Markdown report to the last review session without invoking a model. When that display succeeds, use OpenCode's child-session navigation to inspect it; exact controls depend on your installed version. If display fails, inspect the original structured fields and any saved diagnostic report instead. The aggregate diagnostic result records `displayed: false`; display failure alone does not rerun the review or invalidate its validated findings. Diagnostic files are available only when debug logging was enabled and writing succeeded.

Set `returnReport: "full"` to include the final report in the original conversation. This uses additional conversation context. Both return modes use identical review requests and output validation; switching modes is not a JSON-error recovery mechanism. The main agent is instructed to reproduce the report verbatim in its configured language, including the provenance section, without an English-only presentation instruction. Its rendering is still model-dependent; a successfully appended child-session report or saved debug `report.md` preserves the runtime's version.

Final findings and disposition reasons are written once in structured fields.
The runtime renders their details and tables. Initial and final `report` prose
adds important exclusions, material corrections, open questions and testing/scope
limitations; it does not repeat version, coverage or finding inventories.
This is writing guidance, not a new word limit or evidence truncation rule.
No model is invoked for formatting. If final adjudication fails, a clearly marked
incomplete draft preserves valid initial observations in their original language,
with missing IDs and the failure reason. It is not a completed review and cannot
be used for comments. With debug enabled it is saved as `draft.md`, separate from
`report.md`. Receipt mode never embeds the draft's source content.

Every final review report includes its mode, a runtime-generated stage/model ledger, initial finding counts, and original finding dispositions/merge targets. It explains the method: independent initial reviews followed by source verification and duplicate merging, not majority voting. Only invoked review stages are listed; the other profile's models are absent. These are the selected OpenCode provider/model IDs, not independent proof of a provider's backend model. Host auxiliary models and the original chat model are not included.

Saved inline comments also contain an AI/model attribution footer and a notice that posting through a user's account is not human approval. This intentionally discloses the selected model IDs to PR readers; check that your company permits it before publishing. The complete footer is shown in the preview and passed unchanged to the publisher. Generated provenance/footer labels support English, Traditional Chinese, and Simplified Chinese (other language tags use English for these fixed labels; model-authored report/comment prose still follows the configured language).

### Output reliability and private debug files

By default, `structuredOutput: true` supplies a JSON schema through OpenCode
1.18.31's native output mechanism. A captured tool call can still omit required
review content. If your model/provider cannot reliably submit complete native
envelopes, explicitly set `structuredOutput: false` and restart to use JSON text.
This changes transport without changing models, adding retries or relaxing
snapshot, coverage, finding and disposition validation. A single unambiguous
JSON fence is supported. Raw and fenced JSON text reject duplicate keys, including
escaped-equivalent spellings, before any field value is accepted. Native output
arrives as an already parsed object, so the plugin cannot determine whether its
upstream serialization contained duplicate keys. Both transports reject missing
or ambiguous required content and responses marked truncated, filtered, errored
or cancelled; neither supplies missing evidence. One narrow text-only syntax
exception is described below.

Envelope, snapshot, coverage and disposition objects reject unknown fields in
both transports, including legacy final submissions. Empty-string/null extras at
those levels are also rejected. Runtime validation and value-free diagnostics
share the declared key catalogs; conditional evidence, coverage, version and
original-finding-ID checks remain mandatory. The finding-only normalization
below does not remove extra fields elsewhere or add missing required values.

Status-only initial/final submissions remain incomplete in both modes. Compare
the raw response with its requested schema before selecting a transport, and
validate the new mode on a separate authorized run. A successful sample is not
a guarantee for other models, PRs or host versions. There is no automatic switch.

Role prompts include only the selected transport's submission instructions.
The verifier's current-head field uses a simple string schema for tool-parser
compatibility. An unknown head remains INCOMPLETE; this never relaxes the full
SHA comparison required for a completed review.

Normal initial/verifier JSON text with finish=stop may contain trailing commas
after complete object members or array values. A grammar-aware scan removes only
those separators; strings, keys and values stay unchanged. Leading/double commas,
array holes, missing values/brackets, duplicate keys and all other malformed JSON
still fail. Full envelope validation is required, including a valid role status;
this cannot unlock an extra model amendment when validation fails. Native output,
source checks, comments and amendment sessions retain strict syntax parsing.

Finding output tolerates surrounding ASCII whitespace on an otherwise exact
field name and unknown fields whose value is exactly `""` or `null`. A redundant
CONFIRMED V disposition may also be removed when its complete finding exactly
matches the sole same-ID newFindings entry. Original F/R dispositions remain
complete and unique; the removed row and reason stay in the raw response.
Required values stay unchanged. The complete envelope must then
pass validation; missing evidence, conflicting keys and content-bearing extras
still fail with field-specific diagnostics. Accepted changes appear as
`output-format-corrections=N` in receipts and `outputFormatCorrections` in stage
results; raw responses remain available for inspection. This adds no model call
and does not consume the amendment allowance or change source checks/comments.

Initial candidates may omit only their separate `location` field. The runtime
records `pendingLocations`, shows `pending-locations=N` in receipts, and passes
those IDs to the verifier without guessing locations or requesting an initial
location amendment. Evidence and full coverage remain required. Final CONFIRMED
findings and new discoveries still need locations; unresolved candidates must
be NEEDS_INFO and cannot become PR comments.

With native output, two rejected `StructuredOutput` submissions in one review
session stop the run as `INCOMPLETE`. The host may continue after the first
rejection; the plugin adds no request or session and never edits the arguments.
Output-repair and comment sessions stop on the first rejection. This guard is
independent of `outputRetries` and only observes the host's built-in `invalid`
tool for structured submissions. It is not a general provider retry/spending cap.
Receipts show `invalid-structured-output=N` when any rejection was observed.

All host `invalid` submissions also contribute to the stage's
`toolObservations.rejectedSubmissions` and the receipt's
`rejected-tool-submissions=N`, including rejected MCP tool requests. Repeated
delivery of the same call ID counts once. These are rejected submissions, not
MCP execution failures or successful source reads, even if the host marks its
invalid handler completed. The count can overlap structured-output and
blocked-native counters; do not add them as unique failures. The counter does not
copy requested tool names, arguments or rejection text. It adds no retry and does
not change guard thresholds or evidence validation. Older artifacts without the
field have unknown rejection counts, not zero. See [tool diagnostics](docs/DEBUGGING.md#receipt-versus-full).

Optional `outputRetries: 1` allows **one bounded amendment per review stage**:

- An invalid top-level status such as `CCOMPLETE`: the same model returns only
  a status in a fresh session; all other fields remain immutable.
- Absent `location` fields in otherwise valid COMPLETE verifier findings:
  the same reviewer gets one request in its original, stopped session to retain
  its own source context. It returns only the requested IDs and source locations.
  Existing field values stay unchanged; no tool/source work is repeated. If the
  location cannot be established from that context, the stage remains incomplete.

- Missing original disposition rows in an otherwise valid COMPLETE verifier
  submission: one request in the same stopped session may add only MERGED rows
  pointing to already confirmed original findings. All missing IDs must be
  accounted for from that verifier's existing source context. If any merge is
  unproven or needs changes to an existing finding, the amendment must decline.
  No merge is inferred from prose or supplied by the runtime.

- Other output-validation failures in a parsed COMPLETE verifier submission:
  one complete final content resubmission in the same stopped session. Snapshot
  identity/file set and the already observed current source/target versions must
  match the expected PR and remain frozen. The verifier may correct missing
  evidence or decisions using retained source context. No initial finding is
  copied as a fallback, and the complete replacement must pass validation.

All cases share one allowance, not one each. Default `0` disables all.
The first three narrow amendments require every other contract to pass; final
content resubmission requires the known, unchanged version frame. The original
session must have a completed tool call and a confirmed abort. Repair grants
deny ordinary tools and a second model request. The complete amended envelope
is validated again. Original failures, `retry-kind`, attempt/session IDs and
amendment/resubmission notices remain visible in receipts and diagnostics. Final
resubmission is model-authored content recovery, with extra usage, not local
formatting or proof of source truth. Provider errors, invalid outer JSON, truncation,
unknown/stale versions, cancellation and unconfirmed aborts do not qualify.
A status-only initial response still cannot regenerate a review. The plugin
never extracts guessed locations from report text; amended locations are model
claims, not independently verified source facts.

An authorized amendment can accept one complete JSON text object when the only
host error is `StructuredOutputError` for a missing native submission and the
response ends with `stop`. This requires the same active grant, one model request,
no tool attempts or rejected submissions, and full amendment/envelope validation.
No extra request is made. `output-transport=json-text` and a receipt notice disclose
the change; the original error remains in diagnostics. Truncated or ambiguous
JSON, duplicate keys, general host/provider errors and cancellations still fail.
Normal review submissions and comment sessions do not use this fallback.

Normal reviewers receive only their full-review instructions. The bounded
amendment instructions replace the reviewer prompt only in an authorized repair
session; enabling retries does not expose an alternative output format to normal
reviews. If the host cannot apply that isolated prompt, repair stops before a
model request. Provider/host system context and ordinary agents are preserved.

This does not retry malformed/missing outer JSON, general host/provider errors,
initial evidence/coverage gaps, changed or unknown PR versions, cancellations, or
comment preview/publication. Missing final content can qualify only for the
explicit content resubmission described above. A
second failure ends that stage. The existing run timeout is not reset. A full
review has three stages, so enabling this setting permits at most three extra
amendment requests (one for standalone `/pr-check`); final content recovery can
replace evidence and decisions. This is not a spending cap or proof of review quality.
Restart OpenCode after changing the setting. See [bounded output amendments](docs/DEBUGGING.md#bounded-output-amendments).

Debug is opt-in and works with both `receipt` and `full`. Add these fields to your existing installed settings (do not replace the entire profile):

```json
"outputLanguage": "zh-TW",
"returnReport": "full",
"structuredOutput": true,
"debug": { "enabled": true, "directory": "" }
```

Restart OpenCode. Empty `directory` saves outside the project under `${XDG_STATE_HOME:-~/.local/state}/opencode/azpr-debug/`. To save in the active project instead, use `"directory": ".azpr-debug"`. An absolute directory is also supported; `~` is not expanded. Each command gets a unique private directory, printed in its receipt. Debug files include each stage's input, role instructions, visible output, model errors, validated result, session/model IDs, and the final report. They do not include private reasoning fields, full tool traffic, provider configuration, or HTTP headers. See [debug files and failed-session inspection](docs/DEBUGGING.md).

With debug enabled, stage `timing` separates observed tool intervals, model-request
windows and time from the last tool completion to the SDK response. Aggregate
timing records report rendering, display and final cleanup. Overlapping tool calls
are counted once; missing completion hooks remain unknown. These intervals include
host/provider waiting and are not pure model inference or MCP server timings.
Collection adds no model request and stores no tool arguments or outputs.

**Debug files can contain company source, PR details, and secrets echoed in ordinary model text.** They are not automatically redacted. Directories/files are created with owner-only permissions on Linux; each run contains a `.gitignore` to prevent ordinary Git adds, including for custom project-local locations. This is not protection against forced adds, backups, or other software. Debug files are not deleted automatically or removed by uninstall. Keep them private and clean them up according to company retention rules. Leave debug disabled for normal use if you do not need local copies.

Completed reviewer sessions cannot be reused. Start another review from an ordinary session. To cancel from another ordinary session in the same OpenCode process, pass the run ID to `/pr-stop`. Cancellation cannot refund requests already sent to a provider. The whole-command timeout is disabled by default (`runTimeoutSeconds: null`). If explicitly enabled, it includes all stages and display, is not reset for the verifier or an output amendment, and returns `TIMED_OUT` when exceeded. Without a timeout, no plugin iteration/time budget ends a stalled run; use `/pr-stop` when needed. For an active run, `/pr-stop` acknowledges that authorization was revoked and cancellation requested; the cancelled workflow then reports `CANCELLED` with its cause. If no active run matches, `/pr-stop` reports that no active review was found. The plugin provides no spending cap.

Standalone-check `READY` and review-stage `COMPLETE` are the expected success statuses;
neither approves the PR. In receipt mode, inspect the final session through the
human UI without sending a prompt. A Task invocation that resumes it is not
navigation. If that UI is unavailable, keep the receipt/session IDs and diagnostic
location, or choose `returnReport: "full"` before a future run for an inline report.

If OpenCode does not acknowledge an abort, the receipt warns that remote work may
still be running or billed; the plugin's grants are revoked regardless. Cancelling
during final-report display does not leave a completed review available for
comments. A cancelled/failed comment preview cannot be published; preview again
explicitly when appropriate. An uncertain publication attempt must not be retried.

The original conversation and OpenCode's title, summary, or compaction models can still incur their usual costs.

## Update, disable, or uninstall

```sh
# Convert installed settings and replace integration files, without a backup.
sh install.sh --replace

# Explicitly replace settings with a trusted local profile.
sh install.sh --replace --settings /path/to/team.json
```

Replacement directly converts settings to schema `version: 2`, then adds missing fields from the new example, including nested fields and role guidance. Old model IDs are moved using this explicit mapping; no new model is selected:

| New setting | Previous value |
| --- | --- |
| `models.review.functional` | `models.freeA` |
| `models.review.risk` | `models.freeB` |
| `models.review.verifier` | `models.freeB` |
| `models.deep.functional` | `models.freeA` |
| `models.deep.risk` | `models.deep` (the former single-model string) |
| `models.deep.verifier` | `models.final` |

The old model keys are removed. Deep no longer adds a third initial reviewer; its former deep model becomes the risk reviewer. Installation also removes obsolete `steps` and `maxStageCharacters` fields, regardless of their previous values. They are no longer supported settings. Use `sh install.sh --replace` with files from this revision; when replacing runtime files yourself, delete both fields from your AZPR settings before restarting.

Other existing values, including language, `false`, empty strings, `null`, arrays, and custom fields, are preserved. For example, `debug.enabled: true` stays true while a missing `debug.directory` is added. An explicit numeric `runTimeoutSeconds` remains enabled; an omitted value receives `null`, and explicit `null` stays disabled. Install the updated runtime before using a nullable timeout; older runtimes reject it. Invalid remaining values are not silently repaired; unknown/custom fields remain but may be rejected by startup validation. Installation prints changed field names, never private model values. JSON is reformatted only when migration, field removal or missing-field insertion is needed; repeated unchanged installations retain formatting.

**Installation keeps no persistent backup.** It prepares the converted profile before replacing files and temporarily holds the previous integration for rollback if a normal installation step fails. After success, those temporary files are removed. If automatic restoration fails, it retains emergency recovery files and prints their path. This is not power-loss-safe storage or a historical archive. Existing backups from older installers are left untouched.

`--settings FILE` selects that file as the conversion/merge base instead of the installed profile; the source file is not edited. Malformed JSON, duplicate keys, non-object profiles, unsupported versions, or ambiguous mixed model layouts stop installation before existing files are moved. Model access is not API-validated; the plugin still checks settings at startup. Ensure `python3 --version` works first. Prompts are replaced without a retained copy: manually save any policy customization you want to keep before installing, and use `outputLanguage` for language preferences. Conflicting commands or agents require manual resolution.

The runtime, prompts, and settings now live together under `plugins/azpr/`;
`plugins/azpr.js` is the only top-level plugin entry. `--replace` migrates the old
sibling `azpr/` layout and removes it after success. If both layouts contain settings, select
one explicitly with `--settings`. Do not flatten all runtime files into `plugins/`
or keep duplicate top-level loaders. See [traversal diagnostics](docs/VALIDATION.md#directory-traversal-diagnostics).

Set `enabled: false` and restart OpenCode to disable review execution. If you included the optional `uninstall.sh`, remove the integration using the installed uninstaller:

```sh
# Preview first.
sh ~/.config/opencode/plugins/azpr/uninstall.sh
# Archive the integration.
sh ~/.config/opencode/plugins/azpr/uninstall.sh --apply
```

The installer does not edit your main OpenCode configuration, providers, MCP connections, or credentials. Uninstall remains an explicit archival operation under `azpr-backups/`; the no-backup behavior applies to installation/replacement. Restart OpenCode after updates or removal.

Install runtime files and prompts from the same revision. Review envelopes now
require coverage, counterevidence, and corrected confirmed findings; older custom
prompts that omit them will fail validation. No new model slot or mandatory
installation file is needed. Apart from obsolete fields removed above, existing
private settings are preserved; a missing
`outputRetries` is added as `0`, leaving recovery off until explicitly enabled.
A missing `shellToolPermission` is added as `deny`; an explicit `ask` is preserved.

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/` | Plugin entry, runtime, and private reviewer prompts. |
| `commands/` | Explicit command templates. |
| `config/` | One settings example and one JSON schema. |
| `scripts/` | Installation-time settings migration and missing-default merge (Python standard library). |
| `tests/` | Mock workflow tests and real shell installation tests. |
| `docs/` | Architecture, Azure setup, and environment validation. |
| `install.sh`, `uninstall.sh` | Installation and archival removal. |
| `package.json` | Release version (0.1.0), module metadata, and development scripts. |
| `.github/workflows/ci.yml` | Automated syntax and regression checks. |

Generated test logs and release checksums are not source files. If release archives are distributed later, checksums can be generated alongside those archives.

## Data handling and limitations

PR source, MCP results, and review reports are passed through OpenCode to the configured model services. Read-only access does not mean data stays inside your company. Verify provider approval, retention, and access policies before using internal PRs.

This plugin adds workflow-level isolation, not an OS sandbox, DLP system, account-wide spending firewall, or merge gate. Only start OpenCode in trusted directories. Untrusted PR configuration and other local plugins can affect the host.

The plugin checks output structure and model-reported snapshot consistency. **Read-only review is a prompt instruction, not a plugin-enforced MCP restriction.** OpenCode owns tool discovery and permissions. The plugin does not classify calls as reads/writes, inspect Azure response schemas, or guarantee that a model read every file, avoided modifications, or found every bug. Use host/server permissions when a hard boundary is required. See [architecture and trust boundaries](docs/ARCHITECTURE.md).

## Development

```sh
npm test
npm run check
```

Use Node.js 22 or later for development. There are no external package dependencies, so npm install is unnecessary. Tests use mock model responses and disposable configuration directories. They do not call live models or Azure.

For AI-assisted development, start with [AGENTS.md](AGENTS.md). It routes changes
to the relevant source/tests and defines the verification and handoff process.
[Architecture](docs/ARCHITECTURE.md) records current behavior and accepted design
decisions; the [roadmap](docs/ROADMAP.md) records pending work and acceptance gates.
Machine-specific continuation notes may live in `.local/HANDOVER.md`, which is
Git-ignored, not installed, and normally absent from a clone. These development
documents are not additional requirements for the 24-file manual installation.
