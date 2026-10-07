//go:build linux

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"

	"golang.org/x/sys/unix"
)

var linuxServiceSlots = make(chan struct{}, 64)

type linuxLaunch struct {
	Service string            `json:"service"`
	Bin     string            `json:"bin"`
	Args    []string          `json:"args"`
	Env     map[string]string `json:"env"`
	Cwd     string            `json:"cwd"`
	OutFile string            `json:"outFile"`
	ErrFile string            `json:"errFile"`
}

func launchLinuxService(req linuxLaunch, p linuxPolicy) (int, error) {
	self, err := os.Executable()
	if err != nil {
		return 0, err
	}
	return launchLinuxServiceWithBinary(req, p, self)
}

func launchLinuxServiceWithBinary(req linuxLaunch, p linuxPolicy, self string) (int, error) {
	if err := validateLinuxServiceRequest(req, p); err != nil {
		return 0, err
	}
	for _, path := range []string{req.Bin, req.Cwd, req.OutFile, req.ErrFile} {
		if !filepath.IsAbs(path) || filepath.Clean(path) != path || strings.ContainsAny(path, "\x00\r\n") {
			return 0, fmt.Errorf("invalid service path")
		}
	}
	// Logs are user files; they are opened ONLY by the child after credentials drop.
	for _, path := range []string{req.OutFile, req.ErrFile} {
		if _, err := unixDataPath(path, p.DataRoot); err != nil {
			return 0, fmt.Errorf("service logs: %w", err)
		}
	}
	trusted, err := openProtectedFile(self, 128*1024*1024)
	if err != nil {
		return 0, err
	}
	trusted.Close()
	data, err := json.Marshal(req)
	if err != nil {
		return 0, err
	}
	credential, err := unixUserCredential(p)
	if err != nil {
		return 0, err
	}
	cmd := exec.Command(self, "--linux-service-child")
	cmd.Stdin = bytes.NewReader(data)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true, Credential: credential, AmbientCaps: []uintptr{unix.CAP_NET_BIND_SERVICE}}
	select {
	case linuxServiceSlots <- struct{}{}:
	default:
		return 0, fmt.Errorf("too many active helper-launched services")
	}
	if err = cmd.Start(); err != nil {
		<-linuxServiceSlots
		return 0, err
	}
	// Wait only for exec/early startup failure. Keep reaping detached children.
	done := make(chan error, 1)
	go func() { defer func() { <-linuxServiceSlots }(); done <- cmd.Wait() }()
	select {
	case err = <-done:
		return 0, fmt.Errorf("service exited during startup: %v", err)
	case <-time.After(2 * time.Second):
		return cmd.Process.Pid, nil
	}
}

// Fixed foreground invocations; the API cannot select a shell or arbitrary CLI mode.
// User-writable binaries are still untrusted code, so credentials/caps remain the boundary.
func validateLinuxServiceRequest(req linuxLaunch, p linuxPolicy) error {
	names := map[string][]string{"nginx": {"nginx"}, "apache": {"httpd", "apache2"}, "caddy": {"caddy"}, "frankenphp": {"frankenphp"}, "tomcat": {"catalina.sh"}, "numa": {"numa"}}
	approved := false
	for _, name := range names[req.Service] {
		if filepath.Base(req.Bin) == name {
			approved = true
		}
	}
	if !approved {
		return fmt.Errorf("unapproved service executable name")
	}
	args := req.Args
	pathIndexes := []int{}
	paths := []string{}
	switch req.Service {
	case "nginx":
		if len(args) != 8 || args[0] != "-p" || args[2] != "-e" || args[4] != "-c" || args[6] != "-g" {
			return fmt.Errorf("invalid nginx startup options")
		}
		expected := fmt.Sprintf("pid %s;error_log %s;daemon off;", filepath.Join(args[1], "logs/nginx.pid"), args[3])
		if args[7] != expected {
			return fmt.Errorf("invalid nginx foreground options")
		}
		pathIndexes = []int{1, 3, 5}
	case "apache":
		if len(args) != 8 || args[0] != "-f" || args[2] != "-c" || args[4] != "-c" || args[6] != "-D" || args[7] != "FOREGROUND" {
			return fmt.Errorf("invalid apache startup options")
		}
		for index, option := range map[int][3]string{
			3: {"PidFile \"", "\"", "server/apache/httpd.pid"},
			5: {"CustomLog \"", "\" common", "server/apache/common/logs/access_log"},
		} {
			if !strings.HasPrefix(args[index], option[0]) || !strings.HasSuffix(args[index], option[1]) {
				return fmt.Errorf("invalid apache managed log/pid options")
			}
			path := strings.TrimSuffix(strings.TrimPrefix(args[index], option[0]), option[1])
			resolved, err := unixDataPath(path, p.DataRoot)
			root, expectedErr := canonicalUnixPath(p.DataRoot)
			expected := filepath.Join(root, option[2])
			if err != nil || expectedErr != nil || resolved != expected {
				return fmt.Errorf("invalid apache managed log/pid options")
			}
		}
		pathIndexes = []int{1}
	case "caddy":
		if len(args) != 4 || args[0] != "run" || args[1] != "--config" || args[3] != "--watch" {
			return fmt.Errorf("invalid caddy startup options")
		}
		pathIndexes = []int{2}
	case "frankenphp":
		if len(args) != 5 || args[0] != "run" || args[1] != "--config" || args[3] != "--pidfile" {
			return fmt.Errorf("invalid frankenphp startup options")
		}
		pathIndexes = []int{2, 4}
	case "tomcat":
		if len(args) != 1 || args[0] != "run" {
			return fmt.Errorf("invalid tomcat foreground options")
		}
		paths = []string{req.Env["CATALINA_BASE"], req.Env["CATALINA_PID"]}
	case "numa":
		if len(args) != 1 {
			return fmt.Errorf("invalid numa startup options")
		}
		pathIndexes = []int{0}
	}
	for _, index := range pathIndexes {
		paths = append(paths, args[index])
	}
	for _, path := range paths {
		if filepath.Clean(path) != path || strings.ContainsAny(path, "\x00\r\n") {
			return fmt.Errorf("service configuration must be inside the approved data root")
		}
		if _, err := unixDataPath(path, p.DataRoot); err != nil {
			return err
		}
	}
	return nil
}

func linuxServiceChild() error {
	runtime.LockOSThread()
	if os.Geteuid() == 0 {
		return fmt.Errorf("service child must have user credentials")
	}
	if err := unix.Prctl(unix.PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0); err != nil {
		return err
	}
	var req linuxLaunch
	dec := json.NewDecoder(io.LimitReader(os.Stdin, hostsLimit))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		return err
	}
	if err := os.Chdir(req.Cwd); err != nil {
		return err
	}
	for fd, path := range map[int]string{1: req.OutFile, 2: req.ErrFile} {
		f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			return err
		}
		if err = unix.Dup2(int(f.Fd()), fd); err != nil {
			f.Close()
			return err
		}
		f.Close()
	}
	env := []string{}
	for k, v := range req.Env {
		if strings.ContainsAny(k, "=\x00") || strings.ContainsRune(v, 0) {
			return fmt.Errorf("invalid environment")
		}
		env = append(env, k+"="+v)
	}
	return syscall.Exec(req.Bin, append([]string{req.Bin}, req.Args...), env)
}
