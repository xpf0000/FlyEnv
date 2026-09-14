package utils

import (
	"path/filepath"
	"testing"
)

func TestValidateWindowsHelperHealthRequiresConfiguredAllowedRoots(t *testing.T) {
	previous := allowedRootsFilePathForTesting
	defer func() { allowedRootsFilePathForTesting = previous }()
	allowedRootsFilePathForTesting = filepath.Join(t.TempDir(), "flyenv.allowed-roots")

	if err := ValidateWindowsHelperHealth(); err == nil {
		t.Fatal("missing configured allowed roots must fail helper health validation")
	}
}

func TestConfiguredWindowsHelperUsesInstanceAllowedRoots(t *testing.T) {
	previous := allowedRootsFilePathForTesting
	previousConfigured := windowsHelperAllowedRootsPath
	defer func() {
		allowedRootsFilePathForTesting = previous
		windowsHelperAllowedRootsPath = previousConfigured
	}()
	paths, err := WindowsHelperInstancePaths(`C:\ProgramData`, "S-1-5-21-100-200-300-400")
	if err != nil {
		t.Fatal(err)
	}
	ConfigureWindowsHelperInstance(paths)
	if got := allowedRootsFilePath(); got != paths.AllowedRootsPath {
		t.Fatalf("allowed roots path = %q, want %q", got, paths.AllowedRootsPath)
	}
}

func TestWindowsHelperDoesNotFallBackToMachineWideAllowedRoots(t *testing.T) {
	previousTest := allowedRootsFilePathForTesting
	previousConfigured := windowsHelperAllowedRootsPath
	defer func() {
		allowedRootsFilePathForTesting = previousTest
		windowsHelperAllowedRootsPath = previousConfigured
	}()
	allowedRootsFilePathForTesting = ""
	windowsHelperAllowedRootsPath = ""
	if got := allowedRootsFilePath(); got != "" {
		t.Fatalf("unconfigured Windows helper used machine-wide allowed roots: %q", got)
	}
}
