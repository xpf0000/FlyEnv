//go:build linux || darwin

package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestUnixCARejectsArbitraryPathsAndNames(t *testing.T) {
	root := canonicalTempDir(t)
	p := unixPolicy{Version: Helper_Version, UID: 1000, DataRoot: root}
	cwd := filepath.Join(root, "server", "CA")
	for _, request := range []TaskItem{
		{Function: "sslFindCertificate"},
		{Function: "sslFindCertificate", Args: []interface{}{"/etc"}},
		{Function: "sslFindCertificate", Args: []interface{}{cwd, "Other-CA"}},
		{Function: "sslFindCertificate", Args: []interface{}{cwd, unixCAName, "extra"}},
		{Function: "sslAddTrustedCert", Args: []interface{}{"/etc", unixCAFile}},
		{Function: "sslAddTrustedCert", Args: []interface{}{cwd, "../../etc/profile"}},
		{Function: "sslAddTrustedCert", Args: []interface{}{cwd, "Other-CA.crt"}},
		{Function: "sslAddTrustedCert", Args: []interface{}{cwd, unixCAFile, "extra"}},
	} {
		if _, err := dispatchUnixCA(request, p, root); err == nil {
			t.Fatalf("accepted arbitrary CA input: %v", request)
		}
	}
}

func TestUnixCARejectsInvalidPublicFileBeforeImport(t *testing.T) {
	root := canonicalTempDir(t)
	cwd := filepath.Join(root, "server", "CA")
	if err := os.MkdirAll(cwd, 0777); err != nil {
		t.Fatal(err)
	}
	p := unixPolicy{Version: Helper_Version, UID: 1000, DataRoot: root}
	request := TaskItem{Function: "sslAddTrustedCert", Args: []interface{}{cwd, unixCAFile}}
	// A malformed CA must affect only this business RPC, not policy validity.
	if err := os.WriteFile(filepath.Join(cwd, unixCAFile), []byte("PRIVATE KEY or other data"), 0777); err != nil {
		t.Fatal(err)
	}
	if _, err := dispatchUnixCA(request, p, root); err == nil {
		t.Fatal("imported malformed CA")
	}
	alias := filepath.Join(canonicalTempDir(t), "data-alias")
	if err := os.Symlink(root, alias); err != nil {
		t.Fatal(err)
	}
	request.Args[0] = filepath.Join(alias, "server", "CA")
	if _, err := dispatchUnixCA(request, p, root); err == nil || err.Error() != "expected public certificate data" {
		t.Fatal("data directory alias was rejected before reading the fixed CA", err)
	}
	request.Args[0] = cwd
	entries, err := os.ReadDir(root)
	if err != nil || len(entries) != 1 {
		t.Fatal("invalid CA created a privileged snapshot", entries, err)
	}
	if err := os.Remove(filepath.Join(cwd, unixCAFile)); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(cwd, unixCAFile), 0755); err != nil {
		t.Fatal(err)
	}
	if _, err := dispatchUnixCA(request, p, root); err == nil {
		t.Fatal("CA directory accepted as certificate")
	}
}
