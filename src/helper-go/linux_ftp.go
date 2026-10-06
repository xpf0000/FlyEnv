//go:build linux

package main

import (
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"golang.org/x/sys/unix"
)

// FTP needs root for chroot and login credential changes. FlyEnv's normal
// user-owned installations remain supported; binary/dependency integrity is
// outside this API's scope. The filename/ELF checks validate the input format.
// systemd owns the full process tree; callers cannot select a unit or signal PID.
var linuxFTPMutex sync.Mutex

func linuxFTPBinary(path, name string) (string, error) {
	if filepath.Base(path) != name || !filepath.IsAbs(path) {
		return "", fmt.Errorf("expected %s executable", name)
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", err
	}
	if filepath.Base(resolved) != name {
		return "", fmt.Errorf("unexpected FTP executable target")
	}
	fd, err := unix.Open(resolved, unix.O_RDONLY|unix.O_NONBLOCK|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0)
	if err != nil {
		return "", err
	}
	f := os.NewFile(uintptr(fd), resolved)
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return "", err
	}
	if !st.Mode().IsRegular() || st.Mode().Perm()&0111 == 0 || st.Size() > 128*1024*1024 {
		return "", fmt.Errorf("FTP executable must be a bounded regular executable file")
	}
	magic := make([]byte, 4)
	if _, err = io.ReadFull(f, magic); err != nil || string(magic) != "\x7fELF" {
		return "", fmt.Errorf("FTP root launcher requires an ELF binary, not a script")
	}
	return resolved, nil
}

// Read only the fixed user's regular file, pinned through no-follow descriptors.
// A root-owned file or symlink cannot turn this into a privileged file reader.
func linuxFTPUserFile(path string, p linuxPolicy, optional bool) (string, error) {
	f, err := openNoSymlinks(path, unix.O_RDONLY|unix.O_NONBLOCK, 0)
	if optional && os.IsNotExist(err) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return "", err
	}
	meta := st.Sys().(*syscall.Stat_t)
	if !st.Mode().IsRegular() || int(meta.Uid) != p.UID || meta.Nlink != 1 || st.Size() > 1024*1024 {
		return "", fmt.Errorf("FTP input must be a bounded regular file owned by the authorized user")
	}
	data, err := io.ReadAll(io.LimitReader(f, 1024*1024+1))
	if len(data) > 1024*1024 {
		return "", fmt.Errorf("FTP input is too large")
	}
	return string(data), err
}

// These are the business settings shipped in FlyEnv's FTP template. File paths,
// config includes and external authentication/hooks are deliberately not options.
func linuxFTPConfig(source, dir string) (string, error) {
	booleans := strings.Fields("ChrootEveryone BrokenClientsCompatibility VerboseLog DisplayDotFiles AnonymousOnly NoAnonymous DontResolve AnonymousCanCreateDirs AntiWarez AllowUserFXP AllowAnonymousFXP ProhibitDotFilesWrite ProhibitDotFilesRead AutoRename AnonymousCantUpload CustomerProof")
	counts := strings.Fields("MaxClientsNumber MaxClientsPerIP MaxIdleTime MinUID MaxDiskUsage")
	allowedBool, allowedCount := map[string]bool{}, map[string]bool{}
	for _, key := range booleans {
		allowedBool[key] = true
	}
	for _, key := range counts {
		allowedCount[key] = true
	}
	seen := map[string]bool{}
	lines := []string{}
	for _, line := range strings.Split(source, "\n") {
		line = strings.TrimSpace(strings.SplitN(line, "#", 2)[0])
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 || strings.ContainsAny(line, "\x00\r") {
			return "", fmt.Errorf("invalid FTP configuration line")
		}
		key, value := fields[0], strings.Join(fields[1:], " ")
		if seen[key] {
			return "", fmt.Errorf("duplicate FTP option: %s", key)
		}
		seen[key] = true
		valid := false
		switch {
		case allowedBool[key], key == "Daemonize":
			valid = value == "yes" || value == "no"
		case allowedCount[key]:
			n, err := strconv.Atoi(value)
			valid = err == nil && n > 0 && n <= 65535
		case key == "UnixAuthentication", key == "CreateHomeDir":
			valid = value == "no"
		case key == "PureDB", key == "PIDFile":
			// User-supplied paths are never read or written by root; fixed targets below.
			valid = true
		case key == "Bind":
			parts := strings.Split(value, ",")
			if len(parts) == 2 {
				port, err := strconv.Atoi(parts[1])
				valid = net.ParseIP(parts[0]) != nil && err == nil && port > 0 && port <= 65535
			}
		case key == "PassivePortRange", key == "LimitRecursion":
			if len(fields) == 3 {
				a, e1 := strconv.Atoi(fields[1])
				b, e2 := strconv.Atoi(fields[2])
				valid = e1 == nil && e2 == nil && a > 0 && b > 0 && a <= 1000000 && b <= 1000000
				if key == "PassivePortRange" {
					valid = valid && a <= b && b <= 65535
				}
			}
		case key == "Maxload":
			n, err := strconv.ParseFloat(value, 64)
			valid = err == nil && n > 0 && n <= 1000
		case key == "Umask":
			parts := strings.Split(value, ":")
			if len(parts) == 2 {
				a, e1 := strconv.ParseUint(parts[0], 8, 16)
				b, e2 := strconv.ParseUint(parts[1], 8, 16)
				valid = e1 == nil && e2 == nil && a <= 0777 && b <= 0777
			}
		case key == "SyslogFacility":
			valid = value == "ftp"
		}
		if !valid {
			return "", fmt.Errorf("unsupported or invalid root FTP option: %s", key)
		}
		if key != "Daemonize" && key != "PureDB" && key != "PIDFile" && key != "UnixAuthentication" {
			lines = append(lines, key+" "+value)
		}
	}
	lines = append(lines, "Daemonize no", "UnixAuthentication no", "PureDB "+filepath.Join(dir, "users.pdb"), "PIDFile "+filepath.Join(dir, "pure-ftpd.pid"))
	return strings.Join(lines, "\n") + "\n", nil
}

// Never trust the UID/GID stored in a user-editable PureDB/password file. Preserve
// login hashes, directories and account limits; bind identities to install policy.
func linuxFTPUsers(source string, p linuxPolicy) (string, error) {
	if p.UID <= 0 || p.GID <= 0 || strings.ContainsAny(source, "\x00\r") {
		return "", fmt.Errorf("invalid FTP users")
	}
	seen, lines := map[string]bool{}, []string{}
	for _, line := range strings.Split(source, "\n") {
		if line == "" {
			continue
		}
		fields := strings.Split(line, ":")
		if len(fields) < 6 || len(fields) > 32 || fields[0] == "" || len(fields[0]) > 128 || fields[1] == "" || len(fields[1]) > 1024 || !filepath.IsAbs(fields[5]) || seen[fields[0]] {
			return "", fmt.Errorf("invalid or duplicate FTP account")
		}
		seen[fields[0]] = true
		fields[2], fields[3] = strconv.Itoa(p.UID), strconv.Itoa(p.GID)
		lines = append(lines, strings.Join(fields, ":"))
	}
	if len(lines) == 0 {
		return "", nil
	}
	return strings.Join(lines, "\n") + "\n", nil
}

func linuxFTPTool(path string, args ...string) (string, error) {
	if filepath.Base(path) == "pure-pw" {
		resolved, err := linuxFTPBinary(path, "pure-pw")
		if err != nil {
			return "", err
		}
		path = resolved
	} else {
		f, err := openProtectedLinuxFile(path, 128*1024*1024)
		if err != nil {
			return "", err
		}
		f.Close()
	}
	return runLinuxTool(path, 30*time.Second, args...)
}

func linuxFTPUnit(p linuxPolicy) string        { return fmt.Sprintf("flyenv-pure-ftpd-%d.service", p.UID) }
func linuxFTPDescription(p linuxPolicy) string { return fmt.Sprintf("FlyEnv Pure-FTPd UID=%d", p.UID) }

func linuxFTPPW(bin string) (string, error) {
	var last error
	for _, candidate := range []string{filepath.Join(filepath.Dir(filepath.Dir(bin)), "bin/pure-pw"), "/usr/bin/pure-pw", "/usr/local/bin/pure-pw"} {
		pw, err := linuxFTPBinary(candidate, "pure-pw")
		if err == nil {
			return pw, nil
		}
		last = err
	}
	return "", fmt.Errorf("pure-pw executable is required: %w", last)
}

func refreshLinuxFTPDatabase(p linuxPolicy, dir, pw string) error {
	users, err := linuxFTPUserFile(filepath.Join(p.DataRoot, "server/ftp/pureftpd.passwd"), p, true)
	if err != nil {
		return err
	}
	users, err = linuxFTPUsers(users, p)
	if err != nil {
		return err
	}
	if err = writeLinuxProtected(filepath.Join(dir, "users.passwd"), []byte(users), 0600, 0); err != nil {
		return err
	}
	staged := filepath.Join(dir, "users.pdb.new")
	if _, err = linuxFTPTool(pw, "mkdb", staged, "-f", filepath.Join(dir, "users.passwd")); err != nil {
		return err
	}
	return os.Rename(staged, filepath.Join(dir, "users.pdb"))
}

func refreshLinuxFTPUsers(p linuxPolicy) (bool, error) {
	linuxFTPMutex.Lock()
	defer linuxFTPMutex.Unlock()
	status, err := linuxFTPStatus(p)
	if err != nil {
		return false, err
	}
	if status["MainPID"] == "0" {
		return true, nil
	}
	bin, err := os.Readlink(filepath.Join("/proc", status["MainPID"], "exe"))
	if err != nil {
		return false, err
	}
	pw, err := linuxFTPPW(bin)
	if err != nil {
		return false, err
	}
	dir := filepath.Join(filepath.Dir(linuxSocketPath), fmt.Sprintf("ftp-%d", p.UID))
	if err = protectedDirectory(dir); err != nil {
		return false, err
	}
	return true, refreshLinuxFTPDatabase(p, dir, pw)
}

func linuxFTPStatus(p linuxPolicy) (map[string]string, error) {
	output, err := linuxFTPTool("/usr/bin/systemctl", "show", linuxFTPUnit(p), "--property=LoadState,ActiveState,MainPID,Description")
	if err != nil {
		return nil, err
	}
	values := map[string]string{}
	for _, line := range strings.Split(output, "\n") {
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			values[parts[0]] = parts[1]
		}
	}
	if values["LoadState"] == "" || values["MainPID"] == "" {
		return nil, fmt.Errorf("unknown FTP unit state")
	}
	if values["LoadState"] != "not-found" && values["Description"] != linuxFTPDescription(p) {
		return nil, fmt.Errorf("FTP systemd unit belongs to another service")
	}
	return values, nil
}

func startLinuxFTP(bin string, p linuxPolicy) (int, error) {
	linuxFTPMutex.Lock()
	defer linuxFTPMutex.Unlock()
	bin, err := linuxFTPBinary(bin, "pure-ftpd")
	if err != nil {
		return 0, err
	}
	status, err := linuxFTPStatus(p)
	if err != nil {
		return 0, err
	}
	if status["MainPID"] != "0" || (status["ActiveState"] != "inactive" && status["ActiveState"] != "failed") {
		return 0, fmt.Errorf("FTP service is already active or changing state")
	}
	pw, err := linuxFTPPW(bin)
	if err != nil {
		return 0, err
	}
	ftpDir := filepath.Join(p.DataRoot, "server/ftp")
	config, err := linuxFTPUserFile(filepath.Join(ftpDir, "pure-ftpd.conf"), p, false)
	if err != nil {
		return 0, err
	}
	dir := filepath.Join(filepath.Dir(linuxSocketPath), fmt.Sprintf("ftp-%d", p.UID))
	config, err = linuxFTPConfig(config, dir)
	if err != nil {
		return 0, err
	}
	if err = os.MkdirAll(dir, 0700); err != nil {
		return 0, err
	}
	if err = protectedDirectory(dir); err != nil {
		return 0, err
	}
	if err = writeLinuxProtected(filepath.Join(dir, "pure-ftpd.conf"), []byte(config), 0600, 0); err != nil {
		return 0, err
	}
	if err = refreshLinuxFTPDatabase(p, dir, pw); err != nil {
		return 0, err
	}
	_, err = linuxFTPTool("/usr/bin/systemd-run", "--quiet", "--collect", "--unit="+linuxFTPUnit(p), "--service-type=exec", "--description="+linuxFTPDescription(p), "--property=KillMode=control-group", "--property=KillSignal=SIGINT", "--property=TimeoutStopSec=10s", "--property=TimeoutStartSec=10s", "--property=PartOf=flyenv-helper.service", "--property=NoNewPrivileges=yes", "--", bin, filepath.Join(dir, "pure-ftpd.conf"))
	if err != nil {
		return 0, err
	}
	time.Sleep(2 * time.Second)
	status, err = linuxFTPStatus(p)
	if err != nil {
		return 0, err
	}
	pid, err := strconv.Atoi(status["MainPID"])
	if err != nil || pid <= 0 || status["ActiveState"] != "active" {
		log, _ := linuxFTPTool("/usr/bin/journalctl", "--unit="+linuxFTPUnit(p), "--no-pager", "-n", "20")
		return 0, fmt.Errorf("FTP exited during startup: %s", strings.TrimSpace(log))
	}
	return pid, nil
}

func stopLinuxFTP(p linuxPolicy) (int, error) {
	linuxFTPMutex.Lock()
	defer linuxFTPMutex.Unlock()
	status, err := linuxFTPStatus(p)
	if err != nil {
		return 0, err
	}
	pid, err := strconv.Atoi(status["MainPID"])
	if err != nil {
		return 0, err
	}
	if status["LoadState"] == "not-found" {
		return 0, nil
	}
	if _, err = linuxFTPTool("/usr/bin/systemctl", "stop", linuxFTPUnit(p)); err != nil {
		return 0, err
	}
	status, err = linuxFTPStatus(p)
	if err != nil {
		return 0, err
	}
	if status["MainPID"] != "0" || (status["ActiveState"] != "inactive" && status["ActiveState"] != "failed") {
		return 0, fmt.Errorf("FTP service has not stopped")
	}
	return pid, nil
}
