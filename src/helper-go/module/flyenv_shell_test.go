package module

import (
	"bytes"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestWriteFlyEnvAtomicallyWithPowerShell(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("PowerShell provider fallback is Windows-specific")
	}
	directory := t.TempDir()
	target := filepath.Join(directory, "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1")
	content := []byte("# 中文 Profile\r\n")
	if err := writeFlyEnvAtomically(target, content); err != nil {
		t.Fatal(err)
	}
	actual, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(actual, content) {
		t.Fatalf("PowerShell provider write changed bytes: %q", actual)
	}
}

func TestWriteFlyEnvAtomicallyBatchWithPowerShell(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("PowerShell provider fallback is Windows-specific")
	}
	directory := t.TempDir()
	writes := []flyEnvAtomicWrite{
		{
			Path: filepath.Join(directory, "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1"),
			Data: []byte("# Windows PowerShell\r\n"),
		},
		{
			Path: filepath.Join(directory, "PowerShell", "Profile.ps1"),
			Data: []byte("# PowerShell Core\r\n"),
		},
	}
	if err := writeFlyEnvAtomicallyBatchWithPowerShell(writes); err != nil {
		t.Fatal(err)
	}
	for _, write := range writes {
		actual, err := os.ReadFile(write.Path)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(actual, write.Data) {
			t.Fatalf("PowerShell batch write changed bytes for %s: %q", write.Path, actual)
		}
	}
}

func TestReconcileFlyEnvProfileIsIdempotent(t *testing.T) {
	initial := "function prompt { 'custom' }\r\n"
	first, changed, err := reconcileFlyEnvProfile(initial, `C:\FlyEnv-Data\bin\flyenv.ps1`)
	if err != nil {
		t.Fatal(err)
	}
	if !changed {
		t.Fatal("first integration write must add the FlyEnv marker block")
	}
	if !strings.Contains(first, flyEnvProfileMarkerBegin) || !strings.Contains(first, "\r\n") {
		t.Fatalf("profile block was not appended with its original line ending: %q", first)
	}
	second, changed, err := reconcileFlyEnvProfile(first, `C:\FlyEnv-Data\bin\flyenv.ps1`)
	if err != nil {
		t.Fatal(err)
	}
	if changed || second != first {
		t.Fatal("reapplying the same FlyEnv profile integration must be a no-op")
	}

	updated, changed, err := reconcileFlyEnvProfile(first, `D:\FlyEnv-Data\bin\flyenv.ps1`)
	if err != nil {
		t.Fatal(err)
	}
	if !changed || strings.Count(updated, flyEnvProfileMarkerBegin) != 1 || !strings.Contains(updated, `D:\FlyEnv-Data\bin\flyenv.ps1`) {
		t.Fatalf("profile marker block was not replaced safely: %q", updated)
	}
}

func TestFlyEnvProfileEncodingRoundTrip(t *testing.T) {
	content := "# 中文 Profile\n"
	for _, encoding := range []flyEnvProfileEncoding{
		flyEnvProfileEncodingUTF8,
		flyEnvProfileEncodingUTF8BOM,
		flyEnvProfileEncodingUTF16LE,
		flyEnvProfileEncodingUTF16BE,
	} {
		encoded := encodeFlyEnvProfile(content, encoding)
		decoded, actualEncoding, err := decodeFlyEnvProfile(encoded)
		if err != nil {
			t.Fatalf("decodeFlyEnvProfile(%d): %v", encoding, err)
		}
		if decoded != content || actualEncoding != encoding {
			t.Fatalf("profile encoding %d did not round-trip", encoding)
		}
	}
	if !bytes.Equal(encodeFlyEnvProfile(content, flyEnvProfileEncodingUTF8BOM)[:3], []byte{0xef, 0xbb, 0xbf}) {
		t.Fatal("UTF-8 BOM was not preserved")
	}
}

func TestReconcileFlyEnvProfileRejectsPartialMarker(t *testing.T) {
	_, _, err := reconcileFlyEnvProfile(flyEnvProfileMarkerBegin+"\n", `C:\FlyEnv-Data\bin\flyenv.ps1`)
	if err == nil {
		t.Fatal("a partial marker block must fail instead of overwriting a profile tail")
	}
}

func TestReconcileFlyEnvProfileRejectsExtraMarkerAfterCompleteBlock(t *testing.T) {
	block := flyEnvProfileBlock(`C:\FlyEnv-Data\bin\flyenv.ps1`, "\n")
	_, _, err := reconcileFlyEnvProfile(block+"\n"+flyEnvProfileMarkerBegin+"\n", `C:\FlyEnv-Data\bin\flyenv.ps1`)
	if err == nil {
		t.Fatal("a complete block followed by another incomplete marker must be rejected")
	}
}

func TestReconcileFlyEnvProfileReplacesLegacyAutoLoadBlock(t *testing.T) {
	legacy := "# FlyEnv Auto-Load\n. \"C:\\Old-FlyEnv\\bin\\flyenv.ps1\"\n"
	updated, changed, err := reconcileFlyEnvProfile(legacy, `C:\FlyEnv-Data\bin\flyenv.ps1`)
	if err != nil {
		t.Fatal(err)
	}
	if !changed || strings.Contains(updated, "C:\\Old-FlyEnv\\bin\\flyenv.ps1") || strings.Count(updated, flyEnvProfileMarkerBegin) != 1 {
		t.Fatalf("legacy FlyEnv auto-load block was not replaced: %q", updated)
	}
}
