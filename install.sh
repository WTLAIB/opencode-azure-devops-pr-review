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
  --settings    Copy a trusted JSON profile without executing it.
  --replace     Back up this integration before replacement; preserve installed
                settings unless --settings is explicitly supplied.
  --config-dir  OpenCode configuration directory (default: XDG_CONFIG_HOME/opencode).
No npm install, Python, jq, sudo, or network access is required.
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
for file in src/runtime.mjs src/plugin.js config/settings.example.json config/settings.schema.json package.json; do
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
backup=
success=0

cleanup() {
  rc=$?
  trap - EXIT HUP INT TERM
  if [ "$success" -ne 1 ] && [ -n "$stage" ] && [ -d "$stage" ]; then
    if [ -f "$stage/installed" ]; then
      while IFS= read -r rel; do
        [ -n "$rel" ] && rm -rf -- "$root/$rel"
      done < "$stage/installed"
    fi
    if [ -n "$backup" ] && [ -f "$stage/moved" ]; then
      while IFS= read -r rel; do
        if [ -e "$backup/$rel" ] || [ -L "$backup/$rel" ]; then
          mkdir -p "$(dirname -- "$root/$rel")"
          mv -- "$backup/$rel" "$root/$rel" || printf 'Restore manually: %s\n' "$backup/$rel" >&2
        fi
      done < "$stage/moved"
    fi
  fi
  [ -z "$stage" ] || rm -rf -- "$stage"
  rmdir "$lock" 2>/dev/null || true
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

# Refuse conflicts rather than trying to rewrite JSONC.
for config in "$root/opencode.json" "$root/opencode.jsonc" "$root/config.json"; do
  if [ -f "$config" ] && grep -Eq '"(pr-check|pr-review|pr-deep|pr-stop|azpr-(check|functional|failure|deep|verify-free|verify-paid))"[[:space:]]*:' "$config"; then
    die "Reserved command/agent keys appear in $config. Resolve them manually."
  fi
done
for role in check functional failure deep verify-free verify-paid; do
  for sub in agent agents; do
    path=$root/$sub/azpr-$role.md
    [ ! -e "$path" ] && [ ! -L "$path" ] || die "Conflicting agent file: $path"
  done
done
for sub in commands command plugins plugin azpr azpr-backups; do
  [ ! -L "$root/$sub" ] || die "Symlinked integration directory: $root/$sub"
done
# Alternate discovery directories must not shadow this installation.
for rel in command/pr-check.md command/pr-review.md command/pr-deep.md command/pr-stop.md plugin/azpr.js; do
  [ ! -e "$root/$rel" ] && [ ! -L "$root/$rel" ] || die "Conflicting integration file: $root/$rel"
done

stage=$(mktemp -d "$root/.azpr-stage.XXXXXX")
cat > "$stage/targets" <<'TXT'
azpr
commands/pr-check.md
commands/pr-review.md
commands/pr-deep.md
commands/pr-stop.md
plugins/azpr.js
TXT
while IFS= read -r rel; do
  if [ -e "$root/$rel" ] || [ -L "$root/$rel" ]; then
    [ "$replace" -eq 1 ] || die "Target exists: $root/$rel. Use --replace to back up and replace it."
  fi
done < "$stage/targets"

mkdir -p "$stage/new/azpr" "$stage/new/plugins" "$stage/new/commands"
cp "$src/src/runtime.mjs" "$src/src/plugin.js" "$stage/new/azpr/"
cp -R "$src/src/prompts" "$stage/new/azpr/prompts"
printf '%s\n' '// azpr-optin:plugin' 'export { AzurePrReview } from "../azpr/plugin.js";' > "$stage/new/plugins/azpr.js"
for cmd in pr-check pr-review pr-deep pr-stop; do
  cp "$src/commands/$cmd.md" "$stage/new/commands/$cmd.md"
done
cp "$src/config/settings.schema.json" "$src/package.json" "$src/README.md" "$src/uninstall.sh" "$stage/new/azpr/"
cp -R "$src/docs" "$stage/new/azpr/docs"
if [ -n "$profile" ]; then
  cp -- "$profile" "$stage/new/azpr/settings.json"
elif [ "$replace" -eq 1 ] && [ -f "$root/azpr/settings.json" ]; then
  cp "$root/azpr/settings.json" "$stage/new/azpr/settings.json"
else
  cp "$src/config/settings.example.json" "$stage/new/azpr/settings.json"
fi
chmod 600 "$stage/new/azpr/settings.json"

: > "$stage/moved"
: > "$stage/installed"
while IFS= read -r rel; do
  if [ -e "$root/$rel" ] || [ -L "$root/$rel" ]; then
    if [ -z "$backup" ]; then
      mkdir -p "$root/azpr-backups"
      backup=$(mktemp -d "$root/azpr-backups/replaced.XXXXXX")
    fi
    mkdir -p "$(dirname -- "$backup/$rel")"
    printf '%s\n' "$rel" >> "$stage/moved"
    mv -- "$root/$rel" "$backup/$rel"
  fi
done < "$stage/targets"
while IFS= read -r rel; do
  mkdir -p "$(dirname -- "$root/$rel")"
  printf '%s\n' "$rel" >> "$stage/installed"
  mv -- "$stage/new/$rel" "$root/$rel"
done < "$stage/targets"
success=1
printf '\nAzure PR Review installed.\nSettings: %s\n' "$root/azpr/settings.json"
[ -z "$backup" ] || printf 'Previous files preserved: %s\n' "$backup"
cat <<'TXT'
1. Configure exact freeA/freeB provider/model IDs; deep/final are optional.
2. Match your existing Azure MCP tool names and read-only permissions.
3. Fully restart OpenCode and run /pr-check on a small, known PR.
Settings have not been API-validated. The plugin refuses incomplete configuration.
TXT
