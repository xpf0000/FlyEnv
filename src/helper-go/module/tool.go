package module

import (
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"helper-go/utils"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"unicode/utf16"
)

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
	value, err := windowsGetMachineEnv("Path")
	if err != nil {
		return "", fmt.Errorf("failed to get system PATH: %w", err)
	}
	return strings.TrimSpace(value), nil
}

// SetSystemPath writes the system PATH to Windows registry.
func (t *ToolManager) SetSystemPath(paths []string, otherVars map[string]string) (bool, error) {
	if !utils.IsWindows() {
		return false, fmt.Errorf("SetSystemPath is only supported on Windows")
	}
	for _, p := range paths {
		if err := utils.ValidateSystemPathEntry(p); err != nil {
			return false, err
		}
	}
	pathStr := strings.Join(paths, ";") + ";"
	if err := windowsSetMachineEnvExpandString("Path", pathStr); err != nil {
		return false, fmt.Errorf("failed to set system PATH: %w", err)
	}

	for k, v := range otherVars {
		if err := utils.ValidateSystemEnvKey(k, true); err != nil {
			return false, err
		}
		if err := utils.ValidateSystemEnvValue(k, v); err != nil {
			return false, err
		}
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
