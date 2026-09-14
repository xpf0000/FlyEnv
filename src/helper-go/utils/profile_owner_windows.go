//go:build windows

package utils

import (
	"fmt"
	"golang.org/x/sys/windows"
	"os"
	"path/filepath"
)

// Require an existing profile ancestor to belong to the authenticated
// target. This also supports Documents redirected outside the user's home.
func ValidateWindowsProfileOwner(path, targetSID string) error {
	if targetSID == "" {
		return fmt.Errorf("missing target SID for PowerShell profile")
	}
	candidate := filepath.Dir(path)
	for {
		if _, err := os.Lstat(candidate); err == nil {
			sd, err := windows.GetNamedSecurityInfo(candidate, windows.SE_FILE_OBJECT, windows.OWNER_SECURITY_INFORMATION)
			if err != nil {
				return err
			}
			owner, _, err := sd.Owner()
			if err != nil || owner == nil {
				return fmt.Errorf("could not read profile ancestor owner")
			}
			if owner.String() == targetSID {
				return nil
			}
		} else if !os.IsNotExist(err) {
			return err
		}
		parent := filepath.Dir(candidate)
		if parent == candidate {
			return fmt.Errorf("no target-owned profile ancestor: %s", path)
		}
		candidate = parent
	}
}
