package utils

import (
	"os"
	"path/filepath"
)

// WindowsHelperKeyPath follows Node's Windows TEMP-before-TMP precedence.
func WindowsHelperKeyPath() string {
	tempDir := os.Getenv("TEMP")
	if tempDir == "" {
		tempDir = os.TempDir()
	}
	return filepath.Join(tempDir, "flyenv-helper.key")
}
