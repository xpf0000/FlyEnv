//go:build windows

package utils

import (
	"fmt"
	"os"
	"path/filepath"
	"unsafe"

	"golang.org/x/sys/windows"
)

func validateWindowsKeyACL(dacl *windows.ACL, expectedSID string) error {
	if dacl == nil {
		return fmt.Errorf("helper key has a null DACL")
	}
	header := (*windowsACLHeader)(unsafe.Pointer(dacl))
	offset := unsafe.Sizeof(windowsACLHeader{})
	targetReadable := false
	for i := uint16(0); i < header.ACECount; i++ {
		if offset+unsafe.Sizeof(windowsACEHeader{}) > uintptr(header.ACLSize) {
			return fmt.Errorf("invalid key ACE header")
		}
		ptr := unsafe.Add(unsafe.Pointer(dacl), offset)
		aceHeader := (*windowsACEHeader)(ptr)
		if aceHeader.ACESize < uint16(unsafe.Sizeof(windowsACEHeader{})) || offset+uintptr(aceHeader.ACESize) > uintptr(header.ACLSize) {
			return fmt.Errorf("invalid key ACE size")
		}
		if aceHeader.ACEType != windowsAccessAllowedAceType {
			return fmt.Errorf("unsupported helper key ACE type")
		}
		if aceHeader.ACESize < uint16(unsafe.Sizeof(windowsAccessAllowedACE{})) {
			return fmt.Errorf("invalid helper key ACE")
		}
		ace := (*windowsAccessAllowedACE)(ptr)
		sid := (*windows.SID)(unsafe.Pointer(&ace.SidStart))
		if !sid.IsValid() {
			return fmt.Errorf("invalid key ACL SID")
		}
		value := sid.String()
		if !isTrustedWindowsAllowedRootsWriter(value) {
			if value != expectedSID {
				return fmt.Errorf("helper key grants access to unrelated SID %s", value)
			}
			if ace.Mask&windowsAllowedRootsWriteMask != 0 {
				return fmt.Errorf("target SID must not write helper key")
			}
			targetReadable = ace.Mask&windows.FILE_READ_DATA != 0
		}
		offset += uintptr(aceHeader.ACESize)
	}
	if !targetReadable {
		return fmt.Errorf("helper key is inaccessible to target SID")
	}
	return nil
}

func ReadWindowsHelperKey(path, expectedSID string) ([]byte, error) {
	if _, err := windows.StringToSid(expectedSID); err != nil {
		return nil, fmt.Errorf("invalid expected SID: %w", err)
	}
	if !filepath.IsAbs(path) {
		return nil, fmt.Errorf("helper key path must be absolute")
	}
	for candidate := path; ; candidate = filepath.Dir(candidate) {
		info, err := os.Lstat(candidate)
		if err != nil {
			return nil, fmt.Errorf("helper key missing or inaccessible: %w", err)
		}
		if err := rejectWindowsReparsePoint("key path", candidate, info); err != nil {
			return nil, err
		}
		if parent := filepath.Dir(candidate); parent == candidate {
			break
		}
	}
	sd, err := windows.GetNamedSecurityInfo(path, windows.SE_FILE_OBJECT, windows.OWNER_SECURITY_INFORMATION|windows.DACL_SECURITY_INFORMATION)
	if err != nil {
		return nil, fmt.Errorf("helper key ACL inaccessible: %w", err)
	}
	owner, _, err := sd.Owner()
	if err != nil || owner == nil || !isTrustedWindowsAllowedRootsWriter(owner.String()) {
		return nil, fmt.Errorf("helper key owner must be SYSTEM or Administrators")
	}
	control, _, err := sd.Control()
	if err != nil || control&windows.SE_DACL_PROTECTED == 0 {
		return nil, fmt.Errorf("helper key ACL inheritance must be disabled")
	}
	dacl, _, err := sd.DACL()
	if err != nil {
		return nil, err
	}
	if err := validateWindowsKeyACL(dacl, expectedSID); err != nil {
		return nil, err
	}
	key, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("helper key read failed: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("helper key must contain exactly 32 bytes")
	}
	return key, nil
}
