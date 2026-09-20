#!/bin/sh
# Archive this integration only; never delete user settings.
set -eu
umask 077
root=${XDG_CONFIG_HOME:-${HOME:?HOME is required}/.config}/opencode
apply=0
while [ "$#" -gt 0 ]; do
  case $1 in
    --config-dir) [ "$#" -ge 2 ] || exit 2; root=$2; shift 2 ;;
    --apply) apply=1; shift ;;
    --help|-h) printf 'Usage: sh uninstall.sh [--config-dir DIR] [--apply]\nPreview by default; --apply archives only this integration. Restart OpenCode.\n'; exit 0 ;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done
[ -d "$root" ] || { printf 'No config directory.\n'; exit 0; }
root=$(CDPATH= cd -- "$root" && pwd -P)
lock=$root/.azpr-install.lock
mkdir "$lock" 2>/dev/null || { printf 'Installation lock exists: %s\n' "$lock" >&2; exit 1; }
trap 'rmdir "$lock" 2>/dev/null || true' EXIT
trap 'exit 130' HUP INT TERM
for sub in commands plugins; do [ ! -L "$root/$sub" ] || { printf 'Resolve symlink manually: %s\n' "$sub" >&2; exit 1; }; done
for cmd in pr-check pr-review pr-deep pr-stop; do
  f=$root/commands/$cmd.md
  if [ -e "$f" ] && ! grep -Fq "azpr-optin:$cmd" "$f"; then printf 'Not owned; refusing: %s\n' "$f" >&2; exit 1; fi
done
for spec in 'plugins/azpr.js|azpr-optin:plugin' 'azpr/runtime.mjs|AZPR opt-in OpenCode adapter'; do
  f=$root/${spec%%|*}; marker=${spec#*|}
  if [ -e "$f" ] && ! grep -Fq "$marker" "$f"; then printf 'Not owned; refusing: %s\n' "$f" >&2; exit 1; fi
done
if [ "$apply" -eq 0 ]; then
  printf 'Preview: archive azpr/, four pr-* commands, and plugins/azpr.js from:\n%s\nRe-run with --apply. No original models, settings, MCP, agents or other plugins are changed.\n' "$root"
  exit 0
fi
mkdir -p "$root/azpr-backups"
backup=$(mktemp -d "$root/azpr-backups/uninstalled.XXXXXX")
for rel in azpr commands/pr-check.md commands/pr-review.md commands/pr-deep.md commands/pr-stop.md plugins/azpr.js; do
  if [ -e "$root/$rel" ] || [ -L "$root/$rel" ]; then
    mkdir -p "$(dirname -- "$backup/$rel")"
    mv -- "$root/$rel" "$backup/$rel"
  fi
done
printf 'Archived: %s\nRestart OpenCode.\n' "$backup"
