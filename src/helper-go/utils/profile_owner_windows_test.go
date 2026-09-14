//go:build windows

package utils

import (
	"golang.org/x/sys/windows"
	"path/filepath"
	"testing"
)

func TestWindowsProfileRequiresTargetOwnedAncestor(t *testing.T) {
	directory := t.TempDir()
	descriptor, err := windows.GetNamedSecurityInfo(directory, windows.SE_FILE_OBJECT, windows.OWNER_SECURITY_INFORMATION)
	if err != nil {
		t.Fatal(err)
	}
	owner, _, err := descriptor.Owner()
	if err != nil {
		t.Fatal(err)
	}
	target := owner.String()
	profile := filepath.Join(directory, "Redirected Documents", "PowerShell", "Profile.ps1")
	if err := ValidateWindowsProfileOwner(profile, target); err != nil {
		t.Fatal(err)
	}
	if err := ValidateWindowsProfileOwner(profile, "S-1-5-21-100-200-300-500"); err == nil {
		t.Fatal("another user's profile must be rejected")
	}
	if err := ValidateWindowsProfileOwner(profile, ""); err == nil {
		t.Fatal("missing target must fail closed")
	}
}
