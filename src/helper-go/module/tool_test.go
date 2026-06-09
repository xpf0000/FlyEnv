package module

import (
	"encoding/base64"
	"encoding/binary"
	"strings"
	"testing"
	"unicode/utf16"
)

func decodePowerShellPayloadForTest(t *testing.T, payload string) string {
	t.Helper()
	raw, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		t.Fatalf("payload should be base64: %v", err)
	}
	if len(raw)%2 != 0 {
		t.Fatalf("UTF-16LE payload should have even byte length, got %d", len(raw))
	}
	words := make([]uint16, len(raw)/2)
	for i := range words {
		words[i] = binary.LittleEndian.Uint16(raw[i*2:])
	}
	return string(utf16.Decode(words))
}

func TestPowerShellEncodedArgsAvoidScriptFiles(t *testing.T) {
	script := "[Console]::OutputEncoding = [Text.Encoding]::UTF8; Write-Output 'FlyEnv 环境同步'"

	args := powerShellEncodedArgs(script)
	joined := strings.Join(args, " ")

	if strings.Contains(joined, "-File") {
		t.Fatalf("PowerShell args should not execute a script file: %v", args)
	}
	if !strings.Contains(joined, "-EncodedCommand") {
		t.Fatalf("PowerShell args should use -EncodedCommand: %v", args)
	}
	if got := decodePowerShellPayloadForTest(t, args[len(args)-1]); got != script {
		t.Fatalf("encoded payload mismatch:\nwant: %q\n got: %q", script, got)
	}
}
