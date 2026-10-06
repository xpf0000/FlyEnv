package utils

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
)

var windowsSIDPattern = regexp.MustCompile(`(?i)^S-1-(?:\d+-)+\d+$`)

type WindowsHelperPaths struct {
	InstanceID         string
	InstanceRoot       string
	Executable         string
	KeyPath            string
	AllowedRootsPath   string
	InstanceConfigPath string
	DiagnosticsPath    string
	PipeName           string
}

func WindowsHelperInstanceID(sid string) (string, error) {
	canonicalSID := strings.ToUpper(strings.TrimSpace(sid))
	if !windowsSIDPattern.MatchString(canonicalSID) {
		return "", fmt.Errorf("invalid Windows SID")
	}
	sum := sha256.Sum256([]byte(canonicalSID))
	return hex.EncodeToString(sum[:])[:32], nil
}

func WindowsHelperInstancePaths(programData, sid string) (WindowsHelperPaths, error) {
	instanceID, err := WindowsHelperInstanceID(sid)
	if err != nil {
		return WindowsHelperPaths{}, err
	}
	// 每 SID SYSTEM 实例只能部署到完整本机路径；不能以 UNC、设备路径、ADS 或
	// 含穿越/尾点的字符串构造实例。实际运行仍使用 ProgramData known-folder API。
	if err := ValidateWindowsAbsolutePath(programData, false); err != nil {
		return WindowsHelperPaths{}, fmt.Errorf("ProgramData must be a full local Windows path: %w", err)
	}
	instanceRoot := filepath.Join(programData, "FlyEnv", "Helper", "users", instanceID)
	return WindowsHelperPaths{
		InstanceID:         instanceID,
		InstanceRoot:       instanceRoot,
		Executable:         filepath.Join(instanceRoot, "bin", "flyenv-helper.exe"),
		KeyPath:            filepath.Join(instanceRoot, "helper.key"),
		AllowedRootsPath:   filepath.Join(instanceRoot, "allowed-roots"),
		InstanceConfigPath: filepath.Join(instanceRoot, "instance.json"),
		DiagnosticsPath:    filepath.Join(instanceRoot, "startup.log"),
		PipeName:           "FlyEnv.Helper." + instanceID,
	}, nil
}

func CurrentWindowsHelperInstancePaths(sid string) (WindowsHelperPaths, error) {
	programData, err := commonApplicationDataPath()
	if err != nil {
		return WindowsHelperPaths{}, err
	}
	return WindowsHelperInstancePaths(programData, sid)
}

// The expected SID is captured by FlyEnv before UAC, never the helper's SYSTEM token.
func WindowsHelperPeerAllowed(expectedSID, peerSID string) bool {
	return expectedSID != "" && peerSID != "" && strings.EqualFold(expectedSID, peerSID)
}
