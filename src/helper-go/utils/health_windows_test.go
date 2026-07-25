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
