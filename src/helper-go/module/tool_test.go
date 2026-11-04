package module

import (
	"encoding/base64"
	"encoding/binary"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"unicode/utf16"

	"helper-go/utils"
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

func TestResolveWindowsSystemExeUsesSystemAPI(t *testing.T) {
	// 更新原有 Sysnative 优先断言：64 位进程应使用本机系统目录，不依赖该别名。
	if runtime.GOOS != "windows" {
		t.Skip("Windows system API is unavailable")
	}
	t.Setenv("SystemRoot", `Z:\not-the-system-root`)
	t.Setenv("PATH", "")
	got, err := utils.GetWindowsSystemExe("schtasks")
	if err != nil {
		t.Fatal(err)
	}
	if !filepath.IsAbs(got) || strings.HasPrefix(strings.ToLower(got), `z:\`) {
		t.Fatalf("system executable must use the OS directory, got %q", got)
	}
}

func TestResolveWindowsSystemExeRefusesMissingFile(t *testing.T) {
	// 更新原有“缺失即裸命令回退”断言，避免测试继续要求已移除的不安全行为。
	if runtime.GOOS != "windows" {
		t.Skip("Windows system API is unavailable")
	}
	got, err := utils.GetWindowsSystemExe("flyenv-nonexistent-system-tool-for-test")
	if got != "" || !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("missing system file must fail without a command fallback, got %q, %v", got, err)
	}
}
