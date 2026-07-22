package utils

import (
	"path/filepath"
	"testing"
)

func TestWindowsHelperKeyPathPrefersTempOverTmp(t *testing.T) {
	root := t.TempDir()
	tempDir := filepath.Join(root, "temp")
	tmpDir := filepath.Join(root, "tmp")
	t.Setenv("TEMP", tempDir)
	t.Setenv("TMP", tmpDir)

	want := filepath.Join(tempDir, "flyenv-helper.key")
	if got := WindowsHelperKeyPath(); got != want {
		t.Fatalf("WindowsHelperKeyPath() = %q, want %q", got, want)
	}
}
