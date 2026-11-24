#!/bin/sh
# Starts the container process as the unprivileged "runly" user (uid/gid 10001).
#
# Started as root (existing installs, default compose): only the directories
# the process must write are handed to runly when their owner differs (data is
# never modified, only ownership; no chmod), then root is dropped with su-exec
# before anything else runs. Started directly as non-root (compose "user:"),
# nothing is changed. The writable set is fixed here, not taken from input.
set -eu
RUNLY_UID=10001
RUNLY_GID=10001
WRITABLE="/app/modules/custom /app/apps/api/bundles"

if [ "$(id -u)" = "0" ]; then
  for dir in $WRITABLE; do
    mkdir -p "$dir"
    # Fail closed on symlinks or other filesystems: never follow a link out of the volume.
    if [ -L "$dir" ] || [ -n "$(find "$dir" -xdev -type l -print -quit 2>/dev/null)" ]; then
      echo "[Runly] Refusing to change ownership: $dir contains a symbolic link. Remove it and restart." >&2
      exit 1
    fi
    if [ "$(stat -c %u "$dir")" != "$RUNLY_UID" ] || [ -n "$(find "$dir" -xdev \( ! -user "$RUNLY_UID" -o ! -group "$RUNLY_GID" \) -print -quit 2>/dev/null)" ]; then
      echo "[Runly] Handing $dir to uid $RUNLY_UID (one-time ownership change)."
      chown -R -h "$RUNLY_UID:$RUNLY_GID" "$dir"
    fi
  done
  exec su-exec "$RUNLY_UID:$RUNLY_GID" "$@"
fi
exec "$@"
