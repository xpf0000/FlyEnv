//go:build darwin && cgo

package main

import (
	"bytes"
	"fmt"
	"golang.org/x/sys/unix"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"

	"testing"
)

func TestDarwinNativeKeyACL(t *testing.T) {
	path := filepath.Join(canonicalTempDir(t), "key")
	os.WriteFile(path, bytes.Repeat([]byte{1}, 32), 0600)
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err = validateProtectedACL(f); err != nil {
		t.Fatal("empty ACL rejected", err)
	}
	if err = setDarwinKeyACL(f, os.Getuid()); err != nil {
		t.Fatal(err)
	}
	if err = checkDarwinKeyACL(f, os.Getuid()); err != nil {
		t.Fatal("valid UID read ACE rejected", err)
	}
	if err = checkDarwinKeyACL(f, os.Getuid()+1); err == nil {
		t.Fatal("foreign UID read ACE accepted")
	}
	if err = validateProtectedACL(f); err == nil {
		t.Fatal("allow ACL accepted on generic protected file")
	}
	// User-owned fixtures test exact native ACL parsing without modifying root resources.
	account, err := user.LookupId(fmt.Sprint(os.Getuid()))
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range []string{"user:" + account.Username + " allow read,write", "everyone allow read", "user:" + account.Username + " allow read,file_inherit"} {
		if output, err := exec.Command("/bin/chmod", "-N", path).CombinedOutput(); err != nil {
			t.Fatal(err, string(output))
		}
		if output, err := exec.Command("/bin/chmod", "+a", entry, path).CombinedOutput(); err != nil {
			t.Fatal(err, string(output))
		}
		if checkDarwinKeyACL(f, os.Getuid()) == nil {
			t.Fatal("invalid key ACE accepted", entry)
		}
	}
}
func TestDarwinHostsNativeMetadata(t *testing.T) {
	path := filepath.Join(canonicalTempDir(t), "hosts")
	os.WriteFile(path, []byte("original\n"), 0640)
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if err = setDarwinKeyACL(f, os.Getuid()); err != nil {
		t.Fatal(err)
	}
	if err = unix.Fsetxattr(int(f.Fd()), "com.flyenv.fixture", []byte("metadata"), 0); err != nil {
		t.Fatal(err)
	}
	if err = unix.Fchflags(int(f.Fd()), unix.UF_NODUMP); err != nil {
		t.Fatal(err)
	}
	f.Close()
	defer unix.Chflags(path, 0)
	store := hostsStore{path: path}
	snapshot, err := store.read()
	if err != nil {
		t.Fatal(err)
	}
	before, _ := os.Stat(path)
	if _, err = store.replace("arbitrary hosts\n", snapshot.Digest); err != nil {
		t.Fatal(err)
	}
	after, _ := os.Stat(path)
	if os.SameFile(before, after) {
		t.Fatal("publication was not atomic")
	}
	if after.Mode().Perm() != 0640 {
		t.Fatal("mode changed")
	}
	f, err = os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err = checkDarwinKeyACL(f, os.Getuid()); err != nil {
		t.Fatal("ACL lost", err)
	}
	buffer := make([]byte, 32)
	n, err := unix.Fgetxattr(int(f.Fd()), "com.flyenv.fixture", buffer)
	if err != nil || string(buffer[:n]) != "metadata" {
		t.Fatal("xattr lost", err)
	}
	var meta unix.Stat_t
	if err = unix.Fstat(int(f.Fd()), &meta); err != nil || meta.Flags&unix.UF_NODUMP == 0 {
		t.Fatal("flags lost", err)
	}
}

func TestDarwinNativeProcessBirth(t *testing.T) {
	birth, err := nativeDarwinProcessBirth(os.Getpid())
	if err != nil || birth == "" {
		t.Fatal("real process birth missing", birth, err)
	}
	again, err := nativeDarwinProcessBirth(os.Getpid())
	if err != nil || birth != again {
		t.Fatal("unstable process identity", again, err)
	}
}

func TestDarwinHostsRejectsNonMutableFlagsWithoutTemporaryFiles(t *testing.T) {
	for _, flags := range []int{unix.UF_IMMUTABLE, unix.UF_APPEND} {
		t.Run(fmt.Sprint(flags), func(t *testing.T) {
			dir := canonicalTempDir(t)
			path := filepath.Join(dir, "hosts")
			if err := os.WriteFile(path, []byte("original\n"), 0644); err != nil {
				t.Fatal(err)
			}
			if err := unix.Chflags(path, flags); err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() {
				files, _ := filepath.Glob(filepath.Join(dir, "*"))
				temps, _ := filepath.Glob(filepath.Join(dir, ".flyenv-hosts-*"))
				for _, file := range append(files, temps...) {
					unix.Chflags(file, 0)
				}
			})
			store := hostsStore{path: path}
			snapshot, err := store.read()
			if err != nil {
				t.Fatal(err)
			}
			if _, err = store.replace("new\n", snapshot.Digest); err == nil {
				t.Fatal("nonmutable hosts were published")
			}
			data, err := os.ReadFile(path)
			if err != nil || string(data) != "original\n" {
				t.Fatal("original hosts changed", err)
			}
			temps, err := filepath.Glob(filepath.Join(dir, ".flyenv-hosts-*"))
			if err != nil || len(temps) != 0 {
				t.Fatal("nonmutable temporary files leaked", temps, err)
			}
		})
	}
}
