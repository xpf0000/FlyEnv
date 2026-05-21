//go:build windows

package utils

import (
	"fmt"
	"os"
	"path/filepath"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	windowsAccessAllowedAceType               = 0x00
	windowsAccessAllowedObjectAceType         = 0x05
	windowsAccessAllowedCallbackAceType       = 0x09
	windowsAccessAllowedCallbackObjectAceType = 0x0b
)

const windowsAllowedRootsWriteMask uint32 = uint32(
	windows.GENERIC_WRITE |
		windows.GENERIC_ALL |
		windows.WRITE_DAC |
		windows.WRITE_OWNER |
		windows.DELETE |
		windows.FILE_WRITE_DATA |
		windows.FILE_APPEND_DATA |
		windows.FILE_WRITE_EA |
		windows.FILE_WRITE_ATTRIBUTES,
)

type windowsACLHeader struct {
	ACLRevision byte
	Sbz1        byte
	ACLSize     uint16
	ACECount    uint16
	Sbz2        uint16
}

type windowsACEHeader struct {
	ACEType  byte
	ACEFlags byte
	ACESize  uint16
}

type windowsAccessAllowedACE struct {
	Header   windowsACEHeader
	Mask     uint32
	SidStart uint32
}

func validateAllowedRootsFileSecurity(path string, info os.FileInfo) error {
	if !pathEqual(path, allowedRootsFilePath()) {
		return fmt.Errorf("allowed roots file is outside the protected ProgramData path")
	}
	if err := rejectWindowsReparsePoint("file", path, info); err != nil {
		return err
	}

	dir := filepath.Dir(path)
	dirInfo, err := os.Lstat(dir)
	if err != nil {
		return fmt.Errorf("failed to inspect allowed roots directory: %w", err)
	}
	if !dirInfo.IsDir() {
		return fmt.Errorf("allowed roots parent is not a directory: %s", dir)
	}
	if err := rejectWindowsReparsePoint("directory", dir, dirInfo); err != nil {
		return err
	}

	if err := validateWindowsAllowedRootsObjectSecurity(dir); err != nil {
		return fmt.Errorf("unsafe allowed roots directory ACL: %w", err)
	}
	if err := validateWindowsAllowedRootsObjectSecurity(path); err != nil {
		return fmt.Errorf("unsafe allowed roots file ACL: %w", err)
	}
	return nil
}

func rejectWindowsReparsePoint(kind, path string, info os.FileInfo) error {
	data, ok := info.Sys().(*syscall.Win32FileAttributeData)
	if !ok {
		return fmt.Errorf("failed to inspect %s attributes: %s", kind, path)
	}
	if data.FileAttributes&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 {
		return fmt.Errorf("allowed roots %s is a reparse point: %s", kind, path)
	}
	return nil
}

func validateWindowsAllowedRootsObjectSecurity(path string) error {
	sd, err := windows.GetNamedSecurityInfo(
		path,
		windows.SE_FILE_OBJECT,
		windows.OWNER_SECURITY_INFORMATION|windows.DACL_SECURITY_INFORMATION,
	)
	if err != nil {
		return fmt.Errorf("failed to read security descriptor: %w", err)
	}

	owner, _, err := sd.Owner()
	if err != nil {
		return fmt.Errorf("failed to read owner: %w", err)
	}
	if owner == nil || !isTrustedWindowsAllowedRootsWriter(owner.String()) {
		return fmt.Errorf("owner must be Administrators or SYSTEM")
	}

	dacl, _, err := sd.DACL()
	if err != nil {
		return fmt.Errorf("failed to read DACL: %w", err)
	}
	if dacl == nil {
		return fmt.Errorf("nil DACL grants unrestricted access")
	}
	if sid, err := windowsACLUnsafeWriter(dacl); err != nil {
		return err
	} else if sid != "" {
		return fmt.Errorf("untrusted SID %s has write access", sid)
	}
	return nil
}

func isTrustedWindowsAllowedRootsWriter(sid string) bool {
	return sid == "S-1-5-18" || sid == "S-1-5-32-544"
}

func windowsACLUnsafeWriter(dacl *windows.ACL) (string, error) {
	base := unsafe.Pointer(dacl)
	header := (*windowsACLHeader)(unsafe.Pointer(dacl))
	offset := unsafe.Sizeof(windowsACLHeader{})
	end := uintptr(header.ACLSize)

	for i := uint16(0); i < header.ACECount; i++ {
		if offset+unsafe.Sizeof(windowsACEHeader{}) > end {
			return "", fmt.Errorf("invalid ACE header at index %d", i)
		}
		acePtr := unsafe.Add(base, offset)
		aceHeader := (*windowsACEHeader)(acePtr)
		if aceHeader.ACESize < uint16(unsafe.Sizeof(windowsACEHeader{})) ||
			offset+uintptr(aceHeader.ACESize) > end {
			return "", fmt.Errorf("invalid ACE size at index %d", i)
		}

		switch aceHeader.ACEType {
		case windowsAccessAllowedAceType:
			if aceHeader.ACESize < uint16(unsafe.Sizeof(windowsAccessAllowedACE{})) {
				return "", fmt.Errorf("invalid access allowed ACE at index %d", i)
			}
			ace := (*windowsAccessAllowedACE)(acePtr)
			if ace.Mask&windowsAllowedRootsWriteMask != 0 {
				sid := (*windows.SID)(unsafe.Pointer(&ace.SidStart))
				if !sid.IsValid() {
					return "", fmt.Errorf("invalid ACE SID at index %d", i)
				}
				sidString := sid.String()
				if !isTrustedWindowsAllowedRootsWriter(sidString) {
					return sidString, nil
				}
			}
		case windowsAccessAllowedObjectAceType,
			windowsAccessAllowedCallbackAceType,
			windowsAccessAllowedCallbackObjectAceType:
			return "", fmt.Errorf("unsupported access allowed ACE type %d", aceHeader.ACEType)
		}

		offset += uintptr(aceHeader.ACESize)
	}
	return "", nil
}
