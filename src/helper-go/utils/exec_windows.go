//go:build windows

package utils

import (
	"fmt"
	"net"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/Microsoft/go-winio"
)

// SetHideWindow 设置 Windows 下的 HideWindow 属性
func SetHideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow: true,
	}
}

// getPipeNameFromSocketPath extracts a valid pipe name from socket path
func GetPipeNameFromSocketPath(socketPath string) string {
	// On Windows, use the base name of the socket path as pipe name
	// Remove any invalid characters for Windows pipe names
	baseName := filepath.Base(socketPath)
	// Replace any non-alphanumeric characters (except underscore) with underscore
	var result strings.Builder
	for _, r := range baseName {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') || r == '_' || r == '-' {
			result.WriteRune(r)
		} else {
			result.WriteRune('_')
		}
	}
	return result.String()
}

func CreateWindowsNamedPipe(SOCKET_PATH string) (net.Listener, error) {
	pipeName := GetPipeNameFromSocketPath(SOCKET_PATH)
	fullPipePath := `\\.\pipe\` + pipeName

	// Configure the named pipe
	pipeConfig := &winio.PipeConfig{
		SecurityDescriptor: "D:P(A;;GA;;;WD)", // Allow generic all access to everyone
		MessageMode:        true,              // Message mode for reliable message boundaries
		InputBufferSize:    65536,             // 64KB input buffer
		OutputBufferSize:   65536,             // 64KB output buffer
	}

	// Create and listen on the named pipe
	listener, err := winio.ListenPipe(fullPipePath, pipeConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to listen on named pipe '%s': %w", fullPipePath, err)
	}

	return listener, nil
}
