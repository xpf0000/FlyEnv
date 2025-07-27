package module

import (
	"fmt"
	"helper-go/utils" // Import your utils package
	"os"              // For os.TempDir
	"path/filepath"   // For filepath.Join, filepath.Dir
	"strings"         // For string manipulation
)

// ToolManager embeds BaseManager, providing various system utility functionalities.
type ToolManager struct {
	BaseManager // Anonymous field for composition and method "inheritance"
}

func (t *ToolManager) Exec(command string, options ...map[string]interface{}) error {
	var opts map[string]interface{}

	// Check if options were provided
	if len(options) > 0 {
		opts = options[0] // Use the first (and only expected) options map
	} else {
		opts = make(map[string]interface{}) // If no options provided, use an empty map
	}

	_, stderr, err := utils.ExecPromise(command, opts)
	if err != nil {
		return fmt.Errorf("%s: %s", err.Error(), stderr)
	}
	return nil
}

// WriteFileByRoot attempts to write content to a file. If direct write fails,
// it tries to write to a temp file and then copy with root privileges (via execPromise).
func (t *ToolManager) WriteFileByRoot(file string, content string) (bool, error) {
	// Try writing directly first
	err := utils.WriteFileString(file, content)
	if err == nil {
		return true, nil // Success
	}

	// If direct write failed, assume permissions issue and try via temp file + cp
	cacheFile := filepath.Join(os.TempDir(), fmt.Sprintf("%s.txt", utils.UUID(32))) // 32 chars for UUID
	defer func() {
		// Clean up the cache file, ignoring errors
		_, _, _ = utils.ExecPromise(fmt.Sprintf(`rm -rf "%s"`, cacheFile), nil)
	}()

	// Write content to temp file
	err = utils.WriteFileString(cacheFile, content)
	if err != nil {
		return false, fmt.Errorf("failed to write to temporary file '%s': %w", cacheFile, err)
	}

	// Copy from temp file to target with potential root privileges
	_, stderr, err := utils.ExecPromise(fmt.Sprintf(`cp -f "%s" "%s"`, cacheFile, file), nil)
	if err != nil {
		// This is the final error if cp also fails
		return false, fmt.Errorf("failed to copy from temp '%s' to target '%s' with root: %w, stderr: %s", cacheFile, file, err, stderr)
	}

	return true, nil // Success after retry
}

// ReadFileByRoot attempts to read content from a file. If direct read fails,
// it tries to copy to a temp file and then read from there with root privileges.
func (t *ToolManager) ReadFileByRoot(file string) (string, error) {
	content, err := utils.ReadFile(file)
	if err == nil {
		return content, nil // Success
	}

	// If direct read failed, assume permissions issue and try via temp file + cp
	// For global.Server.Cache, we use os.TempDir() as a standard temporary directory.
	cacheFile := filepath.Join(os.TempDir(), fmt.Sprintf("%s.txt", utils.UUID(32))) // 32 chars for UUID
	defer func() {
		// Clean up the cache file, ignoring errors
		_, _, _ = utils.ExecPromise(fmt.Sprintf(`rm -rf "%s"`, cacheFile), nil)
	}()

	// Copy from target file to temp file with potential root privileges
	_, stderr, err := utils.ExecPromise(fmt.Sprintf(`cp -f "%s" "%s"`, file, cacheFile), nil)
	if err != nil {
		return "", fmt.Errorf("failed to copy from target '%s' to temp '%s' with root: %w, stderr: %s", file, cacheFile, err, stderr)
	}

	// Read content from temp file
	content, err = utils.ReadFile(cacheFile)
	if err != nil {
		return "", fmt.Errorf("failed to read from temporary file '%s': %w", cacheFile, err)
	}

	return content, nil // Success after retry
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

// Rm removes a file or directory recursively.
func (t *ToolManager) Rm(dir string) (bool, error) {
	_, stderr, err := utils.ExecPromise(fmt.Sprintf(`rm -rf "%s"`, dir), nil)
	if err != nil {
		// JS ignored errors. Go will log but return true (matching JS's unconditional resolve).
		fmt.Printf("Warning: failed to remove '%s': %v, stderr: %s\n", dir, err, stderr)
		return true, nil
	}
	return true, nil
}

// Chmod changes the permissions of a file or directory.
func (t *ToolManager) Chmod(dir, flag string) (bool, error) {
	if utils.ExistsSync(dir) {
		_, stderr, err := utils.ExecPromise(fmt.Sprintf(`chmod %s "%s"`, flag, dir), nil)
		if err != nil {
			// JS ignored errors. Go will log but return true.
			fmt.Printf("Warning: failed to chmod '%s' with '%s': %v, stderr: %s\n", dir, flag, err, stderr)
		}
	}
	return true, nil
}

// Kill sends a signal to specified processes.
func (t *ToolManager) Kill(sig string, pids []string) (bool, error) {
	if len(pids) == 0 {
		return true, nil // Nothing to kill
	}
	command := fmt.Sprintf(`kill %s %s`, sig, strings.Join(pids, " "))
	_, stderr, err := utils.ExecPromise(command, nil)
	if err != nil {
		// JS ignored errors. Go will log but return true.
		fmt.Printf("Warning: failed to kill processes with signal '%s': %v, stderr: %s\n", sig, err, stderr)
	}
	return true, nil
}

// Lns creates a symbolic link.
func (t *ToolManager) Lns(oldname, newname string) (bool, error) {
	// JS checks if oldname exists before linking.
	// In Go, `os.Symlink` or `ln -s` handles this by failing if source doesn't exist,
	// so the `ExistsSync` check before `ln` might be redundant or for pre-flight.
	if utils.ExistsSync(oldname) {
		_, stderr, err := utils.ExecPromise(fmt.Sprintf(`ln -s "%s" "%s"`, oldname, newname), nil)
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
		lsofCmd := fmt.Sprintf(`lsof -nP -i:%s | grep '(LISTEN)' | awk '{print $1,$2}'`, port) // Simplified awk to get COMMAND and PID
		stdout, _, err := utils.ExecPromise(lsofCmd, nil)
		if err != nil {
			fmt.Printf("Warning: lsof command failed for port %s: %v\n", port, err)
			continue // Continue to next port even if one fails
		}

		lines := strings.Split(strings.TrimSpace(stdout), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				// Assuming `awk '{print $1,$2}'` gives COMMAND then PID
				pid := parts[1] // PID is the second field
				pids[pid] = struct{}{}
			}
		}
	}

	if len(pids) > 0 {
		pidList := make([]string, 0, len(pids))
		for pid := range pids {
			pidList = append(pidList, pid)
		}
		killCmd := fmt.Sprintf(`kill -9 %s`, strings.Join(pidList, " "))
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
	lsofCmd := fmt.Sprintf(`lsof -nP -i:%s | awk '{print $1,$2,$3}'`, port)
	stdout, _, err := utils.ExecPromise(lsofCmd, nil)
	if err != nil {
		return nil, fmt.Errorf("lsof command failed for port %s: %w", port, err)
	}

	res := strings.TrimSpace(stdout)
	lines := strings.Split(res, "\n")

	if len(lines) == 0 || (len(lines) == 1 && strings.TrimSpace(lines[0]) == "") {
		return []PortProcessInfo{}, nil // No processes found
	}

	// Skip header line (i > 0)
	processes := make([]PortProcessInfo, 0, len(lines)-1)
	for i, line := range lines {
		if i == 0 { // Skip header line
			continue
		}
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) < 3 {
			// Handle cases where the line might be malformed or not contain enough parts
			// fmt.Printf("Warning: Malformed lsof output line for port %s: %s\n", port, line)
			continue
		}

		// The JS logic extracts PID, USER, COMMAND.
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

// NewToolManager creates and returns a new instance of ToolManager.
func NewToolManager() *ToolManager {
	return &ToolManager{
		BaseManager: BaseManager{}, // Initialize the BaseManager instance
	}
}
