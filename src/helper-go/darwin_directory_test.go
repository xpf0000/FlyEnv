//go:build darwin && cgo

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestDarwinHelperDirectoryAllowsUserPermissions(t *testing.T) {
	dir := canonicalTempDir(t)
	for _, mode := range []os.FileMode{0755, 0775, 0777} {
		if err := os.Chmod(dir, mode); err != nil {
			t.Fatal(err)
		}
		if err := unixDirectory(dir); err != nil {
			t.Fatalf("directory permissions %o blocked the helper: %v", mode, err)
		}
	}
	if output, err := exec.Command("/bin/chmod", "+a", "everyone allow read,write,search", dir).CombinedOutput(); err != nil {
		t.Fatal(err, string(output))
	}
	if err := unixDirectory(dir); err != nil {
		t.Fatal("directory ACL blocked the helper", err)
	}
}

func TestDarwinHelperDirectoryStillRequiresAccessibleDirectory(t *testing.T) {
	dir := canonicalTempDir(t)
	file := filepath.Join(dir, "file")
	if err := os.WriteFile(file, []byte("not a directory"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := unixDirectory(file); err == nil {
		t.Fatal("regular file accepted as helper directory")
	}
	if err := unixDirectory(filepath.Join(dir, "missing")); err == nil {
		t.Fatal("missing helper directory accepted")
	}
}
