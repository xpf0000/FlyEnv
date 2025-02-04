#!/bin/zsh

PLIST_PATH="/Library/LaunchDaemons/com.flyenv.helper.plist"
PLIST_SRC="/Applications/FlyEnv.app/Contents/Resources/plist/com.flyenv.helper.plist"

# Check if plist file already exists
if [ -f "$PLIST_PATH" ]; then
  echo "Existing plist found. Unloading the existing Launch Daemon..."
  sudo launchctl unload "$PLIST_PATH"
fi

# Copy the new plist file
echo "Copying new plist file..."
sudo cp "$PLIST_SRC" "$PLIST_PATH"

# Set the correct permissions
sudo chmod 644 "$PLIST_PATH"

# Load the new Launch Daemon
echo "Loading new Launch Daemon..."
sudo launchctl load "$PLIST_PATH"

echo "Installation complete."
