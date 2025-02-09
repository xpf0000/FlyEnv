#!/bin/zsh
PLIST_SRC="$1"
BIN="$2"
SCRIPT="$3"

PLIST_PATH="/Library/LaunchDaemons/com.flyenv.helper.plist"
BIN_DEST="/Library/Application Support/FlyEnv/Helper/flyenv-helper"
SCRIPT_DEST="/Library/Application Support/FlyEnv/Helper/helper.js"

# Check if plist file already exists
if [ -f "$PLIST_PATH" ]; then
  echo "Existing plist found. Unloading the existing Launch Daemon..."
  sudo launchctl unload "$PLIST_PATH"
fi

# Copy the new plist file
echo "Copying new plist file..."
sudo rm -rf "$PLIST_PATH"
sudo cp "$PLIST_SRC" "$PLIST_PATH"
mkdir -p "/Library/Application Support/FlyEnv/Helper"
sudo cp "$BIN" "$BIN_DEST"
sudo rm -rf "$SCRIPT_DEST"
sudo cp "$SCRIPT" "$SCRIPT_DEST"

# Set the correct permissions
sudo chmod 644 "$PLIST_PATH"
sudo chmod 755 "$BIN_DEST"
sudo chmod 755 "$SCRIPT_DEST"

# Load the new Launch Daemon
echo "Loading new Launch Daemon..."
sudo launchctl load "$PLIST_PATH"

echo "Installation complete."
