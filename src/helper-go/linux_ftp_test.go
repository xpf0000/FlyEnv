//go:build linux

package main

import (
	"bytes"
	"fmt"
	"net"
	"net/textproto"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestLinuxFTPInstalledExecutable(t *testing.T) {
	dir := t.TempDir()
	data, err := os.ReadFile("/bin/true")
	if err != nil {
		t.Fatal(err)
	}
	bin := filepath.Join(dir, "pure-ftpd")
	if err = os.WriteFile(bin, data, 0755); err != nil {
		t.Fatal(err)
	}
	if _, err = linuxFTPBinary(bin, "pure-ftpd"); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"pure-ftpd", filepath.Join(dir, "other")} {
		if _, err = linuxFTPBinary(path, "pure-ftpd"); err == nil {
			t.Fatal("accepted invalid FTP executable name/path")
		}
	}
	os.WriteFile(bin, []byte("#!/bin/sh\nid\n"), 0755)
	if _, err = linuxFTPBinary(bin, "pure-ftpd"); err == nil {
		t.Fatal("accepted FTP shell script")
	}
	os.Remove(bin)
	if err = syscall.Mkfifo(bin, 0755); err != nil {
		t.Fatal(err)
	}
	if _, err = linuxFTPBinary(bin, "pure-ftpd"); err == nil {
		t.Fatal("accepted FIFO executable")
	}
}

func TestLinuxFTPRootService(t *testing.T) {
	source := os.Getenv("FLYENV_TEST_FTP_SOURCE")
	if os.Geteuid() != 0 || source == "" {
		t.Skip("requires root, systemd and compiled Pure-Ftpd fixture")
	}
	account, err := user.Lookup("nobody")
	if err != nil {
		t.Skip("ordinary system account fixture unavailable")
	}
	uid, _ := strconv.Atoi(account.Uid)
	gid, _ := strconv.Atoi(account.Gid)
	p := linuxPolicy{Version: Helper_Version, UID: uid, GID: gid}
	status, err := linuxFTPStatus(p)
	if err != nil {
		t.Fatal(err)
	}
	if status["LoadState"] != "not-found" {
		t.Fatal("fixture unit already exists")
	}
	dir, err := os.MkdirTemp("/opt", ".flyenv-ftp-test-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	os.Chmod(dir, 0755)
	for _, entry := range []string{"sbin", "bin", "data", "data/server", "data/server/ftp", "uploads"} {
		path := filepath.Join(dir, entry)
		if err = os.Mkdir(path, 0755); err != nil {
			t.Fatal(err)
		}
		os.Chown(path, p.UID, p.GID)
	}
	for name, sub := range map[string]string{"pure-ftpd": "sbin", "pure-pw": "bin"} {
		data, err := os.ReadFile(filepath.Join(source, name))
		if err != nil {
			t.Fatal(err)
		}
		if err = os.WriteFile(filepath.Join(dir, sub, name), data, 0755); err != nil {
			t.Fatal(err)
		}
		os.Chown(filepath.Join(dir, sub, name), p.UID, p.GID)
	}
	p.DataRoot = filepath.Join(dir, "data")
	ftpDir := filepath.Join(p.DataRoot, "server/ftp")
	passwd := filepath.Join(ftpDir, "pureftpd.passwd")
	pw := filepath.Join(dir, "bin/pure-pw")
	addUser := func(name string) {
		cmd := exec.Command(pw, "useradd", name, "-u", strconv.Itoa(p.UID), "-g", strconv.Itoa(p.GID), "-d", filepath.Join(dir, "uploads"), "-f", passwd)
		cmd.Stdin = strings.NewReader("flyenv-fixture-password\nflyenv-fixture-password\n")
		if output, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("pure-pw: %v %s", err, output)
		}
		os.Chown(passwd, p.UID, p.GID)
	}
	addUser("alice")
	data, err := os.ReadFile(passwd)
	if err != nil {
		t.Fatal(err)
	}
	// A user-editable database claiming root must still log in as the installed UID.
	data = bytes.Replace(data, []byte(fmt.Sprintf(":%d:%d:", p.UID, p.GID)), []byte(":0:0:"), 1)
	if err = os.WriteFile(passwd, data, 0600); err != nil {
		t.Fatal(err)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	listener.Close()
	parent := filepath.Dir(linuxSocketPath)
	_, parentErr := os.Stat(parent)
	if err = os.MkdirAll(parent, 0755); err != nil {
		t.Fatal(err)
	}
	runtimeDir := filepath.Join(parent, fmt.Sprintf("ftp-%d", p.UID))
	if _, err = os.Stat(runtimeDir); !os.IsNotExist(err) {
		t.Fatal("fixture runtime directory already exists")
	}
	t.Cleanup(func() {
		stopLinuxFTP(p)
		os.RemoveAll(runtimeDir)
		if os.IsNotExist(parentErr) {
			os.Remove(parent)
		}
	})
	template, err := os.ReadFile("../../static/tmpl/Linux/pure-ftpd.conf")
	if err != nil {
		t.Fatal(err)
	}
	for _, listenPort := range []int{port, 21} {
		if listenPort == 21 {
			probe, err := net.Listen("tcp", "127.0.0.1:21")
			if err != nil {
				t.Log("port 21 occupied; high-port root flow was tested")
				break
			}
			probe.Close()
		}
		config := strings.ReplaceAll(string(template), "##DIR##", ftpDir)
		config = strings.ReplaceAll(config, "0.0.0.0,21", fmt.Sprintf("127.0.0.1,%d", listenPort))
		config = strings.ReplaceAll(config, "Maxload                     4", "Maxload                     1000")
		if err = os.WriteFile(filepath.Join(ftpDir, "pure-ftpd.conf"), []byte(config), 0644); err != nil {
			t.Fatal(err)
		}
		os.Chown(filepath.Join(ftpDir, "pure-ftpd.conf"), p.UID, p.GID)
		pid, err := startLinuxFTP(unixFTPStart{Bin: filepath.Join(dir, "sbin/pure-ftpd"), Config: config, Users: string(data)}, p)
		if err != nil {
			t.Fatal(err)
		}
		processStatus, err := os.ReadFile(fmt.Sprintf("/proc/%d/status", pid))
		if err != nil || !strings.Contains(string(processStatus), "Uid:\t0\t0\t0\t0") {
			t.Fatal("FTP master is not root", err, string(processStatus))
		}
		if _, err = startLinuxFTP(unixFTPStart{Bin: filepath.Join(dir, "sbin/pure-ftpd"), Config: config, Users: string(data)}, p); err == nil {
			t.Fatal("duplicate start accepted")
		}
		login := func(name string) {
			code := `import ftplib,io,sys
f=ftplib.FTP(); f.connect('127.0.0.1',int(sys.argv[1]),timeout=5)
f.login(sys.argv[2],'flyenv-fixture-password'); f.storbinary('STOR '+sys.argv[2]+'.txt',io.BytesIO(b'fixture-upload')); f.quit()`
			output, err := exec.Command("/usr/bin/python3", "-c", code, strconv.Itoa(listenPort), name).CombinedOutput()
			if err != nil {
				t.Fatalf("FTP login/upload: %v %s", err, output)
			}
			st, err := os.Stat(filepath.Join(dir, "uploads", name+".txt"))
			if err != nil || int(st.Sys().(*syscall.Stat_t).Uid) != p.UID {
				t.Fatal("FTP upload did not use authorized UID", err)
			}
		}
		login("alice")
		if listenPort == port {
			addUser("bob")
			if _, err = refreshLinuxFTPUsers(p, string(mustReadFTPTestUsers(t, passwd))); err != nil {
				t.Fatal(err)
			}
			login("bob")
			cmd := exec.Command(pw, "userdel", "bob", "-f", passwd)
			if output, err := cmd.CombinedOutput(); err != nil {
				t.Fatalf("delete: %v %s", err, output)
			}
			os.Chown(passwd, p.UID, p.GID)
			if _, err = refreshLinuxFTPUsers(p, string(mustReadFTPTestUsers(t, passwd))); err != nil {
				t.Fatal(err)
			}
			code := `import ftplib,sys
f=ftplib.FTP();f.connect('127.0.0.1',int(sys.argv[1]),timeout=10)
try:f.login('bob','flyenv-fixture-password')
except ftplib.error_perm:sys.exit(0)
sys.exit(1)`
			if output, err := exec.Command("/usr/bin/python3", "-c", code, strconv.Itoa(listenPort)).CombinedOutput(); err != nil {
				t.Fatalf("deleted account remained active: %v %s", err, output)
			}
		}
		// Keep an authenticated child alive while stopping; systemd must reap the entire group.
		connection, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", listenPort), 5*time.Second)
		if err != nil {
			t.Fatal(err)
		}
		connection.SetDeadline(time.Now().Add(10 * time.Second))
		client := textproto.NewConn(connection)
		if _, _, err = client.ReadResponse(220); err != nil {
			t.Fatal(err)
		}
		client.PrintfLine("USER alice")
		if _, _, err = client.ReadResponse(331); err != nil {
			t.Fatal(err)
		}
		client.PrintfLine("PASS flyenv-fixture-password")
		if _, _, err = client.ReadResponse(230); err != nil {
			t.Fatal(err)
		}
		group, err := linuxFTPTool("/usr/bin/systemctl", "show", linuxFTPUnit(p), "--property=ControlGroup", "--value")
		if err != nil {
			t.Fatal(err)
		}
		stopped, err := stopLinuxFTP(p)
		if err != nil || stopped != pid {
			t.Fatal("FTP stop", stopped, err)
		}
		client.Close()
		members, err := os.ReadFile(filepath.Join("/sys/fs/cgroup", strings.TrimSpace(group), "cgroup.procs"))
		if err != nil && !os.IsNotExist(err) {
			t.Fatal(err)
		}
		if strings.TrimSpace(string(members)) != "" {
			t.Fatal("FTP session survived stop", string(members))
		}
		if _, err = os.Stat(fmt.Sprintf("/proc/%d", pid)); !os.IsNotExist(err) {
			t.Fatal("FTP master survived stop")
		}
		if _, err = stopLinuxFTP(p); err != nil {
			t.Fatal("idempotent stop", err)
		}
	}
}

func TestLinuxFTPMissingUnit(t *testing.T) {
	if os.Getenv("FLYENV_TEST_SYSTEMD") != "1" {
		t.Skip("requires systemd integration environment")
	}
	status, err := linuxFTPStatus(linuxPolicy{UID: 90001})
	if err != nil {
		t.Fatal(err)
	}
	if status["LoadState"] != "not-found" || status["MainPID"] != "0" {
		t.Fatal("fixture UID is already in use", status)
	}
}

func mustReadFTPTestUsers(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return data
}
