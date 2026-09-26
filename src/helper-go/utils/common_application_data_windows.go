//go:build windows

package utils

import (
	"fmt"

	"golang.org/x/sys/windows"
)

func commonApplicationDataPath() (string, error) {
	path, err := windows.KnownFolderPath(windows.FOLDERID_ProgramData, 0)
	if err != nil {
		return "", fmt.Errorf("failed to resolve ProgramData known folder: %w", err)
	}
	if path == "" {
		return "", fmt.Errorf("ProgramData known folder resolved to an empty path")
	}
	return path, nil
}
