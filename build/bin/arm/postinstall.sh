#!/bin/zsh
PLIST_SRC="$1"
BIN="$2"

PLIST_PATH="/Library/LaunchDaemons/com.flyenv.helper.plist"
BIN_DEST="/Library/Application Support/FlyEnv/Helper/flyenv-helper"

OS_VERSION=$(sw_vers -productVersion | cut -d. -f1)

# Check if plist file already exists
if [ -f "$PLIST_PATH" ]; then
  echo "Existing plist found. Unloading the existing Launch Daemon..."
  sudo launchctl enable "system/com.flyenv.helper" 2>/dev/null
  if [ "$OS_VERSION" -ge 13 ]; then
    echo "launchctl bootout system \"$PLIST_PATH\""
    sudo launchctl bootout system "$PLIST_PATH" 2>/dev/null
  else
    echo "launchctl unload \"$PLIST_PATH\""
    sudo launchctl unload "$PLIST_PATH" 2>/dev/null
  fi
fi

# Copy the new plist file
echo "Copying new plist file..."
sudo rm -rf "$PLIST_PATH" 2>/dev/null
sudo cp "$PLIST_SRC" "$PLIST_PATH"
sudo mkdir -p "/Library/Application Support/FlyEnv/Helper"
sudo rm -rf "$BIN_DEST" 2>/dev/null
sudo cp "$BIN" "$BIN_DEST"

# Set the correct permissions
sudo chmod 644 "$PLIST_PATH"
sudo chmod 755 "$BIN_DEST"

# Load the new Launch Daemon
echo "Loading new Launch Daemon..."
sudo launchctl enable "system/com.flyenv.helper" 2>/dev/null
if [ "$OS_VERSION" -ge 13 ]; then
  echo "launchctl bootstrap system \"$PLIST_PATH\""
  sudo launchctl bootstrap system "$PLIST_PATH"
else
  echo "launchctl load \"$PLIST_PATH\""
  sudo launchctl load "$PLIST_PATH"
fi

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to load daemon. Please grant permission"
    exit 1
fi

echo "Installation complete."
