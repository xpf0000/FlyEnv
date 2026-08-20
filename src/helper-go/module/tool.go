package module

import (
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"helper-go/utils"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"unicode/utf16"
)

const (
	flyEnvProfileMarkerBegin = "# >>> FlyEnv shell integration >>>"
	flyEnvProfileMarkerEnd   = "# <<< FlyEnv shell integration <<<"
)

var legacyFlyEnvAutoLoadBlock = regexp.MustCompile(`(?im)^[\t ]*# FlyEnv Auto-Load\r?\n[\t ]*\.[\t ]+["'][^"'\r\n]*[\\/]bin[\\/]flyenv\.ps1["'][\t ]*(?:\r?\n)?`)

func resolveWindowsSystemExe(name string, systemRoot string, exists func(string) bool, isWindows bool) string {
	if !isWindows {
		return name
	}
	exeName := name
	if !strings.HasSuffix(strings.ToLower(exeName), ".exe") {
		exeName += ".exe"
	}
	if systemRoot == "" {
		systemRoot = `C:\Windows`
	}
	for _, candidate := range []string{
		filepath.Join(systemRoot, "Sysnative", exeName),
		filepath.Join(systemRoot, "System32", exeName),
	} {
		if exists(candidate) {
			return candidate
		}
	}
	return exeName
}

// getWindowsSystemExe 获取 Windows System32 下可执行文件的完整路径
// 如果文件存在则返回完整路径，否则回退到命令名本身
func getWindowsSystemExe(name string) string {
	if runtime.GOOS != "windows" {
		return name
	}
	systemRoot := os.Getenv("SystemRoot")
	utils.AppDebugLog("getWindowsSystemExe", fmt.Sprintf("name=%s SystemRoot=%q", name, systemRoot))
	if systemRoot == "" {
		systemRoot = `C:\Windows`
		utils.AppDebugLog("getWindowsSystemExe", "SystemRoot empty, fallback to C:\\Windows")
	}
	resolved := resolveWindowsSystemExe(name, systemRoot, utils.ExistsSync, true)
	utils.AppDebugLog("getWindowsSystemExe", fmt.Sprintf("Resolved %s to: %s", name, resolved))
	return resolved
}

// ToolManager embeds BaseManager, providing various system utility functionalities.
type ToolManager struct {
	BaseManager
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
	return []string{
		"-NoProfile",
		"-ExecutionPolicy",
		"Bypass",
		"-NonInteractive",
		"-EncodedCommand",
		encodePowerShellCommand(script),
	}
}

// runPowerShellScript executes a PowerShell script body without writing a temporary script file.
func runPowerShellScript(script string) (string, string, error) {
	return utils.ExecCommand(utils.GetPowerShellExe(), powerShellEncodedArgs(script), nil)
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
	userSID, err := utils.CurrentUserSID()
	if err != nil {
		return false, fmt.Errorf("failed to determine Helper user identity: %w", err)
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
	_, stderr, err := utils.ExecCommand(utils.GetPowerShellExe(), powerShellEncodedArgs(script), nil)
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

// InstallFlyEnvPowerShellIntegration is deliberately narrower than the
// generic writeFileByRoot operation. It can only update FlyEnv's runtime
// script and the current user's two standard PowerShell profile locations.
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
	profiles := make([]FlyEnvPowerShellProfileTarget, 0, len(request.Profiles))
	seenEditions := make(map[string]bool)
	for _, profile := range request.Profiles {
		if seenEditions[profile.Edition] {
			return FlyEnvPowerShellIntegrationResult{}, fmt.Errorf("duplicate PowerShell profile edition: %s", profile.Edition)
		}
		cleanProfilePath, validationErr := utils.ValidateFlyEnvPowerShellProfilePath(profile.Path, profile.Edition)
		if validationErr != nil {
			return FlyEnvPowerShellIntegrationResult{}, fmt.Errorf("invalid %s profile: %w", profile.Edition, validationErr)
		}
		seenEditions[profile.Edition] = true
		profiles = append(profiles, FlyEnvPowerShellProfileTarget{Edition: profile.Edition, Path: cleanProfilePath})
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
	stdout, _, err := utils.ExecCommand("ps", []string{"axo", "user,pid,ppid,command"}, nil)
	if err != nil {
		fmt.Printf("Warning: failed to execute ps command: %v\n", err)
		return []ProcessInfo{}, nil
	}

	res := strings.TrimSpace(stdout)
	if res == "" {
		return []ProcessInfo{}, nil
	}

	lines := strings.Split(res, "\n")
	processes := make([]ProcessInfo, 0, len(lines))

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Fields(line)

		if len(parts) < 4 {
			continue
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
	script := `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::InputEncoding = [System.Text.Encoding]::UTF8; @(Get-CimInstance Win32_Process | Select-Object CommandLine,ProcessId,ParentProcessId,CreationClassName) | ConvertTo-Json`
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

// Kill sends a signal to specified processes.
func (t *ToolManager) Kill(sig string, pids []string) (bool, error) {
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

	if runtime.GOOS == "windows" {
		taskkill := getWindowsSystemExe("taskkill")
		args := []string{"/f"}
		for _, pid := range pids {
			args = append(args, "/pid", pid)
		}
		_, stderr, err := utils.ExecCommand(taskkill, args, nil)
		if err != nil {
			fmt.Printf("Warning: failed to kill processes: %v, stderr: %s\n", err, stderr)
		}
	} else {
		args := append([]string{sig}, pids...)
		_, stderr, err := utils.ExecCommand("kill", args, nil)
		if err != nil {
			fmt.Printf("Warning: failed to kill processes: %v, stderr: %s\n", err, stderr)
		}
	}
	return true, nil
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

// KillPorts finds and kills processes listening on specified ports.
func (t *ToolManager) KillPorts(ports []string) (bool, error) {
	pids := make(map[string]struct{})

	for _, port := range ports {
		if err := utils.ValidatePort(port); err != nil {
			return false, err
		}
		var stdout string
		var err error
		if runtime.GOOS == "windows" {
			netstat := getWindowsSystemExe("netstat")
			stdout, _, err = utils.ExecCommand(netstat, []string{"-ano"}, nil)
		} else {
			stdout, _, err = utils.ExecCommand("lsof", []string{"-nP", "-i:" + port}, nil)
		}
		if err != nil {
			fmt.Printf("Warning: port detection command failed for port %s: %v\n", port, err)
			continue
		}

		lines := strings.Split(strings.TrimSpace(stdout), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}

			if runtime.GOOS == "windows" {
				if !netstatLineMatchesPort(line, port) || !strings.Contains(line, "LISTENING") {
					continue
				}
				parts := strings.Fields(line)
				if len(parts) >= 5 {
					pid := parts[len(parts)-1]
					if utils.ValidatePID(pid) == nil {
						pids[pid] = struct{}{}
					}
				}
			} else {
				if !strings.Contains(line, "(LISTEN)") {
					continue
				}
				parts := strings.Fields(line)
				if len(parts) >= 2 {
					pid := parts[1]
					if utils.ValidatePID(pid) == nil {
						pids[pid] = struct{}{}
					}
				}
			}
		}
	}

	if len(pids) > 0 {
		pidList := make([]string, 0, len(pids))
		for pid := range pids {
			pidList = append(pidList, pid)
		}

		if runtime.GOOS == "windows" {
			taskkill := getWindowsSystemExe("taskkill")
			args := append([]string{"/f"}, makePidKillArgs(pidList)...)
			_, stderr, err := utils.ExecCommand(taskkill, args, nil)
			if err != nil {
				fmt.Printf("Warning: failed to kill processes for ports: %v, stderr: %s\n", err, stderr)
			}
		} else {
			_, stderr, err := utils.ExecCommand("kill", append([]string{"-9"}, pidList...), nil)
			if err != nil {
				fmt.Printf("Warning: failed to kill processes for ports: %v, stderr: %s\n", err, stderr)
			}
		}
	}
	return true, nil
}

func makePidKillArgs(pids []string) []string {
	args := make([]string, 0, len(pids)*2)
	for _, pid := range pids {
		args = append(args, "/pid", pid)
	}
	return args
}

func netstatLineMatchesPort(line, port string) bool {
	parts := strings.Fields(line)
	if len(parts) < 5 {
		return false
	}
	return strings.HasSuffix(parts[1], ":"+port)
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
	stdout, _, err := utils.ExecCommand("lsof", []string{"-nP", "-i:" + port}, nil)
	if err != nil {
		fmt.Printf("Warning: port detection command failed for port %s: %v\n", port, err)
		return []PortProcessInfo{}, nil
	}

	res := strings.TrimSpace(stdout)
	lines := strings.Split(res, "\n")

	if len(lines) == 0 || (len(lines) == 1 && strings.TrimSpace(lines[0]) == "") {
		return []PortProcessInfo{}, nil
	}

	processes := make([]PortProcessInfo, 0, len(lines))

	for i, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if i == 0 && strings.HasPrefix(line, "COMMAND") {
			continue // skip header
		}

		parts := strings.Fields(line)
		if len(parts) < 3 {
			continue
		}

		command := parts[0]
		pid := parts[1]
		user := parts[2]
		if utils.ValidatePID(pid) != nil {
			continue
		}

		processes = append(processes, PortProcessInfo{
			USER:    user,
			PID:     pid,
			COMMAND: command,
		})
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
	windowsNotifyEnvironmentChanged()
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
	windowsNotifyEnvironmentChanged()
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

func autoStartRunLevel(taskName string) string {
	if taskName == "FlyEnvStartup" {
		return "limited"
	}
	return "highest"
}

// SetAutoStartWin creates or deletes a Windows scheduled task for auto-start.
func (t *ToolManager) SetAutoStartWin(enabled bool, taskName, exePath string) (bool, error) {
	if !utils.IsWindows() {
		return false, fmt.Errorf("SetAutoStartWin is only supported on Windows")
	}
	if err := utils.ValidateAutoStartTask(enabled, taskName, exePath); err != nil {
		return false, err
	}
	schtasksExe := getWindowsSystemExe("schtasks")

	if enabled {
		// schtasks 的 /tr 值在路径含空格时需要内层引号，否则 Task Scheduler
		// 会把首个空格前的部分当作可执行文件，导致登录时启动失败。
		// Go 的 exec.Command 在 Windows 上会用 syscall.EscapeArg 处理内层引号。
		trValue := `"` + exePath + `"`
		_, stderr, err := utils.ExecCommand(schtasksExe, []string{
			"/create", "/tn", taskName, "/tr", trValue,
			"/sc", "onlogon", "/rl", autoStartRunLevel(taskName), "/f",
		}, nil)
		if err != nil {
			return false, fmt.Errorf("failed to create auto start task: %w, stderr: %s", err, stderr)
		}
	} else {
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
