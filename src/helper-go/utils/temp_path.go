package utils

import (
	"os"
	"path/filepath"
)

// WindowsHelperKeyPath uses a stable per-user location rather than TEMP so a
// UAC approval account cannot change the helper's authentication key.
func WindowsHelperKeyPath() string {
	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		localAppData = filepath.Join(os.TempDir(), "FlyEnv")
		return filepath.Join(localAppData, "flyenv-helper.key")
	}
	return filepath.Join(localAppData, "FlyEnv", "flyenv-helper.key")
}
