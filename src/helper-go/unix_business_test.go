//go:build linux || darwin

package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestUnixCARequiresOnePublicCertificateWithFixedName(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	certificate := &x509.Certificate{Subject: pkix.Name{CommonName: unixCAName}, SerialNumber: big.NewInt(1), NotBefore: time.Unix(0, 0), NotAfter: time.Unix(2000000000, 0), IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign}
	der, err := x509.CreateCertificate(rand.Reader, certificate, certificate, pub, priv)
	if err != nil {
		t.Fatal(err)
	}
	data := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	input := canonicalTempDir(t)
	if err := os.Chmod(input, 0777); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(input, unixCAFile), data, 0777); err != nil {
		t.Fatal(err)
	}
	alias := filepath.Join(canonicalTempDir(t), "user-alias")
	if err := os.Symlink(input, alias); err != nil {
		t.Fatal(err)
	}
	snapshot, err := snapshotUnixCA(alias, canonicalTempDir(t))
	if err != nil {
		t.Fatal("user-managed CA permissions/alias blocked import snapshot", err)
	}
	defer os.Remove(snapshot)
	os.WriteFile(filepath.Join(input, unixCAFile), []byte("changed input"), 0644)
	copied, err := os.ReadFile(snapshot)
	if err != nil || string(copied) != string(data) {
		t.Fatal("snapshot did not preserve validated bytes", err)
	}
	stat, err := os.Stat(snapshot)
	if err != nil || stat.Mode().Perm() != 0600 {
		t.Fatal("CA snapshot must remain private", err)
	}
	if err := validateUnixCA(data); err != nil || !containsUnixCA(data) {
		t.Fatal("fixed CA not recognized", err)
	}
	// Presence is deliberately determined by name, not fingerprint or expiry.
	certificate.SerialNumber = big.NewInt(2)
	otherDER, err := x509.CreateCertificate(rand.Reader, certificate, certificate, pub, priv)
	if err != nil {
		t.Fatal(err)
	}
	if !containsUnixCA(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: otherDER})) {
		t.Fatal("another certificate with the fixed name must count as present")
	}
	certificate.Subject.CommonName = "Other-CA"
	otherName, err := x509.CreateCertificate(rand.Reader, certificate, certificate, pub, priv)
	if err != nil {
		t.Fatal(err)
	}
	if containsUnixCA(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: otherName})) {
		t.Fatal("other CA name accepted")
	}
	certificate.IsCA = false
	nonCA, err := x509.CreateCertificate(rand.Reader, certificate, certificate, pub, priv)
	if err != nil {
		t.Fatal(err)
	}
	for _, invalid := range [][]byte{
		[]byte("invalid"),
		append([]byte("private data\n"), data...),
		append(append([]byte{}, data...), data...),
		append(append([]byte{}, data...), []byte("extra content")...),
		pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: nonCA}),
		pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: otherName}),
		pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}),
	} {
		if err = validateUnixCA(invalid); err == nil {
			t.Fatal("accepted non-public-CA archive")
		}
	}
}

func canonicalTempDir(t *testing.T) string {
	t.Helper()
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return dir
}

func TestSystemToolUsesExecutionResultWithUserConfiguredPermissions(t *testing.T) {
	dir := canonicalTempDir(t)
	if err := os.Chmod(dir, 0777); err != nil {
		t.Fatal(err)
	}
	tool := filepath.Join(dir, "system-tool")
	if err := os.WriteFile(tool, []byte("#!/bin/sh\nexit 0\n"), 0777); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(tool, 0777); err != nil {
		t.Fatal(err)
	}
	if err := runSystemTool(tool); err != nil {
		t.Fatal("user-configured permissions must not reject an executable system tool", err)
	}
	if err := os.WriteFile(tool, []byte("#!/bin/sh\necho actual-command-failure >&2\nexit 7\n"), 0777); err != nil {
		t.Fatal(err)
	}
	if err := runSystemTool(tool); err == nil || !strings.Contains(err.Error(), "actual-command-failure") {
		t.Fatal("actual command failures must still propagate", err)
	}
}

func TestRegularFileDoesNotRequireManagedPermissions(t *testing.T) {
	dir := canonicalTempDir(t)
	if err := os.Chmod(dir, 0777); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "certificate")
	if err := os.WriteFile(path, []byte("snapshot"), 0777); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, 0777); err != nil {
		t.Fatal(err)
	}
	data, err := regularFile(path, 8)
	if err != nil || string(data) != "snapshot" {
		t.Fatal("user-managed file permissions blocked reading", err)
	}
	if _, err = regularFile(path, 7); err == nil {
		t.Fatal("oversized file accepted")
	}
	link := filepath.Join(dir, "link")
	if err = os.Symlink(path, link); err != nil {
		t.Fatal(err)
	}
	if _, err = regularFile(link, 8); err == nil {
		t.Fatal("symbolic link accepted")
	}
}

func TestManagedDirectoryChecksOnlyItsOwnPermissions(t *testing.T) {
	if os.Geteuid() != 0 {
		t.Skip("root ownership fixture requires root")
	}
	parent := canonicalTempDir(t)
	if err := os.Chmod(parent, 0777); err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(parent, "flyenv-managed")
	if err := os.Mkdir(dir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := protectedDirectory(dir); err != nil {
		t.Fatal("user-configured system ancestor permissions blocked a managed directory", err)
	}
	if err := os.Chmod(dir, 0777); err != nil {
		t.Fatal(err)
	}
	if err := protectedDirectory(dir); err == nil {
		t.Fatal("FlyEnv-managed directory permissions were not validated")
	}
}
func TestManagedHostsHandlesDuplicateCompleteBlocks(t *testing.T) {
	content := "custom\n#X-HOSTS-BEGIN#\nold\n#X-HOSTS-END#\nmiddle\n#X-HOSTS-BEGIN#\nold2\n#X-HOSTS-END#\ntail\n"
	got, err := mergeManagedHosts(content, "")
	if err != nil || got != "custom\n\nmiddle\n\ntail\n" {
		t.Fatalf("got %q: %v", got, err)
	}
}
func TestManagedHostsAppendPreservesWhitespace(t *testing.T) {
	content := "custom\n\n\n"
	got, err := mergeManagedHosts(content, "127.0.0.1 arbitrary.domain\n")
	if err != nil || !strings.HasPrefix(got, content) {
		t.Fatalf("outside content changed: %q, %v", got, err)
	}
}
func TestHostsContentAndConflict(t *testing.T) {
	path := filepath.Join(canonicalTempDir(t), "hosts")
	original := "127.0.0.1 localhost\n"
	if err := os.WriteFile(path, []byte(original), 0644); err != nil {
		t.Fatal(err)
	}
	store := hostsStore{path: path}
	before, _ := os.Stat(path)
	first, err := store.read()
	if err != nil {
		t.Fatal(err)
	}
	content := "# custom full text\n203.0.113.42 any.domain.invalid arbitrary-name\n::1 ipv6.example\n"
	if _, err := store.replace(content, first.Digest); err != nil {
		t.Fatal(err)
	}
	after, _ := os.Stat(path)
	if os.SameFile(before, after) {
		t.Fatal("hosts save must publish a complete new file atomically")
	}
	if _, err := store.replace(original, first.Digest); err == nil {
		t.Fatal("stale edit overwritten")
	}
	got, _ := os.ReadFile(path)
	if string(got) != content {
		t.Fatal("full text changed")
	}
}
func TestHostsRejectsSymlink(t *testing.T) {
	dir := canonicalTempDir(t)
	target := filepath.Join(dir, "protected")
	os.WriteFile(target, []byte("keep"), 0644)
	link := filepath.Join(dir, "hosts")
	os.Symlink(target, link)
	store := hostsStore{path: link}
	if _, err := store.read(); err == nil {
		t.Fatal("followed symlink")
	}
}
func TestManagedHostsPreservesOtherContent(t *testing.T) {
	original := "# custom\n198.51.100.1 user.local\n#X-HOSTS-BEGIN#\n127.0.0.1 old.local\n#X-HOSTS-END#\n# tail\n"
	got, err := mergeManagedHosts(original, "203.0.113.8 arbitrary.domain\n")
	if err != nil {
		t.Fatal(err)
	}
	want := "# custom\n198.51.100.1 user.local\n#X-HOSTS-BEGIN#\n203.0.113.8 arbitrary.domain\n#X-HOSTS-END#\n# tail\n"
	if got != want {
		t.Fatalf("got %q", got)
	}
}
func TestUnixFTPConfiguration(t *testing.T) {
	config, err := ftpConfig("Daemonize yes\nBind 0.0.0.0,21\nPureDB /user/database\nPIDFile /user/pid\nChrootEveryone yes\nUnixAuthentication no\nPassivePortRange 39000 40000\n", "/run/flyenv-helper/ftp-1000")
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{"Daemonize no", "Bind 0.0.0.0,21", "PureDB /run/flyenv-helper/ftp-1000/users.pdb", "PIDFile /run/flyenv-helper/ftp-1000/pure-ftpd.pid"} {
		if !strings.Contains(config, expected) {
			t.Fatalf("missing %s: %s", expected, config)
		}
	}
	for _, input := range []string{"Include /etc/shadow", "ExtAuth /tmp/auth", "AltLog clf:/etc/profile", "CreateHomeDir yes", "UnixAuthentication yes", "Bind $(id),21", "PassivePortRange 1 99999", "Daemonize yes\nDaemonize yes", "MaxClientsNumber 0", "UnknownOption yes"} {
		if _, err := ftpConfig(input, "/run/flyenv-helper/ftp-1000"); err == nil {
			t.Fatalf("accepted %q", input)
		}
	}
}
func TestUnixFTPUsers(t *testing.T) {
	passwd, err := ftpUsers("alice:$6$hash:0:0::/srv/my site/./::::::::::::\n", unixPolicy{UID: 1000, GID: 1000})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(passwd, "alice:$6$hash:1000:1000::/srv/my site/./:") {
		t.Fatal(passwd)
	}
	for _, input := range []string{"bad:hash:0:0::relative/path", "alice:hash:0:0::/ok\nalice:hash:1:1::/other", "#comment", "alice:hash:0:0::/ok\x00"} {
		if _, err := ftpUsers(input, unixPolicy{UID: 1000, GID: 1000}); err == nil {
			t.Fatalf("accepted %q", input)
		}
	}
}

func TestHostsNoChangeAndHardlink(t *testing.T) {
	dir := canonicalTempDir(t)
	path := filepath.Join(dir, "hosts")
	os.WriteFile(path, []byte("existing\n"), 0644)
	store := hostsStore{path: path}
	snapshot, err := store.read()
	if err != nil {
		t.Fatal(err)
	}
	before, _ := os.Stat(path)
	if _, err = store.replace(snapshot.Content, snapshot.Digest); err != nil {
		t.Fatal(err)
	}
	after, _ := os.Stat(path)
	if !os.SameFile(before, after) {
		t.Fatal("unchanged save replaced inode")
	}
	result, err := dispatchHosts(TaskItem{Module: "host", Function: "replaceHostsContent", Args: []interface{}{map[string]interface{}{"content": snapshot.Content, "digest": snapshot.Digest}}}, &store)
	if err != nil || result != false {
		t.Fatalf("unchanged full-text edit must report no change: %v, %v", result, err)
	}
	if err = os.Link(path, filepath.Join(dir, "second")); err != nil {
		t.Fatal(err)
	}
	if _, err = store.read(); err == nil {
		t.Fatal("hardlinked target accepted")
	}
}
func TestHostsIntermediateSymlink(t *testing.T) {
	dir := canonicalTempDir(t)
	real := filepath.Join(dir, "real")
	os.Mkdir(real, 0755)
	os.WriteFile(filepath.Join(real, "hosts"), []byte("keep"), 0644)
	link := filepath.Join(dir, "link")
	os.Symlink(real, link)
	store := hostsStore{path: filepath.Join(link, "hosts")}
	if _, err := store.read(); err == nil {
		t.Fatal("intermediate symlink followed")
	}
}

func TestUnixHostsAllowsUserConfiguredParentPermissions(t *testing.T) {
	dir := canonicalTempDir(t)
	if err := os.Chmod(dir, 0777); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "hosts")
	if err := os.WriteFile(path, []byte("127.0.0.1 localhost\n"), 0644); err != nil {
		t.Fatal(err)
	}
	// Both platform dispatchers use this shared store without a parent permission policy.
	store := hostsStore{path: path}
	snapshot, err := store.read()
	if err != nil {
		t.Fatal("parent directory permissions must not block reading hosts", err)
	}
	content := "127.0.0.1 localhost\n203.0.113.8 custom.test\n"
	if changed, err := store.replace(content, snapshot.Digest); err != nil || !changed {
		t.Fatal("parent directory permissions must not block editing hosts", changed, err)
	}
	if changed, err := store.syncManaged("127.0.0.1 flyenv.test\n", digest(content)); err != nil || !changed {
		t.Fatal("parent directory permissions must not block site synchronization", changed, err)
	}
	snapshot, err = store.read()
	if err != nil || !strings.Contains(snapshot.Content, "flyenv.test") {
		t.Fatal("site entry was not written", snapshot, err)
	}
	if _, err := store.syncManaged("", snapshot.Digest); err != nil {
		t.Fatal("parent directory permissions must not block managed entry cleanup", err)
	}
	snapshot, err = store.read()
	if err != nil || !strings.HasPrefix(snapshot.Content, content) || strings.Contains(snapshot.Content, "flyenv.test") {
		t.Fatal("managed entry cleanup changed unrelated content", snapshot, err)
	}
	st, err := os.Stat(dir)
	if err != nil || st.Mode().Perm() != 0777 {
		t.Fatal("hosts operations must retain user-configured parent permissions", err)
	}
}
