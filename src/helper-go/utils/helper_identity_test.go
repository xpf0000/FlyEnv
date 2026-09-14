package utils

import (
	"path/filepath"
	"testing"
)

func TestWindowsHelperTargetAuthorization(t *testing.T) {
	target := "S-1-5-21-100-200-300-400"
	admin := "S-1-5-21-100-200-300-500"
	for _, tc := range []struct {
		peer    string
		allowed bool
	}{
		{target, true}, {admin, false}, {"S-1-5-18", false}, {"", false},
	} {
		if got := WindowsHelperPeerAllowed(target, tc.peer); got != tc.allowed {
			t.Fatalf("peer %s allowed=%v, want %v", tc.peer, got, tc.allowed)
		}
	}
	if WindowsHelperPeerAllowed("", "") {
		t.Fatal("empty expected SID must fail closed")
	}
}

func TestWindowsHelperInstanceIdentity(t *testing.T) {
	sid := "S-1-5-21-100-200-300-400"
	instanceID, err := WindowsHelperInstanceID(sid)
	if err != nil {
		t.Fatal(err)
	}
	if instanceID != "abf09273e32cc15f69da240b7f8f588f" {
		t.Fatalf("unexpected instance ID: %s", instanceID)
	}
	if _, err := WindowsHelperInstanceID("not-a-sid"); err == nil {
		t.Fatal("invalid SID must be rejected")
	}

	paths, err := WindowsHelperInstancePaths(`C:\ProgramData`, sid)
	if err != nil {
		t.Fatal(err)
	}
	wantRoot := filepath.Join(`C:\ProgramData`, "FlyEnv", "Helper", "users", instanceID)
	if paths.InstanceRoot != wantRoot {
		t.Fatalf("instance root = %q, want %q", paths.InstanceRoot, wantRoot)
	}
	if paths.Executable != filepath.Join(wantRoot, "bin", "flyenv-helper.exe") {
		t.Fatalf("unexpected executable: %q", paths.Executable)
	}
	if paths.KeyPath != filepath.Join(wantRoot, "helper.key") {
		t.Fatalf("unexpected key path: %q", paths.KeyPath)
	}
	if paths.AllowedRootsPath != filepath.Join(wantRoot, "allowed-roots") {
		t.Fatalf("unexpected allowed roots path: %q", paths.AllowedRootsPath)
	}
	if paths.InstanceConfigPath != filepath.Join(wantRoot, "instance.json") {
		t.Fatalf("unexpected instance config path: %q", paths.InstanceConfigPath)
	}
	if paths.PipeName != "FlyEnv.Helper."+instanceID {
		t.Fatalf("unexpected pipe name: %q", paths.PipeName)
	}
	if got := GetPipeNameFromSocketPath(paths.PipeName); got != paths.PipeName {
		t.Fatalf("named pipe was rewritten: %q", got)
	}
}
