# OpenCode Azure DevOps PR Review

Opt-in, multi-model pull request reviews inside OpenCode. The plugin uses your existing model providers and Azure DevOps MCP connection. Each review stage runs in a separate session; normal Plan and Build sessions keep their model and tool settings.

**Status:** offline workflow and installer tests are available. Real OpenCode, provider, Azure MCP, cancellation, and TUI compatibility still require validation in your environment.

**Target host:** OpenCode **1.18.31**. Host integration changes and command-expansion regression tests are based on this version, not an unpinned development branch. This is a compatibility baseline, not a claim of a live end-to-end certification.

## Install

Requires Linux or WSL, a POSIX shell, and an existing OpenCode installation with working model providers and Azure DevOps MCP. Installation needs no Python, jq, sudo, or npm packages. Node.js is needed only for development tests.

CI runs the installation and offline tests on Ubuntu 22.04 and 24.04. The installer uses `/bin/sh`, standard file utilities from `coreutils`, and `grep`, normally present on Ubuntu. Git is only needed to clone the repository. No separate Node.js or Bun installation is required by this plugin's installer; your existing OpenCode and MCP setup may have their own requirements. Passing these tests does not validate live OpenCode/provider/MCP compatibility.

Close OpenCode processes that use the same configuration directory, then run:

```sh
git clone https://github.com/WTLAIB/opencode-azure-devops-pr-review.git
cd opencode-azure-devops-pr-review
sh install.sh
```

Edit the settings file printed by the installer. By default it is at `~/.config/opencode/plugins/azpr/settings.json`; `XDG_CONFIG_HOME` and `--config-dir` can change that location.

1. Run `opencode models` to find the exact provider/model IDs.
2. Configure `freeA` and `freeB`. Leave `deep` and `final` empty until you want deep reviews.
3. Confirm your existing OpenCode MCP connection can read the PR. No tool-name mapping, prefix, or plugin allowlist is required; host permissions apply.
4. Fully restart OpenCode and try `/pr-check` on a small, known PR.

See [Azure MCP setup](docs/AZURE_MCP.md) and [validation](docs/VALIDATION.md) before enabling reviews for a team.

## Commands

| Command | Workflow |
| --- | --- |
| `/pr-check <Azure PR URL> [context]` | Check access to complete PR changes and source at fixed commits. |
| `/pr-review <Azure PR URL> [context]` | Source check, two independent initial reviewers, then evidence verification. |
| `/pr-deep <Azure PR URL> [context]` | Source check, three independent initial reviewers, then deep-mode verification. |
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

The workflow never starts a publishing stage automatically; reviewer prompts prohibit modifications. To enable publishing, set `comments.enabled: true` in your installed settings **before reviewing**, then restart OpenCode. After a complete review, run `/pr-comment <review-id>` to inspect a read-only preview, then `/pr-comment <review-id> --publish` in the same original conversation/process. Both stages use `freeB`; they do not rerun a paid review.

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

Models are local configuration, not hardcoded workflow choices.

| Setting | Responsibility |
| --- | --- |
| `freeA` | Functional correctness, edge cases, and regressions. |
| `freeB` | Source check, failure scenarios, economy-mode verification, and explicit comment planning/publishing. |
| `deep` | Independent deep review in `/pr-deep`. |
| `final` | Final verification in `/pr-deep`. |

The slot names do not guarantee pricing. Use services approved for the PR's data and check their actual costs. Never commit your model mappings, internal endpoints, credentials, or review output.

Initial reviewers run concurrently without seeing each other's results. The final verifier receives every initial report and must check the source again. It must account for every original finding as confirmed, requiring information, rejected, or merged. It does not decide by majority vote.

A source check fixes the repository, PR ID, base/head commits, and cumulative changed-file list. Incomplete initial reviews prevent final verification. A model-reported changed PR head produces `STALE`; the plugin never automatically reruns a paid review.

## Reports and cancellation

Set the top-level `outputLanguage` in your installed `plugins/azpr/settings.json` to control **both the final report and Azure comment prose**, without editing prompts. For example, add or update this field in your existing settings for Traditional Chinese:

```json
"outputLanguage": "zh-TW"
```

The default is `en` (English), including when the field is omitted. Other examples are `zh-CN` (Simplified Chinese), `ja` (Japanese), and `zh-Hant-TW` (Traditional Chinese with an explicit script). Use a language tag, not a language name or free-form instruction. Change it before starting a review, then restart OpenCode. To use another language after a preview, restart and run a new review/preview; the publisher is instructed not to translate an already saved preview.

Only final-report Markdown, comment prose, and comment skip explanations are localized. Intermediate reviews, structured fields, status receipts, JSON keys/status values, finding IDs, code identifiers, paths, and source quotes remain unchanged. The runtime passes the language to both final-verifier roles and both comment roles; actual language quality depends on the model. No translation model or extra review stage is added.

With the default `returnReport: "receipt"`, your original conversation gets the run status, session IDs, and model IDs. The complete report stays in the last review session. Use OpenCode's child-session navigation to inspect it; exact controls depend on your installed version.

Set `returnReport: "full"` to include the final report in the original conversation. This uses additional conversation context.

Completed reviewer sessions cannot be reused. Start another review from an ordinary session. To cancel from another ordinary session in the same OpenCode process, pass the run ID to `/pr-stop`. Cancellation cannot refund requests already sent to a provider. The default timeout is 1,200 seconds; iteration and time limits are not spending caps.

The original conversation and OpenCode's title, summary, or compaction models can still incur their usual costs.

## Update, disable, or uninstall

```sh
# Back up existing integration files; preserve installed settings.
sh install.sh --replace

# Explicitly replace settings with a trusted local profile.
sh install.sh --replace --settings /path/to/team.json
```

Replacement archives the installed integration and preserves its settings, including `outputLanguage`, unless an explicit profile is supplied. Prompts are replaced: migrate any old prompt-based language override to `outputLanguage` and reapply unrelated policy customizations from the backup before restarting. Conflicting commands or agents require manual resolution.

The runtime, prompts, and settings now live together under `plugins/azpr/`;
`plugins/azpr.js` is the only top-level plugin entry. `--replace` migrates the old
sibling `azpr/` layout and archives it. If both layouts contain settings, select
one explicitly with `--settings`. Do not flatten all runtime files into `plugins/`
or keep duplicate top-level loaders. See [traversal diagnostics](docs/VALIDATION.md#directory-traversal-diagnostics).

Set `enabled: false` and restart OpenCode to disable review execution. To remove the integration, use the installed uninstaller:

```sh
# Preview first.
sh ~/.config/opencode/plugins/azpr/uninstall.sh
# Archive the integration.
sh ~/.config/opencode/plugins/azpr/uninstall.sh --apply
```

The installer does not edit your main OpenCode configuration, providers, MCP connections, or credentials. Backups remain under `azpr-backups/` in the configuration directory. Restart OpenCode after updates or removal.

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/` | Plugin entry, runtime, and private reviewer prompts. |
| `commands/` | Explicit command templates. |
| `config/` | One settings example and one JSON schema. |
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
