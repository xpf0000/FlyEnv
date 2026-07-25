//go:build windows

package utils

import "golang.org/x/sys/windows"

func commonApplicationDataPath() string {
	path, err := windows.KnownFolderPath(windows.FOLDERID_ProgramData, 0)
	if err == nil && path != "" {
		return path
	}
	return `C:\ProgramData`
}
