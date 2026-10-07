//go:build linux

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"golang.org/x/sys/unix"
	"net"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestLinuxRejectsLegacyRootOperations(t *testing.T) {
	for _, action := range [][2]string{{"tools", "runScript"}, {"tools", "writeFileByRoot"}, {"tools", "rm"}, {"tools", "kill"}, {"rabbitmq", "initPlugin"}, {"php", "iniFileFixed"}} {
		_, err := dispatchLinux(TaskItem{Module: action[0], Function: action[1]}, linuxPolicy{Version: Helper_Version, UID: 1000})
		if err == nil {
			t.Fatalf("accepted %v", action)
		}
	}
}

func TestLinuxCAUpdateFailureIsRetryable(t *testing.T) {
	dir := canonicalTempDir(t)
	source := filepath.Join(dir, "snapshot.crt")
	os.WriteFile(source, []byte("public snapshot"), 0600)
	destination := filepath.Join(dir, "anchors")
	os.Mkdir(destination, 0777)
	os.Chmod(destination, 0777)
	counter := filepath.Join(dir, "calls")
	tool := filepath.Join(dir, "update-trust")
	script := fmt.Sprintf("#!/bin/sh\nif [ -f '%s' ]; then printf x >> '%s'; exit 0; fi\nprintf x > '%s'\nexit 1\n", counter, counter, counter)
	os.WriteFile(tool, []byte(script), 0777)
	os.Chmod(tool, 0777)
	if err := installLinuxCA(source, destination, tool); err == nil {
		t.Fatal("failed trust update reported success")
	}
	if err := installLinuxCA(source, destination, tool); err != nil {
		t.Fatal("partial certificate copy prevented retry:", err)
	}
	calls, _ := os.ReadFile(counter)
	if string(calls) != "xx" {
		t.Fatal("failed trust update was cached")
	}
	data, err := os.ReadFile(filepath.Join(destination, unixCAFile))
	if err != nil || string(data) != "public snapshot" {
		t.Fatal("wrong fixed CA destination", err)
	}
}

func TestLinuxPolicyAllowsUserConfiguredDataRootOwnership(t *testing.T) {
	if os.Geteuid() != 0 {
		t.Skip("requires root")
	}
	account, err := user.Lookup("nobody")
	if err != nil {
		t.Skip("non-root account fixture unavailable")
	}
	dir := canonicalTempDir(t)
	if err = os.Chmod(dir, 0777); err != nil {
		t.Fatal(err)
	}
	policy, err := policyInstallInputs([]string{
		"installer", account.Uid + ":" + account.Gid, dir,
	})
	if err != nil || policy.DataRoot != dir {
		t.Fatal("a user-writable root-owned data directory blocked policy installation", err)
	}
}

func TestLinuxRootACL(t *testing.T) {
	if os.Geteuid() != 0 {
		t.Skip("requires root")
	}
	dir, err := os.MkdirTemp("/opt", ".flyenv-acl-test-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(dir)
	os.Chmod(dir, 0755)
	path := filepath.Join(dir, "key")
	os.WriteFile(path, bytes.Repeat([]byte{1}, 32), 0600)
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	err = unix.Fsetxattr(int(f.Fd()), "system.posix_acl_access", linuxKeyACL(1000), 0)
	f.Close()
	if err != nil {
		t.Fatal(err)
	}
	for _, uid := range []uint32{1000, 65534} {
		cmd := exec.Command("/usr/bin/cat", path)
		cmd.SysProcAttr = &syscall.SysProcAttr{Credential: &syscall.Credential{Uid: uid, Gid: 1000, Groups: []uint32{1000}}}
		output, err := cmd.Output()
		if uid == 1000 && (err != nil || len(output) != 32) {
			t.Fatal("authorized UID cannot read")
		}
		if uid != 1000 && err == nil {
			t.Fatal("shared group can read key")
		}
	}
	cmd := exec.Command("/bin/sh", "-c", "echo attacker > \"$1\"", "sh", path)
	cmd.SysProcAttr = &syscall.SysProcAttr{Credential: &syscall.Credential{Uid: 1000, Gid: 1000}}
	if cmd.Run() == nil {
		t.Fatal("authorized UID can replace key contents")
	}
	st, _ := os.Stat(path)
	if st.Sys().(*syscall.Stat_t).Uid != 0 {
		t.Fatal("key is not root-owned")
	}
}

func TestLinuxSignedRPC(t *testing.T) {
	if os.Geteuid() != 0 {
		t.Skip("requires root")
	}
	dir, err := os.MkdirTemp("/opt", ".flyenv-rpc-test-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(dir)
	os.Chmod(dir, 0755)
	path := filepath.Join(dir, "hosts")
	os.WriteFile(path, []byte("127.0.0.1 localhost\n"), 0644)
	rootTarget := filepath.Join(dir, "protected")
	os.WriteFile(rootTarget, []byte("keep"), 0600)
	socket := filepath.Join(dir, "socket")
	listener, err := net.Listen("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	os.Chown(socket, 1000, 1000)
	os.Chmod(socket, 0600)
	savedPolicy, savedKey, savedHosts := installedLinuxPolicy, helperKey, linuxHosts
	defer func() { installedLinuxPolicy = savedPolicy; helperKey = savedKey; linuxHosts = savedHosts }()
	installedLinuxPolicy = linuxPolicy{Version: Helper_Version, UID: 1000, GID: 1000, DataRoot: dir}
	helperKey = bytes.Repeat([]byte{1}, 32)
	linuxHosts = &hostsStore{path: path}
	app := NewAppHelper()
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			go app.handleClient(conn)
		}
	}()
	self, _ := os.Executable()
	cmd := exec.Command(self, "-test.run=^TestLinuxRPCClient$", "-test.v")
	cmd.Env = append(os.Environ(), "FLYENV_RPC_SOCKET="+socket)
	cmd.SysProcAttr = &syscall.SysProcAttr{Credential: &syscall.Credential{Uid: 1000, Gid: 1000, Groups: []uint32{1000}}}
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("signed client failed: %v\n%s", err, output)
	}
	got, _ := os.ReadFile(path)
	if string(got) != "# shell text stays data: $(id)\n203.0.113.9 arbitrary.example\n" {
		t.Fatalf("hosts edit missing: %s", got)
	}
	kept, _ := os.ReadFile(rootTarget)
	if string(kept) != "keep" {
		t.Fatal("legacy RPC modified protected fixture")
	}
}

func TestLinuxRPCClient(t *testing.T) {
	socket := os.Getenv("FLYENV_RPC_SOCKET")
	if socket == "" {
		t.Skip("internal test client")
	}
	if os.Geteuid() != 1000 {
		t.Fatal("test must use delegated account")
	}
	key := bytes.Repeat([]byte{1}, 32)
	send := func(module, function string, args []interface{}) Response {
		conn, err := net.Dial("unix", socket)
		if err != nil {
			t.Fatal(err)
		}
		defer conn.Close()
		conn.SetDeadline(time.Now().Add(5 * time.Second))
		exe, _ := os.Executable()
		req := TaskItem{Key: "test", Module: module, Function: function, Args: args, Ts: time.Now().UnixMilli(), Nonce: fmt.Sprintf("%d", time.Now().UnixNano()), ClientPid: os.Getpid(), ClientExe: exe}
		req.Sig = signTaskForTest(key, req)
		data, _ := json.Marshal(req)
		if _, err = conn.Write(data); err != nil {
			t.Fatal(err)
		}
		var response Response
		if err = json.NewDecoder(conn).Decode(&response); err != nil {
			t.Fatal(err)
		}
		return response
	}
	if res := send("helper", "version", []interface{}{}); res.Code != 0 {
		t.Fatal(res.Msg)
	}
	for _, action := range [][2]string{{"tools", "runScript"}, {"tools", "writeFileByRoot"}, {"tools", "kill"}, {"rabbitmq", "initPlugin"}, {"tools", "chmod"}} {
		res := send(action[0], action[1], []interface{}{filepath.Join(filepath.Dir(socket), "protected"), "attacker"})
		if res.Code == 0 || !strings.Contains(res.Msg, "Linux helper denies") {
			t.Fatalf("signed root escape accepted: %v", action)
		}
	}
	res := send("host", "readHosts", []interface{}{})
	if res.Code != 0 {
		t.Fatal(res.Msg)
	}
	data, _ := json.Marshal(res.Data)
	var snapshot hostsSnapshot
	json.Unmarshal(data, &snapshot)
	content := "# shell text stays data: $(id)\n203.0.113.9 arbitrary.example\n"
	req := []interface{}{map[string]interface{}{"content": content, "digest": snapshot.Digest}}
	if res = send("host", "replaceHostsContent", req); res.Code != 0 {
		t.Fatal(res.Msg)
	}
	if res = send("host", "replaceHostsContent", req); res.Code == 0 {
		t.Fatal("stale signed edit accepted")
	}
}

func TestLinuxServiceCredentials(t *testing.T) {
	binary := os.Getenv("FLYENV_TEST_HELPER")
	if os.Geteuid() != 0 || binary == "" {
		t.Skip("requires root and an isolated test helper binary")
	}
	dir, err := os.MkdirTemp("/opt", ".flyenv-helper-test-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(dir)
	if err = os.Chmod(dir, 0755); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(binary)
	if err != nil {
		t.Fatal(err)
	}
	self := filepath.Join(dir, "helper")
	if err = os.WriteFile(self, data, 0755); err != nil {
		t.Fatal(err)
	}
	userDir := filepath.Join(dir, "data")
	os.Mkdir(userDir, 0755)
	os.Chown(userDir, 1000, 1000)
	rootFile := filepath.Join(dir, "root-only")
	os.WriteFile(rootFile, []byte("keep"), 0600)
	out := filepath.Join(userDir, "out")
	// A user can replace their service executable; even that code must stay non-root.
	service := filepath.Join(userDir, "nginx")
	if err = os.WriteFile(service, []byte("#!/bin/bash\ncat /proc/self/status; echo user-data > \"$USER_FILE\"; if echo hacked > \"$ROOT_FILE\"; then exit 99; fi; sleep 5\n"), 0755); err != nil {
		t.Fatal(err)
	}
	os.Chown(service, 1000, 1000)
	errFile := filepath.Join(userDir, "err")
	prefix := filepath.Join(userDir, "server/nginx/common")
	request := linuxLaunch{Service: "nginx", Bin: service, Args: []string{"-p", prefix, "-e", errFile, "-c", filepath.Join(userDir, "nginx.conf"), "-g", fmt.Sprintf("pid %s;error_log %s;daemon off;", filepath.Join(prefix, "logs/nginx.pid"), errFile)}, Cwd: userDir, OutFile: out, ErrFile: errFile, Env: map[string]string{"PATH": "/usr/bin:/bin", "USER_FILE": filepath.Join(userDir, "owned"), "ROOT_FILE": rootFile}}
	pid, err := launchLinuxServiceWithBinary(request, linuxPolicy{UID: 1000, GID: 1000, DataRoot: userDir}, self)
	if err != nil {
		t.Fatal(err)
	}
	defer syscall.Kill(pid, syscall.SIGKILL)
	status, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	for _, line := range []string{"Uid:\t1000\t1000\t1000\t1000", "Gid:\t1000\t1000\t1000\t1000", "Groups:\t1000", "CapEff:\t0000000000000400", "CapAmb:\t0000000000000400", "NoNewPrivs:\t1"} {
		if !strings.Contains(string(status), line) {
			t.Fatalf("missing %q in %s", line, status)
		}
	}
	got, _ := os.ReadFile(rootFile)
	if string(got) != "keep" {
		t.Fatal("root file modified")
	}
	st, err := os.Stat(filepath.Join(userDir, "owned"))
	if err != nil || st.Sys().(*syscall.Stat_t).Uid != 1000 {
		t.Fatal("log/payload was opened before dropping UID")
	}
	syscall.Kill(pid, syscall.SIGKILL)
	time.Sleep(50 * time.Millisecond)
}

func TestLinuxStrictRequests(t *testing.T) {
	p := linuxPolicy{Version: Helper_Version, UID: 1000}
	for _, info := range []TaskItem{
		{Module: "host", Function: "replaceHostsContent", Args: []interface{}{map[string]interface{}{"content": "text", "digest": strings.Repeat("a", 64), "path": "/etc/profile"}}},
		{Module: "tools", Function: "repairManagedPidDirectory", Args: []interface{}{"/etc"}},
		{Module: "host", Function: "installApprovedCA", Args: []interface{}{"attacker"}},
		{Module: "service", Function: "launchLowPort", Args: []interface{}{map[string]interface{}{"service": "custom", "uid": 0}}},
	} {
		if _, err := dispatchLinux(info, p); err == nil {
			t.Fatalf("accepted %s.%s", info.Module, info.Function)
		}
	}
}

func TestLinuxUIDPolicy(t *testing.T) {
	previous := installedLinuxPolicy
	defer func() { installedLinuxPolicy = previous }()
	installedLinuxPolicy = linuxPolicy{UID: 1000}
	if validateLinuxUID(1000) != nil {
		t.Fatal("authorized UID rejected")
	}
	if validateLinuxUID(1001) == nil || validateLinuxUID(0) == nil {
		t.Fatal("foreign UID accepted")
	}
	installedLinuxPolicy = linuxPolicy{}
	if validateLinuxUID(0) == nil {
		t.Fatal("missing policy accepted")
	}
}

func TestLinuxServiceBusinessOptions(t *testing.T) {
	p := linuxPolicy{DataRoot: "/home/user/FlyEnv"}
	prefix := p.DataRoot + "/server/nginx/common"
	errlog := prefix + "/logs/error.log"
	requests := []linuxLaunch{
		{Service: "nginx", Bin: "/usr/sbin/nginx", Args: []string{"-p", prefix, "-e", errlog, "-c", prefix + "/conf/nginx.conf", "-g", "pid " + prefix + "/logs/nginx.pid;error_log " + errlog + ";daemon off;"}},
		{Service: "apache", Bin: "/usr/sbin/apache2", Args: []string{"-f", p.DataRoot + "/server/apache/httpd.conf", "-c", `PidFile "/home/user/FlyEnv/server/apache/httpd.pid"`, "-c", `CustomLog "/home/user/FlyEnv/server/apache/common/logs/access_log" common`, "-D", "FOREGROUND"}},
		{Service: "caddy", Bin: "/usr/bin/caddy", Args: []string{"run", "--config", p.DataRoot + "/caddy.conf", "--watch"}},
		{Service: "frankenphp", Bin: "/usr/bin/frankenphp", Args: []string{"run", "--config", p.DataRoot + "/frankenphp.conf", "--pidfile", p.DataRoot + "/frankenphp.pid"}},
	}
	for _, req := range requests {
		if err := validateLinuxServiceRequest(req, p); err != nil {
			t.Fatalf("%s: %v", req.Service, err)
		}
		bad := req
		bad.Bin = "/bin/bash"
		if validateLinuxServiceRequest(bad, p) == nil {
			t.Fatal("shell accepted")
		}
		bad = req
		bad.Args = []string{"-c", "echo arbitrary"}
		if validateLinuxServiceRequest(bad, p) == nil {
			t.Fatal("arbitrary options accepted")
		}
	}
	requests[2].Args[2] = "/etc/caddy.conf"
	if validateLinuxServiceRequest(requests[2], p) == nil {
		t.Fatal("external configuration accepted")
	}
}

func TestHostsPreservesACLAndXattrs(t *testing.T) {
	path := filepath.Join(t.TempDir(), "hosts")
	if err := os.WriteFile(path, []byte("original\n"), 0644); err != nil {
		t.Fatal(err)
	}
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	attributes := map[string][]byte{"user.flyenv-test": []byte("metadata"), "system.posix_acl_access": linuxKeyACL(65534)}
	for name, value := range attributes {
		if err = unix.Fsetxattr(int(f.Fd()), name, value, 0); err != nil {
			f.Close()
			t.Fatal(err)
		}
	}
	f.Close()
	store := hostsStore{path: path}
	snapshot, err := store.read()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = store.replace("new arbitrary hosts\n", snapshot.Digest); err != nil {
		t.Fatal(err)
	}
	f, err = os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	for name, expected := range attributes {
		buffer := make([]byte, 256)
		n, err := unix.Fgetxattr(int(f.Fd()), name, buffer)
		if err != nil || !bytes.Equal(buffer[:n], expected) {
			t.Fatalf("lost %s: %v", name, err)
		}
	}
}

func TestLinuxServiceBusinessPathsAcceptDataAliases(t *testing.T) {
	root := canonicalTempDir(t)
	alias := filepath.Join(canonicalTempDir(t), "data-alias")
	if err := os.Symlink(root, alias); err != nil {
		t.Fatal(err)
	}
	p := linuxPolicy{DataRoot: root}
	prefix := filepath.Join(alias, "server/nginx/common")
	errlog := filepath.Join(prefix, "logs/error.log")
	requests := []linuxLaunch{
		{Service: "nginx", Bin: "/usr/sbin/nginx", Args: []string{"-p", prefix, "-e", errlog, "-c", filepath.Join(prefix, "conf/nginx.conf"), "-g", "pid " + filepath.Join(prefix, "logs/nginx.pid") + ";error_log " + errlog + ";daemon off;"}},
		{Service: "apache", Bin: "/usr/sbin/apache2", Args: []string{"-f", filepath.Join(alias, "server/apache/httpd.conf"), "-c", "PidFile \"" + filepath.Join(alias, "server/apache/httpd.pid") + "\"", "-c", "CustomLog \"" + filepath.Join(alias, "server/apache/common/logs/access_log") + "\" common", "-D", "FOREGROUND"}},
		{Service: "caddy", Bin: "/usr/bin/caddy", Args: []string{"run", "--config", filepath.Join(alias, "server/caddy.conf"), "--watch"}},
		{Service: "frankenphp", Bin: "/usr/bin/frankenphp", Args: []string{"run", "--config", filepath.Join(alias, "server/frankenphp.conf"), "--pidfile", filepath.Join(alias, "server/frankenphp.pid")}},
	}
	for _, req := range requests {
		if err := validateLinuxServiceRequest(req, p); err != nil {
			t.Fatalf("%s alias rejected: %v", req.Service, err)
		}
	}
	outside := canonicalTempDir(t)
	if err := os.MkdirAll(filepath.Join(root, "server"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "server/escape")); err != nil {
		t.Fatal(err)
	}
	requests[2].Args[2] = filepath.Join(alias, "server/escape/caddy.conf")
	if err := validateLinuxServiceRequest(requests[2], p); err != nil {
		t.Fatal("ordinary service cannot use user-managed config links", err)
	}
	requests[2].Args[2] = filepath.Join(outside, "caddy.conf")
	if validateLinuxServiceRequest(requests[2], p) == nil {
		t.Fatal("unrelated configuration path accepted")
	}
}
