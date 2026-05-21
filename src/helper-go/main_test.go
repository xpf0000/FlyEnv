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
