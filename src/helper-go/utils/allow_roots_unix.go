//go:build linux || darwin

package utils

import (
	"fmt"
	"os"
	"syscall"
)

func validateAllowedRootsFileSecurity(path string, info os.FileInfo) error {
	if info.Mode().Perm()&0022 != 0 {
		return fmt.Errorf("file is writable by group or others")
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return fmt.Errorf("failed to inspect file owner")
	}
	if stat.Uid != 0 {
		return fmt.Errorf("file is not owned by root")
	}
	return nil
}
