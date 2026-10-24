#!/bin/sh
# Invoked only from AppHelper's root-private resource copies. Unsigned sources
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
# Initialize only missing directories; existing ownership, modes and ACLs belong
# to the administrator. New directories must allow clients to traverse to the key.
for directory in "${HELPER_DIR%/*}" "$HELPER_DIR"; do
  if [ ! -e "$directory" ] && [ ! -L "$directory" ]; then
    /usr/bin/install -d -o root -g wheel -m 0755 "$directory"
  fi
done
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
  while :; do
    registered=0
    alive=0
    if job_query; then registered=1; fi
    if [ -n "$OLD_PID" ] && /bin/kill -0 "$OLD_PID" 2>/dev/null; then alive=1; fi
    if [ "$registered" = 0 ] && [ "$alive" = 0 ]; then break; fi
    /bin/sleep 0.25
  done
fi

# Go owns policy/key validation and ACLs; no /tmp role or legacy roots.
"$BIN" --install-darwin-policy "$ROLE" "$DATA_ROOT"
# Normalize the new policy file, not the user's directory ACL. Otherwise an
# inherited allow entry can make the file fail its own integrity check on start.
/bin/chmod -N "$HELPER_DIR/policy.json"
# Publish the private copies without reopening the desktop source.
/usr/bin/install -o root -g wheel -m 0755 "$BIN" "$BIN_DEST.new"
/bin/mv -f "$BIN_DEST.new" "$BIN_DEST"
/usr/bin/install -o root -g wheel -m 0644 "$PLIST_SRC" "$PLIST_PATH.new"
/bin/mv -f "$PLIST_PATH.new" "$PLIST_PATH"
# /usr/bin/install propagates the source's com.apple.quarantine xattr (an app
# bundle installed from a DMG is quarantined), and launchd refuses to bootstrap
# a quarantined LaunchDaemon ("Bootstrap failed: 5: Input/output error"). Clear
# the flag from the published files before registering the job.
/usr/bin/xattr -dr com.apple.quarantine "$BIN_DEST" "$PLIST_PATH" 2>/dev/null || true
/bin/launchctl enable "system/$LABEL"
/bin/launchctl bootstrap system "$PLIST_PATH"
echo 'Helper published. FlyEnv will verify the new version and policy health.'
