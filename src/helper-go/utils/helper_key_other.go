//go:build !windows

package utils

import "fmt"

func ReadWindowsHelperKey(path, expectedSID string) ([]byte, error) {
	return nil, fmt.Errorf("Windows helper key is unavailable on this platform")
}
