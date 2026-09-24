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
| `/pr-review <Azure PR URL> [context]` | Source check, two independent initial reviewers, then evidence verification. |
| `/pr-deep <Azure PR URL> [context]` | Source check, two independent initial reviewers, then final verification, using the deep profile and deeper analysis instructions. |
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
from PR data and the checker's summary. Reviewers are instructed to report any
unverified requirements; this does not guarantee perfect model compliance.

Context applies **only to that command**. `/pr-check` checks readiness, not defects;
repeat the context on a later `/pr-review` or `/pr-deep` to apply it to the full
review. It is not saved as a repository-wide policy or inherited by other PRs.
It does not authorize modifications or changes to the review policy. Model
routing and configured `outputLanguage` remain controlled by the workflow. Do not put secrets in it: OpenCode sessions and model
requests retain it like other review input. The installed command templates
prevent native argument expansion before the plugin handles this text.

### Optional PR comments

The workflow never starts a publishing stage automatically; reviewer prompts prohibit modifications. To enable publishing, set `comments.enabled: true` in your installed settings **before reviewing**, then restart OpenCode. After a complete review, run `/pr-comment <review-id>` to inspect a read-only preview, then `/pr-comment <review-id> --publish` in the same original conversation/process. Both stages use the originating review's `risk` model: `models.review.risk` or `models.deep.risk`. They do not rerun the review, even if another mode has since completed.

The shared `outputLanguage` setting controls the final report and comment prose. The default policy posts at most five confirmed, actionable defects as short inline threads, with no long summary or cosmetic nits. The runtime validates the saved plan's format and passes it unchanged to the publisher. The model chooses tools from OpenCode and is instructed to verify HEAD, anchors, and duplicates, then create only the saved comments. There are no hardcoded MCP names, action filters, or provider-specific response adapters. No votes, approvals, merges, or existing-thread edits are authorized by the prompts. Publishing requires host/server permission and is disabled by default. A success receipt is explicitly `MODEL_REPORTED_POSTED`, not independently verified by the plugin. See [comment policy, setup, and limitations](docs/COMMENTING.md).

## MCP responsibility

This plugin orchestrates models and combines their results. OpenCode supplies tools,
schemas, and normal permission checks; each model selects the appropriate calls.
There is no plugin tool-name, prefix, or action allowlist. Unknown/new MCP names do
not require a code change. Prompts instruct reviewers to read and analyze without
changing code, PRs, work items, votes, or pipelines. Prompt compliance is not a
security guarantee. The only tool-specific orchestration restriction is disabling
nested `task` delegation, so models cannot start unbudgeted reviewer agents.

Old installed `azure` settings are accepted but ignored, with a startup warning.
You may remove that obsolete block; the installer preserves your private settings.
Global/project OpenCode permissions remain unchanged. Private reviewers are their
own agents; they do not inherit another agent's private permission overrides.

## Model roles

Configure three roles under `models.review` and the same three under `models.deep`. Models are local configuration, not hardcoded workflow choices. The example's `models._help` strings and schema descriptions explain the roles; `_help` is documentation only, never model instructions. The file remains ordinary JSON, without JSONC comments.

| Role in either profile | Responsibility | Selection criteria |
| --- | --- | --- |
| `functional` | Independent correctness review: requirements, boundaries, state changes, API compatibility, and regressions. | Strong code comprehension in the repository's languages. |
| `risk` | Independent failure/risk review: exceptions, retries, concurrency, authorization, and data consistency. Also the profile's source checks and comments. | Evidence-based cross-path reasoning and reliable MCP tool use. |
| `verifier` | Recheck both initial reports against source, seek counterevidence, merge duplicates, and write the final report. | Strong evidence judgment, long-context handling, and instruction following; not just summarization. |

Every role needs reliable tool use and structured output. Use services approved for the PR's data and check actual cost and latency; neither mode implies a pricing tier. The same model ID may fill multiple roles or both profiles. Sessions stay separate, but model diversity and independent reasoning quality are not guaranteed. Never commit your private model mappings, internal endpoints, credentials, or review output.

Both modes run a source check, **two independent initial reviews**, and one final verification stage. Initial reviewers run concurrently on the full cumulative PR without seeing each other's results. They use `F-` and `R-` finding IDs. The final verifier receives both reports and must check the source again, accounting for every original finding as confirmed, requiring information, rejected, or merged. It does not decide by majority vote.

Deep mode uses its own three models and additional instructions for cross-file/system impact, failure interleavings, security boundaries, and counterevidence. Its two initial reviewers each receive `steps.deep` (default 80), versus `steps.initial` (60) in normal mode. Both profiles share `steps.check` (24), `steps.final` (100), and the run timeout. Normal mode does not silently reduce source coverage. Deep is not an extra third initial reviewer and does not automatically guarantee higher quality; choose models and evaluate results accordingly. All three deep roles must be configured, otherwise `/pr-deep` refuses before any model call; it never falls back to normal models.

A source check fixes the repository, PR ID, base/head commits, and cumulative changed-file list. It uses that mode's `risk` model; standalone `/pr-check` uses `models.review.risk`. A snapshot whose PR ID differs from the URL is rejected. Incomplete initial reviews prevent final verification, and circular finding merges cannot produce a complete report. A model-reported changed PR head produces `STALE`; the plugin never automatically reruns the review.

## Reports and cancellation

Set the top-level `outputLanguage` in your installed `plugins/azpr/settings.json` to control **both the final report and Azure comment prose**, without editing prompts. For example, add or update this field in your existing settings for Traditional Chinese:

```json
"outputLanguage": "zh-TW"
```

The default is `en` (English), including when the field is omitted. Other examples are `zh-CN` (Simplified Chinese), `ja` (Japanese), and `zh-Hant-TW` (Traditional Chinese with an explicit script). Use a language tag, not a language name or free-form instruction. Change it before starting a review, then restart OpenCode. To use another language after a preview, restart and run a new review/preview; the publisher is instructed not to translate an already saved preview.

Only final-report Markdown, comment prose, and comment skip explanations are localized. Intermediate reviews, structured fields, status receipts, JSON keys/status values, finding IDs, code identifiers, paths, and source quotes remain unchanged. The runtime passes the language to the final-verifier and comment roles in each profile; actual language quality depends on the model. No translation model or extra review stage is added.

With the default `returnReport: "receipt"`, your original conversation gets the run status, session IDs, and model IDs. The complete report stays in the last review session. Use OpenCode's child-session navigation to inspect it; exact controls depend on your installed version.

Set `returnReport: "full"` to include the final report in the original conversation. This uses additional conversation context. Both return modes use identical review requests and output validation; switching modes is not a JSON-error recovery mechanism. The main agent is instructed to reproduce the report verbatim in its configured language, including the provenance section, without an English-only presentation instruction. Its rendering is still model-dependent; the child-session report and optional debug `report.md` preserve the runtime's version.

Every final review report includes its mode, a runtime-generated stage/model ledger, initial finding counts, and original finding dispositions/merge targets. It explains the method: independent initial reviews followed by source verification and duplicate merging, not majority voting. Only invoked review stages are listed; the other profile's models are absent. These are the selected OpenCode provider/model IDs, not independent proof of a provider's backend model. Host auxiliary models and the original chat model are not included.

Saved inline comments also contain an AI/model attribution footer and a notice that posting through a user's account is not human approval. This intentionally discloses the selected model IDs to PR readers; check that your company permits it before publishing. The complete footer is shown in the preview and passed unchanged to the publisher. Generated provenance/footer labels support English, Traditional Chinese, and Simplified Chinese (other language tags use English for these fixed labels; model-authored report/comment prose still follows the configured language).

### Output reliability and private debug files

By default, `structuredOutput: true` uses OpenCode 1.18.31's native JSON-schema output mechanism. This improves envelope reliability without selecting another model or automatically rerunning a failed stage. A provider must support the host's tool-based structured output. If it cannot, set `structuredOutput: false` and restart to use JSON text; a single fenced JSON response is supported, but malformed/truncated JSON is never silently repaired. Snapshot and finding checks apply to both transports. Host/provider-internal retries are outside this plugin's control.

Debug is opt-in and works with both `receipt` and `full`. Add these fields to your existing installed settings (do not replace the entire profile):

```json
"outputLanguage": "zh-TW",
"returnReport": "full",
"structuredOutput": true,
"debug": { "enabled": true, "directory": "" }
```

Restart OpenCode. Empty `directory` saves outside the project under `${XDG_STATE_HOME:-~/.local/state}/opencode/azpr-debug/`. To save in the active project instead, use `"directory": ".azpr-debug"`. An absolute directory is also supported; `~` is not expanded. Each command gets a unique private directory, printed in its receipt. Debug files include each stage's input, role instructions, visible output, model errors, validated result, session/model IDs, and the final report. They do not include private reasoning fields, full tool traffic, provider configuration, or HTTP headers. See [debug files and failed-session inspection](docs/DEBUGGING.md).

**Debug files can contain company source, PR details, and secrets echoed in ordinary model text.** They are not automatically redacted. Directories/files are created with owner-only permissions on Linux; each run contains a `.gitignore` to prevent ordinary Git adds, including for custom project-local locations. This is not protection against forced adds, backups, or other software. Debug files are not deleted automatically or removed by uninstall. Keep them private and clean them up according to company retention rules. Leave debug disabled for normal use if you do not need local copies.

Completed reviewer sessions cannot be reused. Start another review from an ordinary session. To cancel from another ordinary session in the same OpenCode process, pass the run ID to `/pr-stop`. Cancellation cannot refund requests already sent to a provider. The default timeout is 1,200 seconds; iteration and time limits are not spending caps.

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

The old model keys are removed. Deep no longer adds a third initial reviewer; its former deep model becomes the risk reviewer. Other existing values, including language, `false`, empty strings, `null`, arrays, and custom fields, are preserved. For example, `debug.enabled: true` stays true while a missing `debug.directory` is added. Invalid existing values are not silently repaired; unknown/custom fields remain but may be rejected by the plugin's startup validation. Installation prints changed field names, never private model values. JSON is reformatted only when conversion or missing-field insertion is needed; repeated unchanged installations retain formatting.

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
