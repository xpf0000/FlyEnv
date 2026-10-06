//go:build darwin

package main

import (
	"debug/macho"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"golang.org/x/sys/unix"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

var darwinFTPMutex sync.Mutex

// Compatibility exception approved by the user: user-installed Mach-O FTP
// programs/dependencies may change. This is not executable integrity validation.
func darwinFTPBinary(path, name string) (string, error) {
	if !filepath.IsAbs(path) || filepath.Base(path) != name {
		return "", fmt.Errorf("expected %s executable", name)
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", err
	}
	if filepath.Base(resolved) != name {
		return "", fmt.Errorf("unexpected FTP executable target")
	}
	f, err := openNoSymlinks(resolved, unix.O_RDONLY|unix.O_NONBLOCK, 0)
	if err != nil {
		return "", err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return "", err
	}
	if !st.Mode().IsRegular() || st.Mode().Perm()&0111 == 0 || st.Size() > 128*1024*1024 {
		return "", fmt.Errorf("FTP executable must be bounded regular executable")
	}
	thin, err := macho.NewFile(f)
	if err == nil {
		defer thin.Close()
		if thin.Type != macho.TypeExec {
			return "", fmt.Errorf("FTP requires executable Mach-O")
		}
		return resolved, nil
	}
	fat, err := macho.NewFatFile(f)
	if err != nil {
		return "", fmt.Errorf("FTP requires executable Mach-O, not script")
	}
	defer fat.Close()
	for _, arch := range fat.Arches {
		if arch.Type != macho.TypeExec {
			return "", fmt.Errorf("FTP requires executable Mach-O")
		}
	}
	return resolved, nil
}
func darwinFTPLabel(p darwinPolicy) string { return fmt.Sprintf("com.flyenv.pure-ftpd.%d", p.UID) }
func darwinFTPDirectory(p darwinPolicy) string {
	return filepath.Join(filepath.Dir(darwinSocketPath), fmt.Sprintf("ftp-%d", p.UID))
}

type darwinFTPState struct {
	Bin     string         `json:"bin"`
	PID     int            `json:"pid"`
	Birth   string         `json:"birth"`
	Members map[int]string `json:"members,omitempty"`
}
type darwinFTPProcess struct {
	PID, PPID, PGID int
	Birth           string
}

func darwinFTPProcesses() (map[int]darwinFTPProcess, error) {
	if f, err := openProtectedFile("/bin/ps", 128*1024*1024); err != nil {
		return nil, err
	} else {
		f.Close()
	}
	output, err := runFixedTool("/bin/ps", 5*time.Second, "-axo", "pid=,ppid=,pgid=")
	if err != nil {
		return nil, err
	}
	result := map[int]darwinFTPProcess{}
	for _, line := range strings.Split(output, "\n") {
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}
		if len(fields) != 3 {
			return nil, fmt.Errorf("unverifiable process table")
		}
		pid, e1 := strconv.Atoi(fields[0])
		ppid, e2 := strconv.Atoi(fields[1])
		pgid, e3 := strconv.Atoi(fields[2])
		if e1 != nil || e2 != nil || e3 != nil {
			return nil, fmt.Errorf("invalid process identity")
		}
		birth, birthErr := nativeDarwinProcessBirth(pid)
		if birthErr != nil {
			fmt.Printf("FTP process candidate pid=%d identity unavailable: %v\n", pid, birthErr)
		}
		result[pid] = darwinFTPProcess{pid, ppid, pgid, birth}
	}
	return result, nil
}
func darwinFTPTool(args ...string) (string, error) {
	f, err := openProtectedFile("/bin/launchctl", 128*1024*1024)
	if err != nil {
		return "", err
	}
	f.Close()
	return runFixedTool("/bin/launchctl", 15*time.Second, args...)
}
func darwinFTPJobPID(p darwinPolicy) (int, error) {
	output, err := ftpJobCommand("print", "system/"+darwinFTPLabel(p))
	if err != nil {
		return 0, err
	}
	for _, line := range strings.Split(output, "\n") {
		fields := strings.Fields(line)
		if len(fields) == 3 && fields[0] == "pid" && fields[1] == "=" {
			pid, err := strconv.Atoi(fields[2])
			if err != nil || pid <= 0 {
				return 0, fmt.Errorf("invalid FTP job PID")
			}
			return pid, nil
		}
	}
	return 0, fmt.Errorf("FTP job is not running")
}
func readDarwinFTPState(p darwinPolicy) (darwinFTPState, error) {
	var state darwinFTPState
	data, err := protectedFile(filepath.Join(darwinFTPDirectory(p), "state.json"), 65536)
	if err != nil {
		return state, err
	}
	if err = decodeUnix(json.RawMessage(data), &state); err != nil {
		return state, err
	}
	if state.PID < 0 || (state.PID > 0 && state.Birth == "") || state.Bin == "" {
		return state, fmt.Errorf("invalid FTP state")
	}
	return state, nil
}
func darwinFTPPW(bin string) (string, error) {
	var last error
	for _, candidate := range []string{filepath.Join(filepath.Dir(filepath.Dir(bin)), "bin/pure-pw"), filepath.Join(filepath.Dir(bin), "pure-pw"), "/opt/homebrew/bin/pure-pw", "/usr/local/bin/pure-pw", "/opt/local/bin/pure-pw"} {
		pw, err := darwinFTPBinary(candidate, "pure-pw")
		if err == nil {
			return pw, nil
		}
		last = err
	}
	return "", fmt.Errorf("pure-pw executable required: %w", last)
}
func refreshDarwinFTPDatabase(p darwinPolicy, bin string) error {
	dir := darwinFTPDirectory(p)
	pw, err := darwinFTPPW(bin)
	if err != nil {
		return err
	}
	source, err := ftpUserFile(filepath.Join(p.DataRoot, "server/ftp/pureftpd.passwd"), p, true)
	if err != nil {
		return err
	}
	users, err := ftpUsers(source, p)
	if err != nil {
		return err
	}
	if err = writeProtectedFile(filepath.Join(dir, "users.passwd"), []byte(users), 0600, 0); err != nil {
		return err
	}
	// pure-pw only builds data and runs as the installed account; no root execution.
	// Give it its private staging directory, then snapshot output to root runtime.
	return buildDarwinFTPDatabase(p, pw, users, dir)
}
func plistString(value string) string {
	var b strings.Builder
	xml.EscapeText(&b, []byte(value))
	return b.String()
}
func darwinFTPPlist(p darwinPolicy, bin, dir string) string {
	return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>` + darwinFTPLabel(p) + `</string><key>ProgramArguments</key><array><string>` + plistString(bin) + `</string><string>` + plistString(filepath.Join(dir, "pure-ftpd.conf")) + `</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><false/><key>AbandonProcessGroup</key><false/><key>ExitTimeOut</key><integer>10</integer><key>WorkingDirectory</key><string>/</string><key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin</string></dict></dict></plist>`
}
func startDarwinFTP(bin string, p darwinPolicy) (int, error) {
	darwinFTPMutex.Lock()
	defer darwinFTPMutex.Unlock()
	dir := darwinFTPDirectory(p)
	if _, err := readDarwinFTPState(p); err == nil {
		return 0, fmt.Errorf("FTP is already managed; stop before starting")
	} else if !os.IsNotExist(err) {
		return 0, err
	}
	// Refuse foreign/stale system jobs; only a known missing job allows bootstrap.
	if output, err := ftpJobCommand("print", "system/"+darwinFTPLabel(p)); err == nil {
		return 0, fmt.Errorf("FTP job already exists; explicit administrator migration required: %s", output)
	} else if !strings.Contains(err.Error(), "Could not find service") {
		return 0, err
	}
	bin, err := darwinFTPBinary(bin, "pure-ftpd")
	if err != nil {
		return 0, err
	}
	config, err := ftpUserFile(filepath.Join(p.DataRoot, "server/ftp/pure-ftpd.conf"), p, false)
	if err != nil {
		return 0, err
	}
	config, err = ftpConfig(config, dir)
	if err != nil {
		return 0, err
	}
	if err = os.MkdirAll(dir, 0700); err != nil {
		return 0, err
	}
	if err = protectedDirectory(dir); err != nil {
		return 0, err
	}
	if err = writeProtectedFile(filepath.Join(dir, "pure-ftpd.conf"), []byte(config), 0600, 0); err != nil {
		return 0, err
	}
	if err = refreshDarwinFTPDatabase(p, bin); err != nil {
		return 0, err
	}
	plist := filepath.Join(dir, "job.plist")
	if err = writeProtectedFile(plist, []byte(darwinFTPPlist(p, bin, dir)), 0600, 0); err != nil {
		return 0, err
	}
	return beginDarwinFTPJob(p, bin, plist)
}
func persistDarwinFTPState(p darwinPolicy, state darwinFTPState) error {
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	return writeProtectedFile(filepath.Join(darwinFTPDirectory(p), "state.json"), data, 0600, 0)
}

var ftpWriteState = persistDarwinFTPState
var ftpReadState = readDarwinFTPState
var ftpJobCommand = darwinFTPTool
var ftpProcessTable = darwinFTPProcesses
var ftpRemoveState = func(p darwinPolicy) error { return os.Remove(filepath.Join(darwinFTPDirectory(p), "state.json")) }

func beginDarwinFTPJob(p darwinPolicy, bin, plist string) (int, error) {
	state := darwinFTPState{Bin: bin}
	// Intent is durable before launchd acquires the job: failed startup is stoppable.
	if err := ftpWriteState(p, state); err != nil {
		return 0, err
	}
	if _, err := ftpJobCommand("bootstrap", "system", plist); err != nil {
		return 0, fmt.Errorf("FTP bootstrap failed; managed intent retained, stop before restarting: %w", err)
	}
	pid, err := darwinFTPJobPID(p)
	if err != nil {
		return 0, fmt.Errorf("FTP startup not verified; managed intent retained: %w", err)
	}
	table, err := ftpProcessTable()
	if err != nil {
		return 0, err
	}
	proc, ok := table[pid]
	if !ok || proc.PGID != pid || proc.Birth == "" {
		return 0, fmt.Errorf("FTP process group is unverifiable; intent retained")
	}
	state.PID, state.Birth = pid, proc.Birth
	if err = ftpWriteState(p, state); err != nil {
		return 0, fmt.Errorf("FTP running but PID state persistence failed; intent retained: %w", err)
	}
	time.Sleep(2 * time.Second)
	current, err := darwinFTPJobPID(p)
	if err != nil || current != pid {
		return 0, fmt.Errorf("FTP exited during startup; state retained: %v", err)
	}
	table, err = ftpProcessTable()
	if err != nil {
		return 0, err
	}
	currentProc, ok := table[pid]
	if !ok || currentProc.Birth != state.Birth {
		return 0, fmt.Errorf("FTP changed during startup; state retained")
	}
	return pid, nil
}

func refreshDarwinFTPUsers(p darwinPolicy) (bool, error) {
	darwinFTPMutex.Lock()
	defer darwinFTPMutex.Unlock()
	state, err := ftpReadState(p)
	if os.IsNotExist(err) {
		if _, jobErr := darwinFTPJobPID(p); !darwinFTPJobAbsent(jobErr) {
			return false, fmt.Errorf("FTP has no managed state: %v", jobErr)
		}
		return true, nil
	}
	if err != nil {
		return false, err
	}
	if state.PID == 0 {
		return false, fmt.Errorf("FTP startup incomplete; stop before retry")
	}
	pid, err := darwinFTPJobPID(p)
	if err != nil || pid != state.PID {
		return false, fmt.Errorf("managed FTP process changed: %v", err)
	}
	table, err := ftpProcessTable()
	if err != nil {
		return false, err
	}
	proc, ok := table[pid]
	if !ok || proc.Birth != state.Birth {
		return false, fmt.Errorf("FTP PID identity changed")
	}
	return true, refreshDarwinFTPDatabase(p, state.Bin)
}
func darwinFTPJobAbsent(err error) bool {
	return err != nil && strings.Contains(err.Error(), "Could not find service")
}
func collectDarwinFTPMembers(state darwinFTPState, table map[int]darwinFTPProcess) (map[int]string, error) {
	tracked := map[int]string{}
	for pid, birth := range state.Members {
		tracked[pid] = birth
	}
	main, ok := table[state.PID]
	if ok && main.Birth != state.Birth {
		return nil, fmt.Errorf("FTP PID was reused; explicit administrator recovery required")
	}
	if ok && main.PGID != state.PID {
		return nil, fmt.Errorf("FTP process group changed")
	}
	if state.PID > 0 {
		tracked[state.PID] = state.Birth
		for _, proc := range table {
			if proc.PGID == state.PID {
				tracked[proc.PID] = proc.Birth
			}
		}
	}
	for changed := true; changed; {
		changed = false
		for _, proc := range table {
			if _, known := tracked[proc.PID]; known {
				continue
			}
			if birth, parent := tracked[proc.PPID]; parent {
				if live, exists := table[proc.PPID]; exists && live.Birth == birth {
					tracked[proc.PID] = proc.Birth
					changed = true
				}
			}
		}
	}
	return tracked, nil
}
func stopDarwinFTP(p darwinPolicy) (int, error) {
	darwinFTPMutex.Lock()
	defer darwinFTPMutex.Unlock()
	return stopDarwinFTPJob(p)
}
func stopDarwinFTPJob(p darwinPolicy) (int, error) {
	state, err := ftpReadState(p)
	jobPID, jobErr := darwinFTPJobPID(p)
	if os.IsNotExist(err) {
		if !darwinFTPJobAbsent(jobErr) {
			return 0, fmt.Errorf("unregistered FTP job requires administrator migration: %v", jobErr)
		}
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	if jobErr != nil && !darwinFTPJobAbsent(jobErr) && !strings.Contains(jobErr.Error(), "FTP job is not running") {
		return 0, jobErr
	}
	table, err := ftpProcessTable()
	if err != nil {
		return 0, err
	}
	if state.PID == 0 && jobPID > 0 {
		proc, ok := table[jobPID]
		if !ok || proc.PGID != jobPID || proc.Birth == "" {
			return 0, fmt.Errorf("pending FTP process identity unavailable")
		}
		state.PID, state.Birth = jobPID, proc.Birth
	}
	if state.PID > 0 && jobPID > 0 && state.PID != jobPID {
		return 0, fmt.Errorf("FTP job PID changed; administrator recovery required")
	}
	tracked, err := collectDarwinFTPMembers(state, table)
	if err != nil {
		return 0, err
	}
	state.Members = tracked
	// Save observed children before bootout, including separately grouped sessions;
	// failed verification can be retried even after launchd removed the job.
	if err = ftpWriteState(p, state); err != nil {
		return 0, err
	}
	if !darwinFTPJobAbsent(jobErr) {
		if _, err = ftpJobCommand("bootout", "system/"+darwinFTPLabel(p)); err != nil {
			return 0, err
		}
	}
	deadline := time.Now().Add(10 * time.Second)
	for {
		table, err = ftpProcessTable()
		if err != nil {
			return 0, err
		}
		alive := false
		for pid, birth := range tracked {
			if proc, exists := table[pid]; exists {
				if proc.Birth == "" {
					return 0, fmt.Errorf("FTP session identity unavailable for PID %d; state retained", pid)
				}
				if birth == "" || proc.Birth == birth {
					alive = true
				}
			}
		}
		if !alive {
			break
		}
		if time.Now().After(deadline) {
			return 0, fmt.Errorf("FTP sessions did not stop; state retained")
		}
		time.Sleep(100 * time.Millisecond)
	}
	if _, err = ftpJobCommand("print", "system/"+darwinFTPLabel(p)); !darwinFTPJobAbsent(err) {
		return 0, fmt.Errorf("FTP job removal unverified: %v", err)
	}
	if err = ftpRemoveState(p); err != nil {
		return 0, err
	}
	return state.PID, nil
}
