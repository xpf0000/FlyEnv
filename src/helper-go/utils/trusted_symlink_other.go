//go:build !linux

package utils

import "os"

func isTrustedSystemSymlinkComponent(_ string, _ os.FileInfo) bool {
	return false
}
