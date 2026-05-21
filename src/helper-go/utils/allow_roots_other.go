//go:build !linux && !darwin && !windows

package utils

import "os"

func validateAllowedRootsFileSecurity(path string, info os.FileInfo) error {
	return nil
}
