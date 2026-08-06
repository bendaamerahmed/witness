#!/usr/bin/env bash
# Prints the active witness level, or nothing at all when it is off.
set -u
STATE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.witness-active"
[ -f "$STATE" ] || exit 0
MODE="$(tr -d '[:space:]' < "$STATE")"
[ -n "$MODE" ] || exit 0
case "$MODE" in
  off) exit 0 ;;
  full) LABEL="[WITNESS]" ;;
  ultra) LABEL="[WITNESS:ULTRA]" ;;
  *) LABEL="[WITNESS:$(printf '%s' "$MODE" | tr '[:lower:]' '[:upper:]')]" ;;
esac
if [ "$MODE" = "ultra" ]; then COLOR=173; else COLOR=109; fi
printf '\033[38;5;%sm%s\033[0m' "$COLOR" "$LABEL"
