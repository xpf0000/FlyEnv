#!/bin/bash
# Linux version of the FlyEnv helper installer (using systemd)

BIN="$1"  # Now only takes the binary path as argument (no plist needed)

SERVICE_NAME="flyenv-helper"
BIN_DEST="/usr/local/bin/flyenv-helper"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

# Remove existing service if it exists
if [ -f "$SERVICE_PATH" ]; then
  echo "Existing service found. Stopping and disabling..."
  sudo systemctl stop "$SERVICE_NAME"
  sudo systemctl disable "$SERVICE_NAME"
  sudo rm -f "$SERVICE_PATH"
fi

# Copy the binary
echo "Installing binary..."
sudo mkdir -p "/usr/local/bin"
echo "Copy $BIN to $BIN_DEST"
sudo cp "$BIN" "$BIN_DEST"
sudo chmod 755 "$BIN_DEST"

# Create systemd service file
echo "Creating systemd service..."
sudo tee "$SERVICE_PATH" > /dev/null <<EOL
[Unit]
Description=FlyEnv Helper Service

[Service]
ExecStart=/usr/local/bin/flyenv-helper
Restart=always
User=root
Group=root

[Install]
WantedBy=multi-user.target
EOL

# Reload systemd and enable service
echo "Enabling service..."
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl start "$SERVICE_NAME"

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to start service. Check journalctl -u $SERVICE_NAME for details"
    exit 1
fi

echo "Installation complete. Service is running."
echo "To check status: sudo systemctl status $SERVICE_NAME"
echo "To view logs: sudo journalctl -u $SERVICE_NAME -f"
