//go:build windows

package utils

import "fmt"

// ValidateWindowsHelperHealth confirms that the helper will not fall back to
// unconfigured paths after it has accepted a Windows installation.
func ValidateWindowsHelperHealth() error {
	configured := readConfiguredAllowedRoots()
	if !configured.filePresent {
		return fmt.Errorf("configured allowed roots file is missing")
	}
	if len(configured.roots) == 0 {
		return fmt.Errorf("configured allowed roots file has no trusted roots")
	}
	return nil
}
