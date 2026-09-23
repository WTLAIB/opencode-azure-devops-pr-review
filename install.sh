#!/bin/sh
# Install only this integration. Never edit OpenCode configuration or execute settings.
set -eu
umask 077

src=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
root=${XDG_CONFIG_HOME:-${HOME:?HOME is required}/.config}/opencode
profile=
replace=0

usage() {
  cat <<'TXT'
Usage: sh install.sh [--settings FILE] [--replace] [--config-dir DIR]
  --settings    Select a trusted JSON profile; convert roles and add missing defaults.
  --replace     Convert settings and replace this integration without keeping backups.
                Preserve values and add missing defaults unless --settings selects another profile.
  --config-dir  OpenCode configuration directory (default: XDG_CONFIG_HOME/opencode).
Python 3 (standard library only) is required to merge JSON safely.
No npm install, pip packages, jq, sudo, or network access is required.
TXT
}
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

while [ "$#" -gt 0 ]; do
  case $1 in
    --settings) [ "$#" -ge 2 ] || die '--settings needs a file'; profile=$2; shift 2 ;;
    --config-dir) [ "$#" -ge 2 ] || die '--config-dir needs a directory'; root=$2; shift 2 ;;
    --replace) replace=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done
command -v python3 >/dev/null 2>&1 || die 'Python 3 is required for safe JSON settings merging. Install python3 and retry; no installation files were changed.'
for file in scripts/merge-settings.py src/runtime.mjs src/comments.mjs src/config.mjs src/output.mjs src/diagnostics.mjs src/attribution.mjs src/plugin.js config/settings.example.json config/settings.schema.json package.json; do
  [ -f "$src/$file" ] || die "Incomplete package: $file is missing."
done
if [ -n "$profile" ]; then
  [ -f "$profile" ] && [ -r "$profile" ] || die 'The settings file is not readable.'
fi
case $root in /*) ;; *) root=$(pwd -P)/$root ;; esac
mkdir -p "$root"
root=$(CDPATH= cd -- "$root" && pwd -P)
lock=$root/.azpr-install.lock
mkdir "$lock" 2>/dev/null || die "Installation lock exists: $lock"
stage=
success=0

cleanup() {
  rc=$?
  recovery_required=0
  trap - EXIT HUP INT TERM
  if [ "$success" -ne 1 ] && [ -n "$stage" ] && [ -d "$stage" ]; then
    if [ -f "$stage/installed" ]; then
      while IFS= read -r rel; do
        [ -n "$rel" ] && rm -rf -- "$root/$rel"
      done < "$stage/installed"
    fi
    if [ -f "$stage/moved" ]; then
      while IFS= read -r rel; do
        if [ -e "$stage/previous/$rel" ] || [ -L "$stage/previous/$rel" ]; then
          mkdir -p "$(dirname -- "$root/$rel")"
          if ! mv -- "$stage/previous/$rel" "$root/$rel"; then
            recovery_required=1
            printf 'Restore manually: %s\n' "$stage/previous/$rel" >&2
          fi
        fi
      done < "$stage/moved"
    fi
  fi
  if [ "$recovery_required" -eq 0 ]; then
    [ -z "$stage" ] || rm -rf -- "$stage"
  else
    printf 'Automatic recovery failed; emergency files retained: %s\n' "$stage" >&2
  fi
  rmdir "$lock" 2>/dev/null || true
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

# Refuse conflicts rather than trying to rewrite JSONC.
for config in "$root/opencode.json" "$root/opencode.jsonc" "$root/config.json"; do
  if [ -f "$config" ] && grep -Eq '"(pr-check|pr-review|pr-deep|pr-stop|pr-comment|azpr-[^"]+)"[[:space:]]*:' "$config"; then
    die "Reserved command/agent keys appear in $config. Resolve them manually."
  fi
done
for path in "$root"/agent/azpr-*.md "$root"/agents/azpr-*.md; do
  [ ! -e "$path" ] && [ ! -L "$path" ] || die "Conflicting agent file: $path"
done
for sub in commands command plugins plugin plugins/azpr azpr; do
  [ ! -L "$root/$sub" ] || die "Symlinked integration directory: $root/$sub"
done
# Alternate discovery directories must not shadow this installation.
for rel in command/pr-check.md command/pr-review.md command/pr-deep.md command/pr-stop.md command/pr-comment.md plugin/azpr.js; do
  [ ! -e "$root/$rel" ] && [ ! -L "$root/$rel" ] || die "Conflicting integration file: $root/$rel"
done

stage=$(mktemp -d "$root/.azpr-stage.XXXXXX")
cat > "$stage/targets" <<'TXT'
azpr
plugins/azpr
commands/pr-check.md
commands/pr-review.md
commands/pr-deep.md
commands/pr-stop.md
commands/pr-comment.md
plugins/azpr.js
TXT
while IFS= read -r rel; do
  if [ -e "$root/$rel" ] || [ -L "$root/$rel" ]; then
    [ "$replace" -eq 1 ] || die "Target exists: $root/$rel. Use --replace to convert settings and replace it without a backup."
  fi
done < "$stage/targets"

mkdir -p "$stage/new/plugins/azpr" "$stage/new/commands"
cp "$src/src/runtime.mjs" "$src/src/comments.mjs" "$src/src/config.mjs" "$src/src/output.mjs" "$src/src/diagnostics.mjs" "$src/src/attribution.mjs" "$src/src/plugin.js" "$stage/new/plugins/azpr/"
cp -R "$src/src/prompts" "$stage/new/plugins/azpr/prompts"
printf '%s\n' '// azpr-optin:plugin' 'export { AzurePrReview } from "./azpr/plugin.js";' > "$stage/new/plugins/azpr.js"
for cmd in pr-check pr-review pr-deep pr-stop pr-comment; do
  cp "$src/commands/$cmd.md" "$stage/new/commands/$cmd.md"
done
cp "$src/config/settings.schema.json" "$src/package.json" "$src/README.md" "$src/uninstall.sh" "$stage/new/plugins/azpr/"
cp -R "$src/docs" "$stage/new/plugins/azpr/docs"
if [ -n "$profile" ]; then
  settings_source=$profile
elif [ "$replace" -eq 1 ] && [ -f "$root/plugins/azpr/settings.json" ] && [ -f "$root/azpr/settings.json" ]; then
  die 'Both old and new settings exist. Choose the intended profile explicitly with --settings.'
elif [ "$replace" -eq 1 ] && [ -f "$root/plugins/azpr/settings.json" ]; then
  settings_source=$root/plugins/azpr/settings.json
elif [ "$replace" -eq 1 ] && [ -f "$root/azpr/settings.json" ]; then
  settings_source=$root/azpr/settings.json
else
  settings_source=$src/config/settings.example.json
fi
python3 -I "$src/scripts/merge-settings.py" "$src/config/settings.example.json" "$settings_source" "$stage/new/plugins/azpr/settings.json"
chmod 600 "$stage/new/plugins/azpr/settings.json"

: > "$stage/moved"
: > "$stage/installed"
while IFS= read -r rel; do
  if [ -e "$root/$rel" ] || [ -L "$root/$rel" ]; then
    mkdir -p "$(dirname -- "$stage/previous/$rel")"
    printf '%s\n' "$rel" >> "$stage/moved"
    mv -- "$root/$rel" "$stage/previous/$rel"
  fi
done < "$stage/targets"
while IFS= read -r rel; do
  # The former sibling runtime is removed after successful replacement.
  [ "$rel" != azpr ] || continue
  mkdir -p "$(dirname -- "$root/$rel")"
  printf '%s\n' "$rel" >> "$stage/installed"
  mv -- "$stage/new/$rel" "$root/$rel"
done < "$stage/targets"
success=1
printf '\nAzure PR Review installed (target host: OpenCode 1.18.31).\nSettings: %s\n' "$root/plugins/azpr/settings.json"
printf 'No installation backup is retained after success. Existing older backups are untouched.\n'
cat <<'TXT'
1. Configure models.review.functional/risk/verifier. Configure all three models.deep roles to enable /pr-deep.
2. Use your existing OpenCode MCP connection and permissions; no tool mapping is required.
3. Fully restart OpenCode and run /pr-check on a small, known PR.
Settings have not been API-validated. The plugin refuses incomplete configuration.
TXT
