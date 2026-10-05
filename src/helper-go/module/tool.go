package module

import (
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"helper-go/utils"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"unicode/utf16"
)

const (
	flyEnvProfileMarkerBegin = "# >>> FlyEnv shell integration >>>"
	flyEnvProfileMarkerEnd   = "# <<< FlyEnv shell integration <<<"
)

var legacyFlyEnvAutoLoadBlock = regexp.MustCompile(`(?im)^[\t ]*# FlyEnv Auto-Load\r?\n[\t ]*\.[\t ]+["'][^"'\r\n]*[\\/]bin[\\/]flyenv\.ps1["'][\t ]*(?:\r?\n)?`)

// ToolManager embeds BaseManager, providing various system utility functionalities.
type ToolManager struct {
	BaseManager
	TargetUserSID string
}

type ExecResult struct {
	Stdout string `json:"stdout"`
	Stderr string `json:"stderr"`
}

type FlyEnvPowerShellProfileTarget struct {
	Edition string `json:"edition"`
	Path    string `json:"path"`
}

type FlyEnvPowerShellIntegrationRequest struct {
	ScriptPath   string                          `json:"scriptPath"`
	ScriptBase64 string                          `json:"scriptBase64"`
	Profiles     []FlyEnvPowerShellProfileTarget `json:"profiles"`
}

type FlyEnvPowerShellProfileResult struct {
	Edition string `json:"edition"`
	Path    string `json:"path"`
	State   string `json:"state"`
}

type FlyEnvPowerShellIntegrationResult struct {
	ScriptState string                          `json:"scriptState"`
	Profiles    []FlyEnvPowerShellProfileResult `json:"profiles"`
}

type flyEnvAtomicWrite struct {
	Path string
	Data []byte
}

type flyEnvAtomicWritePayload struct {
	PathBase64 string `json:"pathBase64"`
	DataBase64 string `json:"dataBase64"`
}

// copyFile 使用 Go 原生 API 复制文件
func copyFile(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0644)
}

func encodePowerShellCommand(script string) string {
	encoded := utf16.Encode([]rune(script))
	raw := make([]byte, len(encoded)*2)
	for i, value := range encoded {
		binary.LittleEndian.PutUint16(raw[i*2:], value)
	}
	return base64.StdEncoding.EncodeToString(raw)
}

func powerShellEncodedArgs(script string) []string {
	// 内联脚本不需要 -File，也不需要覆盖执行策略；企业应用控制限制仍由执行错误返回。
	return []string{
		"-NoProfile",
		"-NonInteractive",
		"-EncodedCommand",
		encodePowerShellCommand(script),
	}
}

// runPowerShellScript executes a PowerShell script body without writing a temporary script file.
func runPowerShellScript(script string) (string, string, error) {
	// 系统程序定位失败在执行前结束，不搜索 PATH。非终止 PowerShell 错误也必须
	// 变成失败，防止 CIM 查询/文件写入错误被正常退出码伪装成成功。
	executable, err := utils.GetPowerShellExe()
	if err != nil {
		return "", "", err
	}
	script = "$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = [Text.Encoding]::UTF8;\n" + script
	return utils.ExecCommand(executable, powerShellEncodedArgs(script), nil)
}

func flyEnvDataDirectoryRecoveryScript(dataDirectory, userSID string) string {
	dataDirectoryBase64 := base64.StdEncoding.EncodeToString([]byte(dataDirectory))
	userSIDBase64 := base64.StdEncoding.EncodeToString([]byte(userSID))
	return fmt.Sprintf(`
$ErrorActionPreference = 'Stop'
$dataPath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('%s'))
$userSid = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('%s'))
if ([string]::IsNullOrWhiteSpace($dataPath) -or [string]::IsNullOrWhiteSpace($userSid)) {
  throw 'FlyEnv data-directory recovery arguments are invalid'
}
if (Test-Path -LiteralPath $dataPath) {
  $item = Get-Item -LiteralPath $dataPath -Force -ErrorAction Stop
  if (-not $item.PSIsContainer) {
    throw 'FlyEnv data-directory recovery target is not a directory'
  }
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'FlyEnv data-directory recovery target is a reparse point'
  }
} else {
  [System.IO.Directory]::CreateDirectory($dataPath) | Out-Null
}
$item = Get-Item -LiteralPath $dataPath -Force -ErrorAction Stop
if (-not $item.PSIsContainer -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
  throw 'FlyEnv data-directory recovery target is invalid after creation'
}
$acl = Get-Acl -LiteralPath $dataPath -ErrorAction Stop
$userIdentity = New-Object System.Security.Principal.SecurityIdentifier($userSid)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule($userIdentity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
$acl.SetAccessRule($rule)
Set-Acl -LiteralPath $dataPath -AclObject $acl -ErrorAction Stop
`, dataDirectoryBase64, userSIDBase64)
}

// EnsureFlyEnvDataDirectory restores the single data root authorized by the
// elevated installer. It is intentionally separate from generic write helpers.
func (t *ToolManager) EnsureFlyEnvDataDirectory(dataDirectory string) (bool, error) {
	if runtime.GOOS != "windows" {
		return false, fmt.Errorf("FlyEnv data-directory recovery is only supported on Windows")
	}
	cleanDirectory, err := utils.ValidateFlyEnvDataDirectoryRoot(dataDirectory)
	if err != nil {
		return false, fmt.Errorf("FlyEnv data-directory recovery target is not allowed: %w", err)
	}
	userSID := t.TargetUserSID
	if userSID == "" {
		return false, fmt.Errorf("missing FlyEnv target user SID")
	}
	_, _, err = runPowerShellScript(flyEnvDataDirectoryRecoveryScript(cleanDirectory, userSID))
	if err != nil {
		return false, fmt.Errorf("FlyEnv data-directory recovery command failed: %w", err)
	}
	if _, err := utils.ValidateFlyEnvDataDirectoryRoot(cleanDirectory); err != nil {
		return false, fmt.Errorf("FlyEnv data-directory recovery validation failed: %w", err)
	}
	return true, nil
}

// WriteFileByRoot with improved cleanup
func (t *ToolManager) WriteFileByRoot(file string, content string) (bool, error) {
	if err := utils.ValidatePathForWrite(file); err != nil {
		return false, fmt.Errorf("path not allowed: %s: %w", file, err)
	}

	// Try writing directly first
	err := utils.WriteFileString(file, content)
	if err == nil {
		return true, nil
	}

	cacheFile := filepath.Join(os.TempDir(), fmt.Sprintf("%s.txt", utils.UUID(32)))
	defer os.Remove(cacheFile)

	err = utils.WriteFileString(cacheFile, content)
	if err != nil {
		return false, fmt.Errorf("failed to write to temporary file '%s': %w", cacheFile, err)
	}

	if err := copyFile(cacheFile, file); err != nil {
		return false, fmt.Errorf("failed to copy from temp '%s' to target '%s': %w", cacheFile, file, err)
	}

	return true, nil
}

func (t *ToolManager) WriteBufferBase64ByRoot(file string, content string) (bool, error) {
	if err := utils.ValidatePathForWrite(file); err != nil {
		return false, fmt.Errorf("path not allowed: %s: %w", file, err)
	}
	data, err := base64.StdEncoding.DecodeString(content)
	if err != nil {
		return false, fmt.Errorf("invalid base64 content: %w", err)
	}
	if err := os.WriteFile(file, data, 0644); err == nil {
		return true, nil
	}

	cacheFile := filepath.Join(os.TempDir(), fmt.Sprintf("%s.bin", utils.UUID(32)))
	defer os.Remove(cacheFile)

	if err := os.WriteFile(cacheFile, data, 0644); err != nil {
		return false, fmt.Errorf("failed to write to temporary file '%s': %w", cacheFile, err)
	}
	if err := copyFile(cacheFile, file); err != nil {
		return false, fmt.Errorf("failed to copy from temp '%s' to target '%s': %w", cacheFile, file, err)
	}
	return true, nil
}

type flyEnvProfileEncoding uint8

const (
	flyEnvProfileEncodingUTF8 flyEnvProfileEncoding = iota
	flyEnvProfileEncodingUTF8BOM
	flyEnvProfileEncodingUTF16LE
	flyEnvProfileEncodingUTF16BE
)

func decodeFlyEnvProfile(data []byte) (string, flyEnvProfileEncoding, error) {
	if len(data) >= 3 && data[0] == 0xef && data[1] == 0xbb && data[2] == 0xbf {
		return string(data[3:]), flyEnvProfileEncodingUTF8BOM, nil
	}
	if len(data) >= 2 && data[0] == 0xff && data[1] == 0xfe {
		if (len(data)-2)%2 != 0 {
			return "", 0, fmt.Errorf("invalid UTF-16LE PowerShell profile")
		}
		values := make([]uint16, (len(data)-2)/2)
		for i := range values {
			values[i] = binary.LittleEndian.Uint16(data[2+i*2:])
		}
		return string(utf16.Decode(values)), flyEnvProfileEncodingUTF16LE, nil
	}
	if len(data) >= 2 && data[0] == 0xfe && data[1] == 0xff {
		if (len(data)-2)%2 != 0 {
			return "", 0, fmt.Errorf("invalid UTF-16BE PowerShell profile")
		}
		values := make([]uint16, (len(data)-2)/2)
		for i := range values {
			values[i] = binary.BigEndian.Uint16(data[2+i*2:])
		}
		return string(utf16.Decode(values)), flyEnvProfileEncodingUTF16BE, nil
	}
	return string(data), flyEnvProfileEncodingUTF8, nil
}

func encodeFlyEnvProfile(content string, encoding flyEnvProfileEncoding) []byte {
	switch encoding {
	case flyEnvProfileEncodingUTF8BOM:
		return append([]byte{0xef, 0xbb, 0xbf}, []byte(content)...)
	case flyEnvProfileEncodingUTF16LE, flyEnvProfileEncodingUTF16BE:
		values := utf16.Encode([]rune(content))
		result := make([]byte, 2+len(values)*2)
		if encoding == flyEnvProfileEncodingUTF16LE {
			result[0], result[1] = 0xff, 0xfe
			for i, value := range values {
				binary.LittleEndian.PutUint16(result[2+i*2:], value)
			}
		} else {
			result[0], result[1] = 0xfe, 0xff
			for i, value := range values {
				binary.BigEndian.PutUint16(result[2+i*2:], value)
			}
		}
		return result
	default:
		return []byte(content)
	}
}

func flyEnvProfileNewline(content string) string {
	if strings.Contains(content, "\r\n") {
		return "\r\n"
	}
	return "\n"
}

func flyEnvProfileBlock(scriptPath, newline string) string {
	quotedPath := strings.ReplaceAll(scriptPath, "'", "''")
	return strings.Join([]string{
		flyEnvProfileMarkerBegin,
		"$flyenvScript = '" + quotedPath + "'",
		"if (Test-Path -LiteralPath $flyenvScript) {",
		"  . $flyenvScript",
		"}",
		flyEnvProfileMarkerEnd,
	}, newline)
}

func reconcileFlyEnvProfile(content, scriptPath string) (string, bool, error) {
	original := content
	content = legacyFlyEnvAutoLoadBlock.ReplaceAllString(content, "")
	beginCount := strings.Count(content, flyEnvProfileMarkerBegin)
	endCount := strings.Count(content, flyEnvProfileMarkerEnd)
	if beginCount != endCount || beginCount > 1 {
		return "", false, fmt.Errorf("ambiguous FlyEnv PowerShell profile marker blocks")
	}
	newline := flyEnvProfileNewline(content)
	block := flyEnvProfileBlock(scriptPath, newline)
	start := strings.Index(content, flyEnvProfileMarkerBegin)
	end := strings.Index(content, flyEnvProfileMarkerEnd)
	if start >= 0 || end >= 0 {
		if start < 0 || end < start {
			return "", false, fmt.Errorf("incomplete FlyEnv PowerShell profile marker block")
		}
		end += len(flyEnvProfileMarkerEnd)
		updated := content[:start] + block + content[end:]
		return updated, updated != original, nil
	}
	separator := ""
	if strings.TrimSpace(content) != "" {
		separator = newline + newline
	}
	updated := content + separator + block + newline
	return updated, updated != original, nil
}

func writeFlyEnvAtomically(path string, data []byte) error {
	if runtime.GOOS == "windows" {
		return writeFlyEnvAtomicallyBatchWithPowerShell([]flyEnvAtomicWrite{{Path: path, Data: data}})
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(dir, ".flyenv-shell-*")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if _, err = temporary.Write(data); err != nil {
		temporary.Close()
		return err
	}
	if err = temporary.Sync(); err != nil {
		temporary.Close()
		return err
	}
	if err = temporary.Close(); err != nil {
		return err
	}
	return os.Rename(temporaryPath, path)
}

// Some redirected OneDrive profile folders reject the .NET/Win32 file-create
// path used by os.CreateTemp/os.WriteFile while accepting the PowerShell
// provider's byte stream and Move-Item operations. Send all changed files in
// one PowerShell process; each file still has its own same-directory atomic
// replacement.
func writeFlyEnvAtomicallyBatchWithPowerShell(writes []flyEnvAtomicWrite) error {
	if len(writes) == 0 {
		return nil
	}
	payload := make([]flyEnvAtomicWritePayload, 0, len(writes))
	for _, write := range writes {
		// 原业务入口已经验证 runtime/profile 的精确范围；这里在序列化前重查语法
		// 和路径链。不能按通用 allowed-root 重验 profile，否则重定向 Documents 会被误拒绝。
		if err := utils.ValidateWindowsAbsolutePath(write.Path, true); err != nil {
			return err
		}
		if hasReparse, err := utils.PathHasSymlinkComponent(write.Path); err != nil {
			return err
		} else if hasReparse {
			return fmt.Errorf("PowerShell write path contains a reparse point")
		}
		payload = append(payload, flyEnvAtomicWritePayload{
			PathBase64: base64.StdEncoding.EncodeToString([]byte(write.Path)),
			DataBase64: base64.StdEncoding.EncodeToString(write.Data),
		})
	}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to encode FlyEnv PowerShell write payload: %w", err)
	}
	payloadBase64 := base64.StdEncoding.EncodeToString(payloadJSON)
	script := fmt.Sprintf(`$ErrorActionPreference = 'Stop'
$payloadJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('%s'))
$writes = $payloadJson | ConvertFrom-Json
foreach ($write in @($writes)) {
  $target = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([string]$write.pathBase64))
  [byte[]]$bytes = [Convert]::FromBase64String([string]$write.dataBase64)
  $directory = Split-Path -Parent $target
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  $temporary = Join-Path $directory ('.flyenv-shell-' + [Guid]::NewGuid().ToString('N') + '.tmp')
  try {
    Set-Content -LiteralPath $temporary -Value $bytes -Encoding Byte -Force
    Move-Item -LiteralPath $temporary -Destination $target -Force -ErrorAction Stop
  }
  finally {
    if (Test-Path -LiteralPath $temporary) {
      Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    }
  }

}`, payloadBase64)
	_, stderr, err := runPowerShellScript(script)
	if err != nil {
		return fmt.Errorf("PowerShell provider batch write failed: %w: %s", err, strings.TrimSpace(stderr))
	}
	return nil
}

func writeFlyEnvScript(path string, data []byte) (string, error) {
	if existing, err := os.ReadFile(path); err == nil && string(existing) == string(data) {
		return "unchanged", nil
	}
	if err := writeFlyEnvAtomically(path, data); err != nil {
		return "failed", err
	}
	return "updated", nil
}

func writeFlyEnvProfile(target FlyEnvPowerShellProfileTarget, scriptPath string) (FlyEnvPowerShellProfileResult, error) {
	result, write, err := prepareFlyEnvProfileWrite(target, scriptPath)
	if err != nil || write == nil {
		return result, err
	}
	if err := writeFlyEnvAtomically(write.Path, write.Data); err != nil {
		return FlyEnvPowerShellProfileResult{}, err
	}
	return result, nil
}

func prepareFlyEnvProfileWrite(target FlyEnvPowerShellProfileTarget, scriptPath string) (FlyEnvPowerShellProfileResult, *flyEnvAtomicWrite, error) {
	cleanPath, err := utils.ValidateFlyEnvPowerShellProfilePath(target.Path, target.Edition)
	if err != nil {
		return FlyEnvPowerShellProfileResult{}, nil, err
	}
	original, readErr := os.ReadFile(cleanPath)
	if readErr != nil && !os.IsNotExist(readErr) {
		return FlyEnvPowerShellProfileResult{}, nil, readErr
	}
	content, encoding := "", flyEnvProfileEncodingUTF8
	if readErr == nil {
		content, encoding, err = decodeFlyEnvProfile(original)
		if err != nil {
			return FlyEnvPowerShellProfileResult{}, nil, err
		}
	}
	updated, changed, err := reconcileFlyEnvProfile(content, scriptPath)
	if err != nil {
		return FlyEnvPowerShellProfileResult{}, nil, err
	}
	state := "unchanged"
	if changed {
		state = "updated"
		return FlyEnvPowerShellProfileResult{Edition: target.Edition, Path: cleanPath, State: state}, &flyEnvAtomicWrite{
			Path: cleanPath,
			Data: encodeFlyEnvProfile(updated, encoding),
		}, nil
	}
	return FlyEnvPowerShellProfileResult{Edition: target.Edition, Path: cleanPath, State: state}, nil, nil
}

// validateFlyEnvPowerShellProfiles deliberately does not consult TargetUserSID.
// Electron's Documents known-folder result is the authority for profile
// placement; ownership is not a requirement for redirected Documents trees.
func (t *ToolManager) validateFlyEnvPowerShellProfiles(
	requested []FlyEnvPowerShellProfileTarget,
) ([]FlyEnvPowerShellProfileTarget, error) {
	profiles := make([]FlyEnvPowerShellProfileTarget, 0, len(requested))
	seenEditions := make(map[string]bool)
	for _, profile := range requested {
		if seenEditions[profile.Edition] {
			return nil, fmt.Errorf("duplicate PowerShell profile edition: %s", profile.Edition)
		}
		cleanProfilePath, err := utils.ValidateFlyEnvPowerShellProfilePath(profile.Path, profile.Edition)
		if err != nil {
			return nil, fmt.Errorf("invalid %s profile: %w", profile.Edition, err)
		}
		// The renderer derives this path from Electron app.getPath("documents").
		// That known-folder result is authoritative: redirected or restored
		// Documents trees need not have an ancestor owned by the target SID.
		seenEditions[profile.Edition] = true
		profiles = append(profiles, FlyEnvPowerShellProfileTarget{Edition: profile.Edition, Path: cleanProfilePath})
	}
	return profiles, nil
}

// InstallFlyEnvPowerShellIntegration is deliberately narrower than the
// generic writeFileByRoot operation. It can only update FlyEnv's runtime
// script and the two edition-specific standard PowerShell profile locations.
func (t *ToolManager) InstallFlyEnvPowerShellIntegration(
	request FlyEnvPowerShellIntegrationRequest,
) (FlyEnvPowerShellIntegrationResult, error) {
	if runtime.GOOS != "windows" {
		return FlyEnvPowerShellIntegrationResult{}, fmt.Errorf("PowerShell integration is only supported on Windows")
	}
	if request.ScriptPath == "" || len(request.ScriptBase64) == 0 {
		return FlyEnvPowerShellIntegrationResult{}, fmt.Errorf("FlyEnv PowerShell integration requires a script path and content")
	}
	cleanScriptPath, err := utils.ValidateFlyEnvPowerShellRuntimeScriptPath(request.ScriptPath)
	if err != nil {
		return FlyEnvPowerShellIntegrationResult{}, fmt.Errorf("runtime script path is not allowed: %w", err)
	}
	script, err := base64.StdEncoding.DecodeString(request.ScriptBase64)
	if err != nil || len(script) == 0 || len(script) > 1024*1024 {
		return FlyEnvPowerShellIntegrationResult{}, fmt.Errorf("invalid FlyEnv PowerShell runtime script content")
	}
	if len(request.Profiles) == 0 {
		return FlyEnvPowerShellIntegrationResult{}, fmt.Errorf("no PowerShell profiles were discovered")
	}
	profiles, err := t.validateFlyEnvPowerShellProfiles(request.Profiles)
	if err != nil {
		return FlyEnvPowerShellIntegrationResult{}, err
	}
	scriptState := "updated"
	writes := make([]flyEnvAtomicWrite, 0, len(profiles)+1)
	if existing, readErr := os.ReadFile(cleanScriptPath); readErr == nil && string(existing) == string(script) {
		scriptState = "unchanged"
	} else if readErr != nil && !os.IsNotExist(readErr) {
		return FlyEnvPowerShellIntegrationResult{}, fmt.Errorf("failed to read FlyEnv runtime script: %w", readErr)
	} else {
		writes = append(writes, flyEnvAtomicWrite{Path: cleanScriptPath, Data: script})
	}
	result := FlyEnvPowerShellIntegrationResult{ScriptState: scriptState}
	for _, profile := range profiles {
		profileResult, write, err := prepareFlyEnvProfileWrite(profile, cleanScriptPath)
		if err != nil {
			return FlyEnvPowerShellIntegrationResult{}, fmt.Errorf("failed to update %s profile: %w", profile.Edition, err)
		}
		result.Profiles = append(result.Profiles, profileResult)
		if write != nil {
			writes = append(writes, *write)
		}
	}
	if err := writeFlyEnvAtomicallyBatchWithPowerShell(writes); err != nil {
		return FlyEnvPowerShellIntegrationResult{}, fmt.Errorf("failed to install FlyEnv PowerShell integration: %w", err)
	}
	return result, nil
}

// ReadFileByRoot with improved cleanup
func (t *ToolManager) ReadFileByRoot(file string) (string, error) {
	if err := utils.ValidatePathForRead(file); err != nil {
		return "", fmt.Errorf("path not allowed: %s: %w", file, err)
	}

	content, err := utils.ReadFile(file)
	if err == nil {
		return content, nil
	}

	cacheFile := filepath.Join(os.TempDir(), fmt.Sprintf("%s.txt", utils.UUID(32)))
	defer os.Remove(cacheFile)

	if err := copyFile(file, cacheFile); err != nil {
		return "", fmt.Errorf("failed to copy from target '%s' to temp '%s': %w", file, cacheFile, err)
	}

	content, err = utils.ReadFile(cacheFile)
	if err != nil {
		return "", fmt.Errorf("failed to read from temporary file '%s': %w", cacheFile, err)
	}

	return content, nil
}

// ProcessInfo represents a process's details.
type ProcessInfo struct {
	USER    string
	PID     string
	PPID    string
	COMMAND string
}

// ProcessList returns a list of running processes.
func (t *ToolManager) ProcessList() ([]ProcessInfo, error) {
	// Windows 的对应 RPC 为 ProcessListWin；误调 Unix 入口应明确失败，不能因
	// ps 不存在/被执行层拒绝而返回空列表，让调用者误判所有服务已经退出。
	if utils.IsWindows() {
		return nil, fmt.Errorf("use ProcessListWin to query Windows processes")
	}
	stdout, stderr, err := utils.ExecCommand("ps", []string{"axo", "user,pid,ppid,command"}, nil)
	if err != nil {
		// 进程列表是停止归属与残留确认的证据；查询失败不能伪装成空列表，
		// 否则上层会把“无法读取”当成“服务已退出”并注销重试状态。
		return nil, fmt.Errorf("failed to execute ps command: %w; stderr: %s", err, stderr)
	}

	res := strings.TrimSpace(stdout)
	if res == "" {
		return nil, fmt.Errorf("ps returned an empty process list")
	}

	lines := strings.Split(res, "\n")
	processes := make([]ProcessInfo, 0, len(lines))

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		// ps 会输出该固定表头，可安全跳过；其余格式错误的记录都必须报错，不能从
		// 停止归属快照中静默删除后继续操作。
		if len(parts) >= 3 && strings.EqualFold(parts[1], "PID") && strings.EqualFold(parts[2], "PPID") {
			continue
		}
		if len(parts) < 3 {
			return nil, fmt.Errorf("invalid ps process list row")
		}
		if _, parseErr := strconv.Atoi(parts[1]); parseErr != nil {
			return nil, fmt.Errorf("invalid ps process PID")
		}
		if _, parseErr := strconv.Atoi(parts[2]); parseErr != nil {
			return nil, fmt.Errorf("invalid ps process parent PID")
		}

		user := parts[0]
		pid := parts[1]
		ppid := parts[2]
		command := strings.Join(parts[3:], " ")

		processes = append(processes, ProcessInfo{
			USER:    user,
			PID:     pid,
			PPID:    ppid,
			COMMAND: command,
		})
	}

	return processes, nil
}

func (t *ToolManager) ProcessListWin() (string, error) {
	// 实际程序路径供 PHP 的孤立 worker 归属使用；相对命令行不足以区分安装目录。
	script := `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::InputEncoding = [System.Text.Encoding]::UTF8; @(Get-CimInstance Win32_Process | Select-Object CommandLine,ExecutablePath,ProcessId,ParentProcessId,CreationClassName) | ConvertTo-Json`
	stdout, stderr, err := runPowerShellScript(script)
	if err != nil {
		return "", fmt.Errorf("failed to execute PowerShell script: %w, stderr: %s", err, stderr)
	}
	return strings.TrimSpace(stdout), nil
}

// Rm removes a file or directory recursively.
func (t *ToolManager) Rm(dir string) (bool, error) {
	if err := utils.ValidatePathForRemove(dir); err != nil {
		return false, fmt.Errorf("path not allowed: %s: %w", dir, err)
	}
	if err := os.RemoveAll(dir); err != nil {
		fmt.Printf("Warning: failed to remove '%s': %v\n", dir, err)
	}
	return true, nil
}

// Chmod changes the permissions of a file or directory.
func (t *ToolManager) Chmod(dir, flag string) (bool, error) {
	if err := utils.ValidatePathForWrite(dir); err != nil {
		return false, fmt.Errorf("path not allowed: %s: %w", dir, err)
	}
	if err := utils.ValidateChmodMode(flag); err != nil {
		return false, err
	}
	if utils.ExistsSync(dir) {
		if runtime.GOOS == "windows" {
			fmt.Printf("Info: chmod not fully supported on Windows, skipping '%s'\n", dir)
			return true, nil
		}
		_, stderr, err := utils.ExecCommand("chmod", []string{flag, dir}, nil)
		if err != nil {
			fmt.Printf("Warning: failed to chmod '%s' with '%s': %v, stderr: %s\n", dir, flag, err, stderr)
		}
	}
	return true, nil
}

// Kill 保持旧的 Unix 两参数调用兼容；Windows RPC 通过 KillWithIdentity 传入身份
// 快照，使每个仍存活的 PID 都先与进程创建时间绑定再执行结束。
func (t *ToolManager) Kill(sig string, pids []string, treeIdentities ...[]utils.ProcessStartIdentity) (bool, error) {
	if len(treeIdentities) > 1 {
		return false, fmt.Errorf("invalid process identities")
	}
	return t.KillWithIdentity(sig, pids, len(treeIdentities) == 1, firstProcessIdentity(treeIdentities))
}

// KillWithIdentity 是 RPC 执行入口。它在发送信号前验证完整请求；Windows 普通 PID
// 模式逐个核验目标；服务模式接收完整有序 PID，先父后子，后代继承首次列表归属。
// tree 参数名为旧 RPC 兼容保留；执行端不再使用 /T，也不另外扩大后代集合。
func (t *ToolManager) KillWithIdentity(sig string, pids []string, tree bool, identities []utils.ProcessStartIdentity) (bool, error) {
	if len(pids) == 0 {
		return true, nil
	}
	if err := utils.ValidateSignal(sig); err != nil {
		return false, err
	}
	for _, pid := range pids {
		if err := utils.ValidatePID(pid); err != nil {
			return false, err
		}
	}
	if tree {
		if err := utils.KillWindowsProcessTrees(pids, identities); err != nil {
			return false, err
		}
		return true, nil
	}

	if runtime.GOOS == "windows" {
		if err := utils.KillWindowsProcesses(pids, identities); err != nil {
			return false, err
		}
	} else {
		args := append([]string{sig}, pids...)
		_, stderr, err := utils.ExecCommand("kill", args, nil)
		if err != nil {
			return false, fmt.Errorf("failed to kill processes: %w, stderr: %s", err, stderr)
		}
	}
	return true, nil
}

func firstProcessIdentity(values [][]utils.ProcessStartIdentity) []utils.ProcessStartIdentity {
	if len(values) == 1 {
		return values[0]
	}
	return nil
}

// Lns creates a symbolic link.
func (t *ToolManager) Lns(oldname, newname string) (bool, error) {
	if err := utils.ValidateSymlinkPair(oldname, newname); err != nil {
		return false, fmt.Errorf("symlink path not allowed: %s -> %s: %w", oldname, newname, err)
	}
	if utils.ExistsSync(oldname) {
		if err := os.Symlink(oldname, newname); err != nil {
			fmt.Printf("Warning: failed to create symlink from '%s' to '%s': %v\n", oldname, newname, err)
		}
	}
	return true, nil
}

// KillPorts 停止给定端口的监听者，并通过身份快照拒绝 PID/监听者复用。
func (t *ToolManager) KillPorts(ports []string, identitySnapshots ...[]utils.ProcessStartIdentity) (bool, error) {
	if len(identitySnapshots) > 1 {
		return false, fmt.Errorf("invalid process identities")
	}
	return t.KillPortsWithIdentity(ports, firstProcessIdentity(identitySnapshots))
}

// KillPortsWithIdentity 拒绝监听者集合变化和 PID 复用。Windows 只发现当前处于
// LISTENING 状态的所有者，将其映射到调用方原始身份快照，并在 taskkill 期间保留
// 原进程句柄。Unix 延续 lsof/kill 路径，但查询和执行错误会真实返回。
func (t *ToolManager) KillPortsWithIdentity(ports []string, identities []utils.ProcessStartIdentity) (bool, error) {
	pids := make(map[string]struct{})
	// 先校验整份请求，再进行系统查询；空请求直接成功，不为无目标操作定位程序。
	for _, port := range ports {
		if err := utils.ValidatePort(port); err != nil {
			return false, err
		}
	}
	if len(ports) == 0 {
		return true, nil
	}
	for _, port := range ports {
		if runtime.GOOS == "windows" {
			// 仅停止 Listen 状态；PowerShell cmdlet 返回结构化枚举，不依赖系统语言
			// 下 netstat 的表头/状态文字。一般 getPortPids 仍查询所有 TCP 状态。
			listeners, err := queryWindowsTCPProcessIDs(port, true)
			if err != nil {
				return false, fmt.Errorf("port listener query failed for port %s: %w", port, err)
			}
			for _, pid := range listeners {
				if err := utils.ValidatePID(pid); err != nil {
					return false, fmt.Errorf("invalid Windows TCP listener PID")
				}
				pids[pid] = struct{}{}
			}
			continue
		}
		var stdout string
		var stderr string
		var err error
		noMatch := false
		// 查询专门限制为 TCP LISTEN，避免把任意连接行误当成合法空监听结果。
		stdout, stderr, err = utils.ExecCommand("lsof", []string{"-nP", "-iTCP:" + port, "-sTCP:LISTEN"}, nil)
		if err != nil {
			// lsof 仅在退出码 1 且标准输出/错误均为空时表示无匹配监听者；其他
			// 执行/权限错误或诊断输出必须传播，不能被解释成端口空闲。
			var exitErr *exec.ExitError
			if stdout == "" && stderr == "" &&
				errors.As(err, &exitErr) && exitErr.ExitCode() == 1 {
				err = nil
				noMatch = true
			}
		}
		if err != nil {
			// 查询失败不等于端口没有监听者；任何平台都不能跳过错误后伪报成功。
			return false, fmt.Errorf("port detection failed for port %s: %w", port, err)
		}
		if noMatch {
			continue
		}
		if strings.TrimSpace(stdout) == "" {
			return false, fmt.Errorf("lsof returned an empty listener query result for port %s", port)
		}

		lines := strings.Split(strings.TrimSpace(stdout), "\n")
		dataRows := 0
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}

			parts := strings.Fields(line)
			if len(parts) >= 2 && strings.EqualFold(parts[0], "COMMAND") && strings.EqualFold(parts[1], "PID") {
				continue
			}
			dataRows++
			// lsof -iTCP -sTCP:LISTEN 的完整行包含 FD、TYPE、DEVICE、SIZE/OFF、
			// NODE 及 TCP 名称/状态列。仅有 COMMAND/PID 等少量字段不是可靠快照。
			if len(parts) < 10 || !validLsofPortRow(parts) || parts[7] != "TCP" || !strings.Contains(line, "(LISTEN)") {
				return false, fmt.Errorf("invalid lsof listener row")
			}
			pid := parts[1]
			if utils.ValidatePID(pid) != nil {
				return false, fmt.Errorf("invalid lsof listener PID")
			}
			pids[pid] = struct{}{}
		}
		if dataRows == 0 {
			return false, fmt.Errorf("lsof returned no listener rows for port %s", port)
		}
	}

	if len(pids) > 0 {
		pidList := make([]string, 0, len(pids))
		for pid := range pids {
			pidList = append(pidList, pid)
		}

		if runtime.GOOS == "windows" {
			currentIdentities, err := identitiesForCurrentPortOwners(pidList, identities)
			if err != nil {
				return false, err
			}
			if err := utils.KillWindowsProcesses(pidList, currentIdentities); err != nil {
				return false, err
			}
		} else {
			_, stderr, err := utils.ExecCommand("kill", append([]string{"-9"}, pidList...), nil)
			if err != nil {
				return false, fmt.Errorf("failed to kill processes for ports: %w, stderr: %s", err, stderr)
			}
		}
	}
	return true, nil
}

// validLsofPortRow 检查 lsof -nP -i 的固定列，防止把截断/任意文本当成空端口。
// 通用查询还支持 UDP：它的 NAME 通常只有一段，因此最少九列；TCP LISTEN
// 查询另行要求状态列和 (LISTEN)。NAME 可以含空格，所以剩余列合并校验。
func validLsofPortRow(parts []string) bool {
	if len(parts) < 9 || utils.ValidatePID(parts[1]) != nil {
		return false
	}
	if parts[3] == "" || (parts[4] != "IPv4" && parts[4] != "IPv6") || parts[5] == "" || parts[6] == "" || (parts[7] != "TCP" && parts[7] != "UDP") {
		return false
	}
	return strings.Contains(strings.Join(parts[8:], " "), ":")
}

func identitiesForCurrentPortOwners(pids []string, identities []utils.ProcessStartIdentity) ([]utils.ProcessStartIdentity, error) {
	// A port request is authorized for the process that owned it at the caller's
	// snapshot time. Missing/changed owners must fail closed; never build identities
	// for newly observed listeners from their current PID alone.
	expected := make(map[string]utils.ProcessStartIdentity, len(identities))
	for _, identity := range identities {
		pid := strconv.FormatUint(uint64(identity.PID), 10)
		if _, duplicate := expected[pid]; duplicate {
			return nil, fmt.Errorf("duplicate Windows port owner identity; PID=%s", pid)
		}
		expected[pid] = identity
	}
	current := make([]utils.ProcessStartIdentity, 0, len(pids))
	for _, pid := range pids {
		identity, exists := expected[pid]
		if !exists {
			return nil, fmt.Errorf("Windows port owner changed; refresh and retry")
		}
		current = append(current, identity)
	}
	return current, nil
}

// queryWindowsTCPProcessIDs 使用固定系统 PowerShell 的 NetTCP cmdlet，而不是解析
// netstat 的本地化表头/State 文本。通用端口查询保留所有 TCP 状态；停止端口只取
// Listen。仅精确的 CIM 无匹配错误代表空集合，其他提供程序/权限错误必须上抛。
func queryWindowsTCPProcessIDs(port string, listeningOnly bool) ([]string, error) {
	state := ""
	if listeningOnly {
		state = " -State Listen"
	}
	script := fmt.Sprintf(`
$port = %s
try { $connections = @(Get-NetTCPConnection -LocalPort $port%s -ErrorAction Stop) }
catch {
  $errorId = [string]$_.FullyQualifiedErrorId
  if ($_.CategoryInfo.Category -eq [System.Management.Automation.ErrorCategory]::ObjectNotFound -and $errorId -like 'CmdletizationQuery_NotFound*,Get-NetTCPConnection*') { $connections = @() }
  else { throw }
}
$global:FlyEnvTcpProcessIds = @($connections | Select-Object -ExpandProperty OwningProcess | ForEach-Object { [string]$_ } | Sort-Object -Unique)
ConvertTo-Json -InputObject $global:FlyEnvTcpProcessIds -Compress`, port, state)
	stdout, stderr, err := runPowerShellScript(script)
	if err != nil {
		return nil, fmt.Errorf("Windows TCP port query failed: %w; stderr: %s", err, stderr)
	}
	var pids []string
	if err := json.Unmarshal([]byte(strings.TrimSpace(stdout)), &pids); err != nil || pids == nil {
		return nil, fmt.Errorf("invalid Windows TCP port query result")
	}
	for _, pid := range pids {
		value, err := strconv.ParseUint(pid, 10, 32)
		if err != nil || value > 2147483647 {
			return nil, fmt.Errorf("invalid Windows TCP owner PID")
		}
	}
	return pids, nil
}

// PortProcessInfo represents process information related to a port.
type PortProcessInfo struct {
	USER    string
	PID     string
	COMMAND string
}

// GetPortPids returns a list of processes using a specific port.
func (t *ToolManager) GetPortPids(port string) ([]PortProcessInfo, error) {
	if err := utils.ValidatePort(port); err != nil {
		return nil, err
	}
	if utils.IsWindows() {
		// getPortPids 是通用本地 TCP 端口所有者查询，明确覆盖各连接状态；停止
		// 服务使用上面的 listeningOnly 查询，不能把一般查询误收窄成监听者列表。
		ids, err := queryWindowsTCPProcessIDs(strings.TrimSpace(port), false)
		if err != nil {
			return nil, err
		}
		processes := make([]PortProcessInfo, 0, len(ids))
		for _, pid := range ids {
			// TIME_WAIT 等合法连接可返回 OwningProcess=0，表示没有可归属进程。
			// 通用查询忽略它；监听停止路径单独拒绝 PID 0，绝不将其作为 kill 目标。
			if pid == "0" {
				continue
			}
			processes = append(processes, PortProcessInfo{PID: pid})
		}
		return processes, nil
	}
	stdout, stderr, err := utils.ExecCommand("lsof", []string{"-nP", "-i:" + port}, nil)
	if err != nil {
		// 端口归属用于 stop 前检查；lsof 只有“退出码 1 且完全无输出”表示
		// 无匹配者。其他执行/权限/诊断错误必须传播，不能伪装成空端口列表。
		var exitErr *exec.ExitError
		if stdout == "" && stderr == "" && errors.As(err, &exitErr) && exitErr.ExitCode() == 1 {
			return []PortProcessInfo{}, nil
		}
		return nil, fmt.Errorf("port detection command failed for port %s: %w; stderr: %s", port, err, stderr)
	}

	res := strings.TrimSpace(stdout)
	if res == "" {
		return nil, fmt.Errorf("lsof returned an empty process query result for port %s", port)
	}
	lines := strings.Split(res, "\n")

	if len(lines) == 0 || (len(lines) == 1 && strings.TrimSpace(lines[0]) == "") {
		return []PortProcessInfo{}, nil
	}

	processes := make([]PortProcessInfo, 0, len(lines))
	dataRows := 0

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) >= 2 && strings.EqualFold(parts[0], "COMMAND") && strings.EqualFold(parts[1], "PID") {
			continue // skip header
		}
		dataRows++

		if !validLsofPortRow(parts) {
			return nil, fmt.Errorf("invalid lsof process list row")
		}

		command := parts[0]
		pid := parts[1]
		user := parts[2]
		processes = append(processes, PortProcessInfo{
			USER:    user,
			PID:     pid,
			COMMAND: command,
		})
	}
	if dataRows == 0 {
		return nil, fmt.Errorf("lsof returned no process rows for port %s", port)
	}
	return processes, nil
}

// GetSystemPath reads the system PATH from the Windows registry.
func (t *ToolManager) GetSystemPath() (string, error) {
	if !utils.IsWindows() {
		return "", fmt.Errorf("GetSystemPath is only supported on Windows")
	}
	value, err := windowsGetMachineEnvRaw("Path")
	if err != nil {
		return "", fmt.Errorf("failed to get system PATH: %w", err)
	}
	return value, nil
}

// SetSystemPath writes the system PATH to Windows registry.
func (t *ToolManager) SetSystemPath(paths []string, otherVars map[string]string, expectedPath *string) (bool, error) {
	if !utils.IsWindows() {
		return false, fmt.Errorf("SetSystemPath is only supported on Windows")
	}
	if err := utils.ValidateSystemPathPayload(paths); err != nil {
		return false, err
	}

	for k, v := range otherVars {
		if err := utils.ValidateSystemEnvKey(k, true); err != nil {
			return false, err
		}
		if err := utils.ValidateSystemEnvValue(k, v); err != nil {
			return false, err
		}
	}

	if expectedPath != nil {
		currentPath, err := windowsGetMachineEnvRaw("Path")
		if err != nil {
			return false, fmt.Errorf("failed to get system PATH: %w", err)
		}
		if currentPath != *expectedPath {
			return false, fmt.Errorf("system_path_changed")
		}
	}

	pathStr := strings.Join(paths, ";")
	if err := windowsSetMachineEnvExpandString("Path", pathStr); err != nil {
		return false, fmt.Errorf("failed to set system PATH: %w", err)
	}

	for k, v := range otherVars {
		if err := windowsSetMachineEnv(k, v); err != nil {
			return false, fmt.Errorf("failed to set system env %s: %w", k, err)
		}
	}

	if err := windowsSetMachineEnv("FLYENV_ENV_FLUSH", "0"); err != nil {
		return false, fmt.Errorf("failed to set FLYENV_ENV_FLUSH: %w", err)
	}
	// 只确认注册表提交；通知由 FlyEnv 实际环境业务 resolve/reject 后统一安排。
	// 不在 Helper 提前广播，避免业务仍在刷新列表时启动通知或收到两次通知。
	return true, nil
}

// SetSystemEnv sets a single machine-level environment variable on Windows.
func (t *ToolManager) SetSystemEnv(key, value string) (bool, error) {
	if !utils.IsWindows() {
		return false, fmt.Errorf("SetSystemEnv is only supported on Windows")
	}
	if err := utils.ValidateSystemEnvKey(key, false); err != nil {
		return false, err
	}
	if err := utils.ValidateSystemEnvValue(key, value); err != nil {
		return false, err
	}
	if err := windowsSetMachineEnv(key, value); err != nil {
		return false, fmt.Errorf("failed to set system env %s: %w", key, err)
	}
	// 单变量同样仅返回提交结果；alias 等业务会在完整操作结算后通知。
	return true, nil
}

// RunScript executes a shell script with the specified shell (macOS/Linux only).
func (t *ToolManager) RunScript(shell, scriptPath string) (ExecResult, error) {
	if utils.IsWindows() {
		return ExecResult{}, fmt.Errorf("RunScript is only supported on macOS/Linux")
	}
	if err := utils.ValidateRunScript(shell, scriptPath); err != nil {
		return ExecResult{}, err
	}
	stdout, stderr, err := utils.ExecCommand(shell, []string{scriptPath}, nil)
	if err != nil {
		return ExecResult{}, fmt.Errorf("%s: %s", err.Error(), stderr)
	}
	return ExecResult{Stdout: stdout, Stderr: stderr}, nil
}

// SetAutoStartWin creates or deletes a Windows scheduled task for auto-start.
func (t *ToolManager) SetAutoStartWin(enabled bool, taskName, exePath string) (bool, error) {
	if !utils.IsWindows() {
		return false, fmt.Errorf("SetAutoStartWin is only supported on Windows")
	}
	if err := utils.ValidateAutoStartTask(enabled, taskName, exePath); err != nil {
		return false, err
	}
	if taskName != "FlyEnvStartup" || t.TargetUserSID == "" {
		return false, fmt.Errorf("helper tasks are installer-owned; app startup requires target SID")
	}

	if enabled {
		// Register an interactive target-user task without a password prompt in
		// the SYSTEM helper session. The helper itself remains installer-owned.
		payload, err := json.Marshal(map[string]string{"exePath": exePath, "sid": t.TargetUserSID})
		if err != nil {
			return false, err
		}
		script := fmt.Sprintf(`$ErrorActionPreference = 'Stop'
$config = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('%s')) | ConvertFrom-Json
$scheduler = New-Object -ComObject 'Schedule.Service'
$scheduler.Connect()
$definition = $scheduler.NewTask(0)
$definition.Settings.ExecutionTimeLimit = 'PT0S'
$definition.Settings.DisallowStartIfOnBatteries = $false
$definition.Settings.StopIfGoingOnBatteries = $false
$trigger = $definition.Triggers.Create(9)
$trigger.UserId = $config.sid
$action = $definition.Actions.Create(0)
$action.Path = $config.exePath
$definition.Principal.UserId = $config.sid
$definition.Principal.LogonType = 3
$definition.Principal.RunLevel = 0
$scheduler.GetFolder('\').RegisterTaskDefinition('FlyEnvStartup', $definition, 6, $config.sid, $null, 3) | Out-Null
`, base64.StdEncoding.EncodeToString(payload))
		_, stderr, err := runPowerShellScript(script)
		if err != nil {
			return false, fmt.Errorf("failed to create auto start task: %w, stderr: %s", err, stderr)
		}
	} else {
		// 创建任务使用 PowerShell COM，不应因未使用的 schtasks 缺失而提前失败。
		// 只有删除任务时定位它，且禁止裸命令回退。
		schtasksExe, err := utils.GetWindowsSystemExe("schtasks")
		if err != nil {
			return false, err
		}
		_, stderr, err := utils.ExecCommand(schtasksExe, []string{"/delete", "/tn", taskName, "/f"}, nil)
		if err != nil {
			return false, fmt.Errorf("failed to delete auto start task: %w, stderr: %s", err, stderr)
		}
	}
	return true, nil
}

// RemoveLoginItemMac removes a login item on macOS.
func (t *ToolManager) RemoveLoginItemMac(name string) (bool, error) {
	if !utils.IsMacOS() {
		return false, fmt.Errorf("RemoveLoginItemMac is only supported on macOS")
	}
	// 只允许删除 FlyEnv 或 Electron 的登录项
	if name != "FlyEnv" && name != "Electron" {
		return false, fmt.Errorf("invalid login item name: %s (only FlyEnv or Electron allowed)", name)
	}
	// AppleScript strings escape double quotes by doubling them: " -> ""
	escapedName := strings.ReplaceAll(name, `"`, `""`)
	script := fmt.Sprintf(`tell application "System Events" to delete login item "%s"`, escapedName)
	scriptFile := filepath.Join(os.TempDir(), fmt.Sprintf("%s.scpt", utils.UUID(32)))
	if err := os.WriteFile(scriptFile, []byte(script), 0600); err != nil {
		return false, fmt.Errorf("failed to write temp script: %w", err)
	}
	defer os.Remove(scriptFile)
	_, stderr, err := utils.ExecCommand("osascript", []string{scriptFile}, nil)
	if err != nil {
		return false, fmt.Errorf("failed to remove login item %s: %w, stderr: %s", name, err, stderr)
	}
	return true, nil
}

// NewToolManager creates and returns a new instance of ToolManager.
func NewToolManager() *ToolManager {
	return &ToolManager{
		BaseManager: BaseManager{},
	}
}
