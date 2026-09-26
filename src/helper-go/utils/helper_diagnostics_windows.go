//go:build windows

package utils

import (
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows"
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
		if !info.IsDir() {
			return fmt.Errorf("helper diagnostics path is not a directory: %s", current)
		}
		if err := rejectWindowsReparsePoint("helper diagnostics directory", current, info); err != nil {
			return err
		}
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
	}
	sd, err := windows.GetNamedSecurityInfo(path, windows.SE_FILE_OBJECT, windows.OWNER_SECURITY_INFORMATION|windows.DACL_SECURITY_INFORMATION)
	if err != nil {
		return fmt.Errorf("helper diagnostics directory ACL inaccessible: %w", err)
	}
	owner, _, err := sd.Owner()
	if err != nil || owner == nil || !isTrustedWindowsAllowedRootsWriter(owner.String()) {
		return fmt.Errorf("helper diagnostics directory owner must be SYSTEM or Administrators")
	}
	control, _, err := sd.Control()
	if err != nil || control&windows.SE_DACL_PROTECTED == 0 {
		return fmt.Errorf("helper diagnostics directory ACL inheritance must be disabled")
	}
	dacl, _, err := sd.DACL()
	if err != nil {
		return fmt.Errorf("helper diagnostics directory DACL inaccessible: %w", err)
	}
	if dacl == nil {
		return fmt.Errorf("helper diagnostics directory has a null DACL")
	}
	if sid, err := windowsACLUnsafeWriter(dacl); err != nil {
		return err
	} else if sid != "" {
		return fmt.Errorf("helper diagnostics directory grants write access to %s", sid)
	}
	return nil
}

func validateDiagnosticFile(path string) error {
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("helper diagnostics file is not regular: %s", path)
	}
	return nil
}

func removeDiagnosticFile(path string) error {
	if err := validateDiagnosticFile(path); err != nil {
		return err
	}
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if err := rejectWindowsReparsePoint("helper diagnostics file", path, info); err != nil {
		return err
	}
	if err := ensureWindowsDiagnosticFileHasSingleLink(path); err != nil {
		return err
	}
	return os.Remove(path)
}

func openDiagnosticFile(path string) (*os.File, error) {
	handle, err := windows.CreateFile(
		windows.StringToUTF16Ptr(path),
		windows.FILE_APPEND_DATA|windows.FILE_READ_ATTRIBUTES,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE,
		nil,
		windows.OPEN_ALWAYS,
		windows.FILE_ATTRIBUTE_NORMAL|windows.FILE_FLAG_OPEN_REPARSE_POINT,
		0,
	)
	if err != nil {
		return nil, err
	}
	file := os.NewFile(uintptr(handle), path)
	if file == nil {
		_ = windows.CloseHandle(handle)
		return nil, fmt.Errorf("failed to wrap helper diagnostics handle")
	}
	if err := validateWindowsDiagnosticHandle(handle); err != nil {
		file.Close()
		return nil, err
	}
	return file, nil
}

func validateWindowsDiagnosticHandle(handle windows.Handle) error {
	var info windows.ByHandleFileInformation
	if err := windows.GetFileInformationByHandle(handle, &info); err != nil {
		return err
	}
	if info.FileAttributes&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 {
		return fmt.Errorf("helper diagnostics file is a reparse point")
	}
	if info.NumberOfLinks > 1 {
		return fmt.Errorf("helper diagnostics file has multiple hard links")
	}
	return nil
}

func ensureWindowsDiagnosticFileHasSingleLink(path string) error {
	handle, err := windows.CreateFile(
		windows.StringToUTF16Ptr(path),
		windows.FILE_READ_ATTRIBUTES,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE,
		nil,
		windows.OPEN_EXISTING,
		windows.FILE_ATTRIBUTE_NORMAL|windows.FILE_FLAG_OPEN_REPARSE_POINT,
		0,
	)
	if err != nil {
		return err
	}
	defer windows.CloseHandle(handle)
	return validateWindowsDiagnosticHandle(handle)
}
