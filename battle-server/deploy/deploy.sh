#!/usr/bin/env bash
set -euo pipefail

usage() { echo "usage: $0 <ssh-host> [--dry-run]" >&2; exit 2; }
[[ $# -ge 1 && $# -le 2 ]] || usage
SSH_HOST=$1
DRY_RUN=0
if [[ $# -eq 2 ]]; then [[ $2 == "--dry-run" ]] || usage; DRY_RUN=1; fi
[[ $SSH_HOST =~ ^[A-Za-z0-9_.@-]+$ ]] || { echo "invalid SSH host alias" >&2; exit 2; }

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/../.." && pwd)
RSYNC_FLAGS=(-a --human-readable --exclude=/tests/ --chown=root:root --chmod=D755,F644)
if [[ $DRY_RUN -eq 1 ]]; then RSYNC_FLAGS+=(--dry-run --itemize-changes); fi

rsync "${RSYNC_FLAGS[@]}" --rsync-path="sudo rsync" "$REPO_ROOT/battle-server/" "$SSH_HOST:/opt/battleweld/battle-server/"
rsync "${RSYNC_FLAGS[@]}" --rsync-path="sudo rsync" "$REPO_ROOT/arc/sim.js" "$REPO_ROOT/arc/battle.js" "$SSH_HOST:/opt/battleweld/arc/"
if [[ $DRY_RUN -eq 0 ]]; then
	ssh "$SSH_HOST" 'sudo systemctl restart battleweld || exit $?
	for attempt in 1 2 3 4 5 6 7 8 9 10; do
		if curl --fail --silent http://127.0.0.1:8899/health; then exit 0; fi
		sleep 1
	done
	echo "Battle Weld health check failed after 10 retries" >&2
	exit 1'
fi
