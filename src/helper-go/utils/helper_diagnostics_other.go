//go:build !windows

package utils

import (
	"fmt"
	"os"
	"path/filepath"
	"syscall"
)

func validateHelperDiagnosticsDirectory(path string) error {
	if !filepath.IsAbs(path) {
		return fmt.Errorf("helper diagnostics directory must be absolute")
	}
	for current := filepath.Clean(path); ; current = filepath.Dir(current) {
		info, err := os.Lstat(current)
		if err != nil {
			return fmt.Errorf("failed to inspect helper diagnostics directory: %w", err)
		}
		if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("helper diagnostics directory contains a reparse or symlink component: %s", current)
		}
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
	}
	return nil
}

func validateDiagnosticFile(path string) error {
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("helper diagnostics file is not a regular file: %s", path)
	}
	if stat, ok := info.Sys().(*syscall.Stat_t); ok && stat.Nlink > 1 {
		return fmt.Errorf("helper diagnostics file has multiple hard links: %s", path)
	}
	return nil
}

func removeDiagnosticFile(path string) error {
	if err := validateDiagnosticFile(path); err != nil {
		return err
	}
	return os.Remove(path)
}

func openDiagnosticFile(path string) (*os.File, error) {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_APPEND, 0600)
	if err != nil {
		return nil, err
	}
	if err := validateDiagnosticFile(path); err != nil {
		file.Close()
		return nil, err
	}
	return file, nil
}
