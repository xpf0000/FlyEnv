package utils

import (
	"path/filepath"
	"testing"
)

func TestWindowsHelperKeyPathUsesStableLocalAppDataLocation(t *testing.T) {
	root := t.TempDir()
	localAppData := filepath.Join(root, "local-app-data")
	tempDir := filepath.Join(root, "temp")
	t.Setenv("LOCALAPPDATA", localAppData)
	t.Setenv("TEMP", tempDir)

	want := filepath.Join(localAppData, "FlyEnv", "flyenv-helper.key")
	if got := WindowsHelperKeyPath(); got != want {
		t.Fatalf("WindowsHelperKeyPath() = %q, want %q", got, want)
	}
}
