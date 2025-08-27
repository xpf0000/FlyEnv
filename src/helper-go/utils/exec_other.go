//go:build !windows

package utils

import (
	"net"
	"os/exec"
)

// SetHideWindow 非 Windows 平台空实现
func SetHideWindow(cmd *exec.Cmd) {}

// getPipeNameFromSocketPath extracts a valid pipe name from socket path
func GetPipeNameFromSocketPath(socketPath string) string {
	return socketPath
}

func CreateWindowsNamedPipe(SOCKET_PATH string) (net.Listener, error) {
	return nil, nil
}
