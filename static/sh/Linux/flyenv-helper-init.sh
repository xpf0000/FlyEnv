#!/bin/bash
# Runs only during explicitly authorized installation/maintenance.
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
[ "$(id -u)" = 0 ] || { echo 'Run this installer as root'; exit 1; }
BIN="$1"
ROLE="$2"
DATA_PATH="$3"
CA_PATH="${5:-}"
CA_FINGERPRINT="${6:-}"
SERVICE_NAME=flyenv-helper
BIN_DEST=/usr/local/bin/flyenv-helper
SERVICE_PATH=/etc/systemd/system/flyenv-helper.service

check_directory() {
  local path="$1" owner mode
  [ -d "$path" ] && [ ! -L "$path" ] || { echo "Unsafe install directory: $path"; exit 1; }
  owner=$(stat -c %u "$path")
  mode=$(stat -c %a "$path")
  [ "$owner" = 0 ] && (( (8#$mode & 0022) == 0 )) || { echo "Unprotected install directory: $path"; exit 1; }
}

stop_existing_helper() {
  local load_state state pid
  load_state=$(systemctl show "$SERVICE_NAME" --property=LoadState --value) || return 1
  if [ "$load_state" = not-found ]; then return 0; fi
  systemctl stop "$SERVICE_NAME" || return 1
  state=$(systemctl show "$SERVICE_NAME" --property=ActiveState --value) || return 1
  pid=$(systemctl show "$SERVICE_NAME" --property=MainPID --value) || return 1
  if { [ "$state" != inactive ] && [ "$state" != failed ]; } || [ "$pid" != 0 ]; then
    echo 'Existing FlyEnv helper did not stop; installation aborted' >&2
    return 1
  fi
}
for directory in / /usr /usr/local /usr/local/bin /etc /etc/systemd /etc/systemd/system; do
  check_directory "$directory"
done
if [ -e /etc/flyenv-helper ] || [ -L /etc/flyenv-helper ]; then check_directory /etc/flyenv-helper; fi

install -d -o root -g root -m 0755 /usr/local/bin /etc/flyenv-helper
TEMP_BIN=$(mktemp /usr/local/bin/.flyenv-helper.XXXXXX)
trap 'rm -f "$TEMP_BIN"' EXIT
install -o root -g root -m 0755 "$BIN" "$TEMP_BIN"
stop_existing_helper
"$TEMP_BIN" --install-linux-policy "$ROLE" "$DATA_PATH" "$CA_PATH" "$CA_FINGERPRINT"
mv -T "$TEMP_BIN" "$BIN_DEST"

TEMP_UNIT=$(mktemp /etc/systemd/system/.flyenv-helper.XXXXXX)
cat > "$TEMP_UNIT" <<'UNIT'
[Unit]
Description=FlyEnv limited privileged helper
After=local-fs.target

[Service]
ExecStart=/usr/local/bin/flyenv-helper
Restart=on-failure
User=root
Group=root
UMask=0077
RuntimeDirectory=flyenv-helper
RuntimeDirectoryMode=0755
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
UNIT
chmod 0644 "$TEMP_UNIT"
mv -T "$TEMP_UNIT" "$SERVICE_PATH"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl start "$SERVICE_NAME"
echo 'Installed: fixed hosts editing, user service low-port binding, root Pure-Ftpd, PID directory repair.'
if [ -n "$CA_PATH" ]; then echo 'Approved the supplied public development CA snapshot.'; fi
