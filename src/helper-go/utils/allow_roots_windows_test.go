//go:build windows

package utils

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestWindowsAllowedRootsTrustedWriterSIDs(t *testing.T) {
	if !isTrustedWindowsAllowedRootsWriter("S-1-5-18") {
		t.Fatal("SYSTEM should be trusted")
	}
	if !isTrustedWindowsAllowedRootsWriter("S-1-5-32-544") {
		t.Fatal("Administrators should be trusted")
	}
	for _, sid := range []string{"S-1-1-0", "S-1-5-11", "S-1-5-32-545"} {
		if isTrustedWindowsAllowedRootsWriter(sid) {
			t.Fatalf("%s should not be trusted", sid)
		}
	}
}

func TestWindowsAllowedRootsACLRejectsUsersWrite(t *testing.T) {
	if _, err := exec.LookPath("icacls.exe"); err != nil {
		t.Skip("icacls.exe not available")
	}

	dir := t.TempDir()
	file := filepath.Join(dir, "flyenv.allowed-roots")
	if err := os.WriteFile(file, []byte(dir), 0600); err != nil {
		t.Fatal(err)
	}

	cmd := exec.Command("icacls.exe", file, "/inheritance:r", "/grant", "*S-1-5-32-545:W")
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Skipf("failed to prepare ACL with Users write access: %v, output: %s", err, output)
	}

	if err := validateWindowsAllowedRootsObjectSecurity(file); err == nil {
		t.Fatal("Users write access should be rejected")
	}
}
