package utils

import (
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHelperDiagnosticsRotatesWithoutTruncatingOrGrowingUnbounded(t *testing.T) {
	root := t.TempDir()
	paths := WindowsHelperPaths{InstanceRoot: root, DiagnosticsPath: filepath.Join(root, HelperStartupLogName)}
	file, err := openDiagnosticFile(paths.DiagnosticsPath)
	if err != nil {
		t.Fatal(err)
	}
	writer := &helperDiagnosticLog{file: file, path: paths.DiagnosticsPath, backup: filepath.Join(root, HelperStartupLogBackupName), maxSize: HelperStartupLogMaxBytes}
	chunk := strings.Repeat("diagnostic ", 32*1024)
	if _, err := io.WriteString(writer, chunk); err != nil {
		t.Fatal(err)
	}
	if _, err := io.WriteString(writer, "tail"); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{paths.DiagnosticsPath, filepath.Join(root, HelperStartupLogBackupName)} {
		info, err := os.Stat(path)
		if err != nil {
			t.Fatalf("expected rotated diagnostics file %s: %v", path, err)
		}
		if info.Size() > HelperStartupLogMaxBytes {
			t.Fatalf("diagnostics file %s exceeded bound: %d", path, info.Size())
		}
	}
}

func TestHelperDiagnosticsRejectsSymlink(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, HelperStartupLogName)
	target := filepath.Join(t.TempDir(), "outside.log")
	if err := os.WriteFile(target, []byte("outside"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, path); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if file, err := openDiagnosticFile(path); err == nil {
		file.Close()
		t.Fatal("diagnostics symlink must be rejected")
	}
}

func TestHelperDiagnosticsRejectsHardlink(t *testing.T) {
	path := filepath.Join(t.TempDir(), HelperStartupLogName)
	target := filepath.Join(t.TempDir(), "outside.log")
	if err := os.WriteFile(target, []byte("outside"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Link(target, path); err != nil {
		t.Skipf("hardlinks unavailable: %v", err)
	}
	if file, err := openDiagnosticFile(path); err == nil {
		file.Close()
		t.Fatal("diagnostics hardlink must be rejected")
	}
}

func TestHelperDiagnosticsReopenAppends(t *testing.T) {
	path := filepath.Join(t.TempDir(), HelperStartupLogName)
	for _, text := range []string{"first startup\n", "second startup\n"} {
		file, err := openDiagnosticFile(path)
		if err != nil {
			t.Fatal(err)
		}
		_, err = file.WriteString(text)
		file.Close()
		if err != nil {
			t.Fatal(err)
		}
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "first startup\nsecond startup\n" {
		t.Fatalf("previous diagnostic lost: %q", data)
	}
}
