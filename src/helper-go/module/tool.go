package module

import (
	"fmt"
	"helper-go/utils" // Import your utils package
	"os"              // For os.TempDir
	"path/filepath"   // For filepath.Join, filepath.Dir
	"runtime"         // For runtime.GOOS detection
	"strings"         // For string manipulation
)

// ToolManager embeds BaseManager, providing various system utility functionalities.
type ToolManager struct {
	BaseManager // Anonymous field for composition and method "inheritance"
}

type ExecResult struct {
	Stdout string `json:"stdout"`
	Stderr string `json:"stderr"`
}

func (t *ToolManager) Exec(command string, options ...map[string]interface{}) (ExecResult, error) {
	var opts map[string]interface{}

	// Check if options were provided
	if len(options) > 0 {
		opts = options[0] // Use the first (and only expected) options map
	} else {
		opts = make(map[string]interface{}) // If no options provided, use an empty map
	}

	stdout, stderr, err := utils.ExecPromise(command, opts)
	if err != nil {
		return ExecResult{}, fmt.Errorf("%s: %s", err.Error(), stderr)
	}
	return ExecResult{Stdout: stdout, Stderr: stderr}, nil
}

// WriteFileByRoot with improved cleanup
func (t *ToolManager) WriteFileByRoot(file string, content string) (bool, error) {
	// Try writing directly first
	err := utils.WriteFileString(file, content)
	if err == nil {
		return true, nil // Success
	}

	// If direct write failed, assume permissions issue and try via temp file + copy
	cacheFile := filepath.Join(os.TempDir(), fmt.Sprintf("%s.txt", utils.UUID(32)))

	// Improved cleanup with defer
	defer func() {
		// First try native Go removal
		if err := os.Remove(cacheFile); err != nil {
			// If native fails, try command line
			if runtime.GOOS == "windows" {
				_, _, _ = utils.ExecPromise(fmt.Sprintf(`del /f /q "%s"`, cacheFile), nil)
			} else {
				_, _, _ = utils.ExecPromise(fmt.Sprintf(`rm -rf "%s"`, cacheFile), nil)
			}
		}
	}()

	// Write content to temp file
	err = utils.WriteFileString(cacheFile, content)
	if err != nil {
		return false, fmt.Errorf("failed to write to temporary file '%s': %w", cacheFile, err)
	}

	// Copy from temp file to target
	if runtime.GOOS == "windows" {
		_, stderr, err := utils.ExecPromise(fmt.Sprintf(`copy /y "%s" "%s"`, cacheFile, file), nil)
		if err != nil {
			return false, fmt.Errorf("failed to copy from temp '%s' to target '%s': %w, stderr: %s", cacheFile, file, err, stderr)
		}
	} else {
		_, stderr, err := utils.ExecPromise(fmt.Sprintf(`cp -f "%s" "%s"`, cacheFile, file), nil)
		if err != nil {
			return false, fmt.Errorf("failed to copy from temp '%s' to target '%s': %w, stderr: %s", cacheFile, file, err, stderr)
		}
	}

	return true, nil
}

// ReadFileByRoot with improved cleanup
func (t *ToolManager) ReadFileByRoot(file string) (string, error) {
	content, err := utils.ReadFile(file)
	if err == nil {
		return content, nil // Success
	}

	// If direct read failed, try via temp file + copy
	cacheFile := filepath.Join(os.TempDir(), fmt.Sprintf("%s.txt", utils.UUID(32)))

	// Improved cleanup with defer
	defer func() {
		if err := os.Remove(cacheFile); err != nil {
			if runtime.GOOS == "windows" {
				_, _, _ = utils.ExecPromise(fmt.Sprintf(`del /f /q "%s"`, cacheFile), nil)
			} else {
				_, _, _ = utils.ExecPromise(fmt.Sprintf(`rm -rf "%s"`, cacheFile), nil)
			}
		}
	}()

	// Copy from target file to temp file
	if runtime.GOOS == "windows" {
		_, stderr, err := utils.ExecPromise(fmt.Sprintf(`copy /y "%s" "%s"`, file, cacheFile), nil)
		if err != nil {
			return "", fmt.Errorf("failed to copy from target '%s' to temp '%s': %w, stderr: %s", file, cacheFile, err, stderr)
		}
	} else {
		_, stderr, err := utils.ExecPromise(fmt.Sprintf(`cp -f "%s" "%s"`, file, cacheFile), nil)
		if err != nil {
			return "", fmt.Errorf("failed to copy from target '%s' to temp '%s': %w, stderr: %s", file, cacheFile, err, stderr)
		}
	}

	// Read content from temp file
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
	stdout, _, err := utils.ExecPromise(`ps axo user,pid,ppid,command`, nil)
	if err != nil {
		// JS ignored errors from ps, so we'll log and return empty slice.
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
		parts := strings.Fields(line) // Splits by whitespace, handles multiple spaces

		if len(parts) < 4 { // Expect at least USER, PID, PPID, COMMAND
			continue // Skip malformed lines
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
	// Create temporary JSON file
	jsonFile := filepath.Join(os.TempDir(), fmt.Sprintf("%s.json", utils.UUID(32)))

	// Use defer with improved cleanup
	defer func() {
		// First try native Go removal
		if err := os.Remove(jsonFile); err != nil {
			// If native fails, try command line
			_, _, _ = utils.ExecPromise(fmt.Sprintf(`del /f /q "%s"`, jsonFile), nil)
		}
	}()

	// PowerShell command to get process info and output to JSON
	command := fmt.Sprintf(
		`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;[Console]::InputEncoding = [System.Text.Encoding]::UTF8;Get-CimInstance Win32_Process | Select-Object CommandLine,ProcessId,ParentProcessId,CreationClassName | ConvertTo-Json | Out-File -FilePath '%s' -Encoding utf8`,
		jsonFile,
	)

	_, stderr, err := utils.ExecPromise(command, nil)
	if err != nil {
		return "", fmt.Errorf("Warning: failed to execute PowerShell command: %v, stderr: %s\n", err, stderr)
	}

	// Read and parse JSON content
	content, err := utils.ReadFile(jsonFile)
	if err != nil {
		return "", fmt.Errorf("Warning: failed to read process JSON file '%s': %v\n", jsonFile, err)
	}

	content = strings.TrimSpace(content)

	return content, nil
}

// Rm removes a file or directory recursively.
func (t *ToolManager) Rm(dir string) (bool, error) {
	if err := os.RemoveAll(dir); err != nil {
		var command string
		if runtime.GOOS == "windows" {
			command = fmt.Sprintf(`rmdir /s /q "%s"`, dir)
		} else {
			command = fmt.Sprintf(`rm -rf "%s"`, dir)
		}

		_, stderr, err := utils.ExecPromise(command, nil)
		if err != nil {
			// JS ignored errors. Go will log but return true (matching JS's unconditional resolve).
			fmt.Printf("Warning: failed to remove '%s': %v, stderr: %s\n", dir, err, stderr)
			return true, nil
		}
	}
	return true, nil
}

// Chmod changes the permissions of a file or directory.
func (t *ToolManager) Chmod(dir, flag string) (bool, error) {
	if utils.ExistsSync(dir) {
		if runtime.GOOS == "windows" {
			// Windows uses different permission system, implement basic support
			// For simplicity, we'll just return success on Windows
			fmt.Printf("Info: chmod not fully supported on Windows, skipping '%s'\n", dir)
			return true, nil
		} else {
			_, stderr, err := utils.ExecPromise(fmt.Sprintf(`chmod %s "%s"`, flag, dir), nil)
			if err != nil {
				// JS ignored errors. Go will log but return true.
				fmt.Printf("Warning: failed to chmod '%s' with '%s': %v, stderr: %s\n", dir, flag, err, stderr)
			}
		}
	}
	return true, nil
}

// Kill sends a signal to specified processes.
func (t *ToolManager) Kill(sig string, pids []string) (bool, error) {
	if len(pids) == 0 {
		return true, nil // Nothing to kill
	}

	var command string
	if runtime.GOOS == "windows" {
		// Windows uses taskkill instead of kill
		command = fmt.Sprintf(`taskkill /f /pid %s`, strings.Join(pids, " /pid "))
	} else {
		command = fmt.Sprintf(`kill %s %s`, sig, strings.Join(pids, " "))
	}

	_, stderr, err := utils.ExecPromise(command, nil)
	if err != nil {
		// JS ignored errors. Go will log but return true.
		fmt.Printf("Warning: failed to kill processes: %v, stderr: %s\n", err, stderr)
	}
	return true, nil
}

// Lns creates a symbolic link.
func (t *ToolManager) Lns(oldname, newname string) (bool, error) {
	// JS checks if oldname exists before linking.
	if utils.ExistsSync(oldname) {
		var command string
		if runtime.GOOS == "windows" {
			// Windows mklink command (requires admin privileges in some cases)
			command = fmt.Sprintf(`mklink "%s" "%s"`, newname, oldname)
		} else {
			command = fmt.Sprintf(`ln -s "%s" "%s"`, oldname, newname)
		}

		_, stderr, err := utils.ExecPromise(command, nil)
		if err != nil {
			// JS ignored errors. Go will log but return true.
			fmt.Printf("Warning: failed to create symlink from '%s' to '%s': %v, stderr: %s\n", oldname, newname, err, stderr)
		}
	}
	return true, nil
}

// KillPorts finds and kills processes listening on specified ports.
func (t *ToolManager) KillPorts(ports []string) (bool, error) {
	pids := make(map[string]struct{}) // Using map as a set

	for _, port := range ports {
		var command string
		if runtime.GOOS == "windows" {
			// Windows: use netstat to find processes using ports
			command = fmt.Sprintf(`netstat -ano | findstr ":%s" | findstr "LISTENING"`, port)
		} else {
			command = fmt.Sprintf(`lsof -nP -i:%s | grep '(LISTEN)' | awk '{print $1,$2}'`, port)
		}

		stdout, _, err := utils.ExecPromise(command, nil)
		if err != nil {
			fmt.Printf("Warning: port detection command failed for port %s: %v\n", port, err)
			continue // Continue to next port even if one fails
		}

		lines := strings.Split(strings.TrimSpace(stdout), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}

			if runtime.GOOS == "windows" {
				// Parse Windows netstat output
				// Format: Proto Local Address Foreign Address State PID
				parts := strings.Fields(line)
				if len(parts) >= 5 {
					pid := parts[len(parts)-1] // PID is the last field
					pids[pid] = struct{}{}
				}
			} else {
				// Parse Unix lsof output
				parts := strings.Fields(line)
				if len(parts) >= 2 {
					pid := parts[1] // PID is the second field
					pids[pid] = struct{}{}
				}
			}
		}
	}

	if len(pids) > 0 {
		pidList := make([]string, 0, len(pids))
		for pid := range pids {
			pidList = append(pidList, pid)
		}

		var killCmd string
		if runtime.GOOS == "windows" {
			killCmd = fmt.Sprintf(`taskkill /f /pid %s`, strings.Join(pidList, " /pid "))
		} else {
			killCmd = fmt.Sprintf(`kill -9 %s`, strings.Join(pidList, " "))
		}

		_, stderr, err := utils.ExecPromise(killCmd, nil)
		if err != nil {
			fmt.Printf("Warning: failed to kill processes for ports: %v, stderr: %s\n", err, stderr)
		}
	}
	return true, nil // JS always resolves true
}

// PortProcessInfo represents process information related to a port.
type PortProcessInfo struct {
	USER    string
	PID     string
	COMMAND string
}

// GetPortPids returns a list of processes using a specific port.
func (t *ToolManager) GetPortPids(port string) ([]PortProcessInfo, error) {
	var command string
	command = fmt.Sprintf(`lsof -nP -i:%s | awk '{print $1,$2,$3}'`, port)

	stdout, _, err := utils.ExecPromise(command, nil)
	if err != nil {
		return nil, fmt.Errorf("port detection command failed for port %s: %w", port, err)
	}

	res := strings.TrimSpace(stdout)
	lines := strings.Split(res, "\n")

	if len(lines) == 0 || (len(lines) == 1 && strings.TrimSpace(lines[0]) == "") {
		return []PortProcessInfo{}, nil // No processes found
	}

	processes := make([]PortProcessInfo, 0, len(lines))

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Parse Unix lsof output
		parts := strings.Fields(line)
		if len(parts) < 3 {
			continue // Skip malformed lines
		}

		// lsof -nP -i:PORT | awk '{print $1,$2,$3}' gives: COMMAND PID USER
		command := parts[0]
		pid := parts[1]
		user := parts[2]

		processes = append(processes, PortProcessInfo{
			USER:    user,
			PID:     pid,
			COMMAND: command,
		})
	}
	return processes, nil
}

// GetPortPids returns a list of processes using a specific port.
func (t *ToolManager) GetPortPidsWin(port string) ([]string, error) {
	var command string
	command = fmt.Sprintf(`netstat -ano | findstr ":%s"`, port)

	stdout, _, err := utils.ExecPromise(command, nil)
	if err != nil {
		return nil, fmt.Errorf("port detection command failed for port %s: %w", port, err)
	}

	res := strings.TrimSpace(stdout)
	lines := strings.Split(res, "\n")

	if len(lines) == 0 || (len(lines) == 1 && strings.TrimSpace(lines[0]) == "") {
		return []string{}, nil // No processes found
	}

	processes := make([]string, 0, len(lines))

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		// Parse Windows netstat output
		// Format: Proto Local Address Foreign Address State PID
		parts := strings.Fields(line)
		if len(parts) >= 5 {
			pid := parts[len(parts)-1] // PID is the last field
			// For Windows, we don't easily get USER and COMMAND from netstat
			processes = append(processes, pid)
		}
	}
	return processes, nil
}

// NewToolManager creates and returns a new instance of ToolManager.
func NewToolManager() *ToolManager {
	return &ToolManager{
		BaseManager: BaseManager{}, // Initialize the BaseManager instance
	}
}
