//go:build linux || darwin

package main

import (
	"os"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestUnixCredentialPreservesSystemGroups(t *testing.T) {
	account, err := user.Current()
	if err != nil {
		t.Fatal(err)
	}
	uid, _ := strconv.Atoi(account.Uid)
	gid, _ := strconv.Atoi(account.Gid)
	if uid == 0 {
		t.Skip("ordinary account fixture required")
	}
	credential, err := unixUserCredential(unixPolicy{UID: uid, GID: gid})
	if err != nil {
		t.Fatal(err)
	}
	if credential.Uid != uint32(uid) || credential.Gid != uint32(gid) {
		t.Fatal("wrong user identity")
	}
	groups, err := account.GroupIds()
	if err != nil {
		t.Fatal(err)
	}
	actual := map[uint32]bool{}
	for _, group := range credential.Groups {
		actual[group] = true
	}
	for _, group := range groups {
		n, _ := strconv.ParseUint(group, 10, 32)
		if !actual[uint32(n)] {
			t.Fatal("supplementary group was lost", group)
		}
	}
	if !actual[uint32(gid)] {
		t.Fatal("primary group missing")
	}
	if _, err := unixUserCredential(unixPolicy{UID: uid, GID: gid + 10000}); err == nil {
		t.Fatal("foreign primary group accepted")
	}
	if _, err := unixUserCredential(unixPolicy{UID: 0, GID: gid}); err == nil {
		t.Fatal("root credential accepted")
	}
}

func TestUnixDataPathsAllowAliasesAndMissingLeaf(t *testing.T) {
	root := canonicalTempDir(t)
	alias := filepath.Join(canonicalTempDir(t), "user-data")
	if err := os.Symlink(root, alias); err != nil {
		t.Fatal(err)
	}
	resolved, err := canonicalUnixPath(filepath.Join(alias, "new/logs/service.log"))
	if err != nil || resolved != filepath.Join(root, "new/logs/service.log") {
		t.Fatal("data alias or missing leaf rejected", resolved, err)
	}
	if _, err := unixDataPath(filepath.Join(alias, "new/service.log"), root); err != nil {
		t.Fatal(err)
	}
	outside := canonicalTempDir(t)
	if err := os.Symlink(outside, filepath.Join(root, "escape")); err != nil {
		t.Fatal(err)
	}
	if _, err := unixDataPath(filepath.Join(alias, "escape/service.log"), root); err != nil {
		t.Fatal("ordinary service user-managed link was blocked", err)
	}
	if _, err := unixDataPath(filepath.Join(outside, "service.log"), root); err == nil {
		t.Fatal("unrelated data-root path accepted")
	}
}

func TestUnixFTPDatabaseGenerationRunsOrdinaryAndKeepsOldResultOnFailure(t *testing.T) {
	uid, gid := os.Getuid(), os.Getgid()
	if uid == 0 {
		t.Skip("ordinary account fixture required")
	}
	dir := canonicalTempDir(t)
	old := filepath.Join(dir, "users.pdb")
	if err := os.WriteFile(old, []byte("old database"), 0600); err != nil {
		t.Fatal(err)
	}
	pw := filepath.Join(canonicalTempDir(t), "pure-pw")
	script := "#!/bin/sh\n[ \"$(id -u)\" != 0 ] || exit 91\n[ \"$1\" = mkdb ] && [ \"$3\" = -f ] || exit 92\ncat \"$4\" > \"$2\"\n"
	if err := os.WriteFile(pw, []byte(script), 0755); err != nil {
		t.Fatal(err)
	}
	data, err := generateUnixFTPDatabase(unixPolicy{UID: uid, GID: gid}, pw, "ordinary user data", dir)
	if err != nil || string(data) != "ordinary user data" {
		t.Fatal("ordinary generation failed", string(data), err)
	}
	if err := os.WriteFile(pw, []byte("#!/bin/sh\necho real-generation-failure >&2\nexit 7\n"), 0755); err != nil {
		t.Fatal(err)
	}
	if _, err := generateUnixFTPDatabase(unixPolicy{UID: uid, GID: gid}, pw, "new data", dir); err == nil || !strings.Contains(err.Error(), "real-generation-failure") {
		t.Fatal("generation failure lost", err)
	}
	retained, err := os.ReadFile(old)
	if err != nil || string(retained) != "old database" {
		t.Fatal("failed build destroyed old database", err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 1 {
		t.Fatal("database staging leaked", err, entries)
	}
	stat, err := os.Stat(dir)
	if err != nil || stat.Mode().Perm() != 0700 {
		t.Fatal("private runtime permissions not restored", err)
	}
}
