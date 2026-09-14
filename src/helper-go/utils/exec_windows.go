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
	"golang.org/x/sys/windows"
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
			(r >= '0' && r <= '9') || r == '_' || r == '-' || r == '.' {
			result.WriteRune(r)
		} else {
			result.WriteRune('_')
		}
	}
	return result.String()
}

func CurrentUserSID() (string, error) {
	token, err := windows.OpenCurrentProcessToken()
	if err != nil {
		return "", err
	}
	defer token.Close()

	user, err := token.GetTokenUser()
	if err != nil {
		return "", err
	}

	sid := user.User.Sid.String()
	return sid, nil
}

func CreateWindowsNamedPipe(SOCKET_PATH string, expectedSID string) (net.Listener, error) {
	pipeName := GetPipeNameFromSocketPath(SOCKET_PATH)
	fullPipePath := `\\.\pipe\` + pipeName

	sid, err := windows.StringToSid(expectedSID)
	if err != nil {
		return nil, fmt.Errorf("invalid expected user SID: %w", err)
	}

	// SYSTEM creates the pipe; only the target user's OS token may submit requests.
	sddl := fmt.Sprintf("D:P(A;;GA;;;SY)(A;;GRGW;;;%s)", sid.String())

	// Configure the named pipe
	pipeConfig := &winio.PipeConfig{
		SecurityDescriptor: sddl,
		MessageMode:        true, // Message mode for reliable message boundaries
		InputBufferSize:    65536,
		OutputBufferSize:   65536,
	}

	// Create and listen on the named pipe
	listener, err := winio.ListenPipe(fullPipePath, pipeConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to listen on named pipe '%s': %w", fullPipePath, err)
	}

	return listener, nil
}
