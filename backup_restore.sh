#!/usr/bin/env bash
# Forwarding wrapper to scripts/backup_restore.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/scripts/backup_restore.sh" "$@"
