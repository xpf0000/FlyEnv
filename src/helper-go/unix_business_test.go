//go:build linux || darwin

package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
	"math/big"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestPublicCAFingerprintRequiresOneCACertificate(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	certificate := &x509.Certificate{SerialNumber: big.NewInt(1), NotBefore: time.Unix(0, 0), NotAfter: time.Unix(2000000000, 0), IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign}
	der, err := x509.CreateCertificate(rand.Reader, certificate, certificate, pub, priv)
	if err != nil {
		t.Fatal(err)
	}
	data := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	hash := sha256.Sum256(der)
	actual, err := publicCAFingerprint(data)
	if err != nil || actual != hex.EncodeToString(hash[:]) {
		t.Fatal("wrong CA identity", actual, err)
	}
	certificate.IsCA = false
	nonCA, err := x509.CreateCertificate(rand.Reader, certificate, certificate, pub, priv)
	if err != nil {
		t.Fatal(err)
	}
	for _, invalid := range [][]byte{
		[]byte("invalid"),
		append(append([]byte{}, data...), data...),
		append(append([]byte{}, data...), []byte("extra content")...),
		pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: nonCA}),
		pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}),
	} {
		if _, err = publicCAFingerprint(invalid); err == nil {
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
