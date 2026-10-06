//go:build linux

package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
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

// These are the business settings shipped in FlyEnv's FTP template. File paths,
// config includes and external authentication/hooks are deliberately not options.

// Never trust the UID/GID stored in a user-editable PureDB/password file. Preserve
// login hashes, directories and account limits; bind identities to install policy.

func linuxFTPTool(path string, args ...string) (string, error) {
	if filepath.Base(path) == "pure-pw" {
		resolved, err := linuxFTPBinary(path, "pure-pw")
		if err != nil {
			return "", err
		}
		path = resolved
	} else {
		f, err := openProtectedFile(path, 128*1024*1024)
		if err != nil {
			return "", err
		}
		f.Close()
	}
	return runFixedTool(path, 30*time.Second, args...)
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
	users, err := ftpUserFile(filepath.Join(p.DataRoot, "server/ftp/pureftpd.passwd"), p, true)
	if err != nil {
		return err
	}
	users, err = ftpUsers(users, p)
	if err != nil {
		return err
	}
	if err = writeProtectedFile(filepath.Join(dir, "users.passwd"), []byte(users), 0600, 0); err != nil {
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
	config, err := ftpUserFile(filepath.Join(ftpDir, "pure-ftpd.conf"), p, false)
	if err != nil {
		return 0, err
	}
	dir := filepath.Join(filepath.Dir(linuxSocketPath), fmt.Sprintf("ftp-%d", p.UID))
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
