package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"testing"
	"time"
)

func signTaskForTest(key []byte, item TaskItem) string {
	argsJSON, _ := json.Marshal(item.Args)
	payload := fmt.Sprintf(
		"%s|%s|%s|%s|%d|%s|%d|%s",
		item.Key,
		item.Module,
		item.Function,
		string(argsJSON),
		item.Ts,
		item.Nonce,
		item.ClientPid,
		item.ClientExe,
	)
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(payload))
	return hex.EncodeToString(mac.Sum(nil))
}

func TestParseRole(t *testing.T) {
	role, err := parseRole("501:20\n")
	if err != nil {
		t.Fatalf("parseRole returned error: %v", err)
	}
	if role.UID != 501 || role.GID != 20 || role.Raw != "501:20" {
		t.Fatalf("unexpected role: %+v", role)
	}

	invalid := []string{"", "root:wheel", "1:2:3", "-1:2", "1:-2", "1\n2:3"}
	for _, value := range invalid {
		if _, err := parseRole(value); err == nil {
			t.Fatalf("parseRole(%q) should fail", value)
		}
	}
}

func TestParseWindowsHelperRuntimeConfig(t *testing.T) {
	config, err := parseHelperRuntimeConfig([]string{
		"--key-path", `C:\\Users\\flyenv\\AppData\\Local\\FlyEnv\\flyenv-helper.key`,
		"--expected-user-sid", "S-1-5-21-100-200-300-400",
	})
	if err != nil {
		t.Fatalf("parseHelperRuntimeConfig returned error: %v", err)
	}
	if config.KeyPath != `C:\\Users\\flyenv\\AppData\\Local\\FlyEnv\\flyenv-helper.key` {
		t.Fatalf("unexpected key path: %q", config.KeyPath)
	}
	if config.ExpectedUserSID != "S-1-5-21-100-200-300-400" {
		t.Fatalf("unexpected SID: %q", config.ExpectedUserSID)
	}
	if _, err := parseHelperRuntimeConfig([]string{"--expected-user-sid"}); err == nil {
		t.Fatal("missing expected-user-sid value should fail")
	}
}

func TestHelperHealthResponseIncludesVersionPIDAndSID(t *testing.T) {
	response := helperHealthResponse(1234, "S-1-5-21-100-200-300-400")
	if response["version"] != Helper_Version {
		t.Fatalf("health version = %v, want %d", response["version"], Helper_Version)
	}
	if response["pid"] != 1234 {
		t.Fatalf("health pid = %v, want 1234", response["pid"])
	}
	if response["sid"] != "S-1-5-21-100-200-300-400" {
		t.Fatalf("health sid = %v", response["sid"])
	}
}

func TestValidateFreshRequest(t *testing.T) {
	app := NewAppHelper()
	now := time.Now().UnixMilli()
	item := TaskItem{Key: "k", Module: "helper", Function: "version", Ts: now, Nonce: "nonce-1"}

	if err := app.validateFreshRequest(item); err != nil {
		t.Fatalf("first fresh request should pass: %v", err)
	}
	if err := app.validateFreshRequest(item); err == nil {
		t.Fatal("replayed nonce should fail")
	}

	oldItem := item
	oldItem.Nonce = "nonce-old"
	oldItem.Ts = time.Now().Add(-6 * time.Minute).UnixMilli()
	if err := app.validateFreshRequest(oldItem); err == nil {
		t.Fatal("old timestamp should fail")
	}

	futureItem := item
	futureItem.Nonce = "nonce-future"
	futureItem.Ts = time.Now().Add(6 * time.Minute).UnixMilli()
	if err := app.validateFreshRequest(futureItem); err == nil {
		t.Fatal("future timestamp should fail")
	}
}

func TestVerifySignatureIncludesAuthFields(t *testing.T) {
	previousKey := helperKey
	defer func() {
		helperKey = previousKey
	}()

	helperKey = []byte("01234567890123456789012345678901")
	app := NewAppHelper()
	item := TaskItem{
		Key:       "request-1",
		Module:    "tools",
		Function:  "readFileByRoot",
		Args:      []interface{}{"/tmp/FlyEnv/test.txt"},
		Ts:        time.Now().UnixMilli(),
		Nonce:     "nonce-verify",
		ClientPid: 12345,
		ClientExe: "/Applications/FlyEnv.app/Contents/MacOS/FlyEnv",
	}
	item.Sig = signTaskForTest(helperKey, item)

	if !app.verifySignature(item) {
		t.Fatal("valid signature should pass")
	}

	tampered := item
	tampered.ClientPid = 54321
	if app.verifySignature(tampered) {
		t.Fatal("signature should fail when client pid changes")
	}

	tampered = item
	tampered.Args = []interface{}{"/tmp/FlyEnv/other.txt"}
	if app.verifySignature(tampered) {
		t.Fatal("signature should fail when args change")
	}
}

func TestVerifySignatureCanonicalizesObjectArguments(t *testing.T) {
	previousKey := helperKey
	defer func() {
		helperKey = previousKey
	}()

	helperKey = []byte("01234567890123456789012345678901")
	app := NewAppHelper()
	item := TaskItem{
		Key:      "request-shell-hook",
		Module:   "tools",
		Function: "installFlyEnvPowerShellIntegration",
		Args: []interface{}{map[string]interface{}{
			"scriptPath":   `C:\FlyEnv\bin\flyenv.ps1`,
			"scriptBase64": "abc",
			"profiles": []interface{}{map[string]interface{}{
				"path":    `C:\Users\FlyEnv\Profile.ps1`,
				"edition": "pwsh",
			}},
		}},
		Ts:        time.Now().UnixMilli(),
		Nonce:     "nonce-shell-hook",
		ClientPid: 12345,
		ClientExe: `C:\FlyEnv\FlyEnv.exe`,
	}
	item.Sig = signTaskForTest(helperKey, item)

	if !app.verifySignature(item) {
		t.Fatal("valid signature with object arguments should pass")
	}
}

func TestParseSetSystemPathArgsAcceptsOptionalExpectedRawPath(t *testing.T) {
	paths := []interface{}{
		`%INTEL_DEV_REDIST%redist\intel64\compiler`,
		`..\relative`,
		``,
	}
	otherVars := map[string]interface{}{"JAVA_HOME": `C:\FlyEnv\java`}

	parsedPaths, parsedVars, expectedRawPath, err := parseSetSystemPathArgs(
		[]interface{}{paths, otherVars, `C:\SDK\bin;`},
	)
	if err != nil {
		t.Fatalf("parseSetSystemPathArgs returned error: %v", err)
	}
	if len(parsedPaths) != len(paths) || parsedPaths[0] != paths[0] || parsedPaths[2] != "" {
		t.Fatalf("paths were not preserved: %#v", parsedPaths)
	}
	if parsedVars["JAVA_HOME"] != `C:\FlyEnv\java` {
		t.Fatalf("otherVars were not preserved: %#v", parsedVars)
	}
	if expectedRawPath == nil || *expectedRawPath != `C:\SDK\bin;` {
		t.Fatalf("expected raw PATH was not preserved: %#v", expectedRawPath)
	}

	_, _, noExpectedRawPath, err := parseSetSystemPathArgs([]interface{}{paths, otherVars})
	if err != nil {
		t.Fatalf("two argument setSystemPath should remain supported: %v", err)
	}
	if noExpectedRawPath != nil {
		t.Fatalf("two argument setSystemPath expected nil snapshot, got %#v", noExpectedRawPath)
	}
}

func TestParseSetSystemPathArgsRejectsNonStringExpectedRawPath(t *testing.T) {
	_, _, _, err := parseSetSystemPathArgs(
		[]interface{}{[]interface{}{`C:\FlyEnv\bin`}, map[string]interface{}{}, true},
	)
	if err == nil {
		t.Fatal("non-string expectedRawPath should fail")
	}
}

func TestParseSetSystemPathArgsRejectsNULExpectedRawPath(t *testing.T) {
	_, _, _, err := parseSetSystemPathArgs(
		[]interface{}{[]interface{}{`C:\FlyEnv\bin`}, map[string]interface{}{}, "C:\\FlyEnv\x00bin"},
	)
	if err == nil {
		t.Fatal("NUL expectedRawPath should fail")
	}
}
