#!/bin/sh
# Invoked only from AppHelper's root-private verified snapshot. Unsigned sources
# require the separate explicit administrator development bootstrap.
set -eu
umask 077
BIN="$1"
PLIST_SRC="$2"
ROLE="$3"
DATA_ROOT="$4"
LABEL='com.flyenv.helper'
HELPER_DIR='/Library/Application Support/FlyEnv/Helper'
PLIST_PATH='/Library/LaunchDaemons/com.flyenv.helper.plist'
BIN_DEST="$HELPER_DIR/flyenv-helper"

fail() { echo "FlyEnv helper installation failed: $*" >&2; exit 1; }
[ "$(/usr/bin/id -u)" = 0 ] || fail 'administrator authorization is required'
# Do not permit a direct execution of the desktop-writable installer.
case "$0" in /private/var/root/flyenv-helper-install.*/*) ;; *) fail 'installer must run from protected staging' ;; esac
for file in "$0" "$BIN" "$PLIST_SRC"; do
  [ -f "$file" ] && [ ! -L "$file" ] || fail "invalid staged file: $file"
done
/usr/bin/plutil -lint "$PLIST_SRC" >/dev/null
case "$ROLE" in *[!0-9:]*|:*|*:|*:*:*|'') fail 'invalid installation account' ;; esac
case "$ROLE" in *:*) ;; *) fail 'invalid installation account' ;; esac
case "$DATA_ROOT" in /*) ;; *) fail 'data root must be absolute' ;; esac
# Existing authorization assets are not changed until both launchd registration
# and the actual old process have stopped. Errors are required prerequisites.
job_query() {
  if JOB_INFO=$(/bin/launchctl print "system/$LABEL" 2>&1); then
    return 0
  fi
  case "$JOB_INFO" in *'Could not find service'*|*'Could not find specified service'*) return 1 ;; esac
  fail "cannot inspect old helper: $JOB_INFO"
}
if job_query; then
  OLD_PID=$(printf '%s\n' "$JOB_INFO" | /usr/bin/sed -n 's/^[[:space:]]*pid = \([0-9][0-9]*\)$/\1/p')
  /bin/launchctl bootout "system/$LABEL" || fail 'cannot stop existing helper'
  attempt=0
  while :; do
    registered=0
    alive=0
    if job_query; then registered=1; fi
    if [ -n "$OLD_PID" ] && /bin/kill -0 "$OLD_PID" 2>/dev/null; then alive=1; fi
    if [ "$registered" = 0 ] && [ "$alive" = 0 ]; then break; fi
    attempt=$((attempt + 1))
    [ "$attempt" -lt 20 ] || fail 'old helper has not exited; existing authorization assets retained'
    /bin/sleep 0.25
  done
fi

# Go owns policy/key validation and ACLs; no /tmp role or legacy roots.
"$BIN" --install-darwin-policy "$ROLE" "$DATA_ROOT"
# Policy installation validates these FlyEnv-owned directories.
# mkdir(0755) under umask 077 produces 0700; existing directories also retain that
# mode on reinstall. Clients need traversal to reach the UID-readable key.
/bin/chmod 0755 "${HELPER_DIR%/*}" "$HELPER_DIR"
# Publish only the protected verified snapshot, never reopen the desktop source.
/usr/bin/install -o root -g wheel -m 0755 "$BIN" "$BIN_DEST.new"
/bin/mv -f "$BIN_DEST.new" "$BIN_DEST"
/usr/bin/install -o root -g wheel -m 0644 "$PLIST_SRC" "$PLIST_PATH.new"
/bin/mv -f "$PLIST_PATH.new" "$PLIST_PATH"
/bin/launchctl enable "system/$LABEL"
/bin/launchctl bootstrap system "$PLIST_PATH"
echo 'Helper published. FlyEnv will verify the new version and policy health.'
