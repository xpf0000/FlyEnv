//go:build linux

package main

import (
	"bytes"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"golang.org/x/sys/unix"
	"net"
	"os"
	"os/exec"
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
	if os.Geteuid() != 0 {
		t.Skip("requires root")
	}
	dir, err := os.MkdirTemp("/opt", ".flyenv-ca-test-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(dir)
	os.Chmod(dir, 0755)
	source := filepath.Join(dir, "approved.crt")
	der := []byte{1, 2, 3}
	fingerprint := digest(string(der))
	os.WriteFile(source, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), 0644)
	destination := filepath.Join(dir, "anchors")
	os.Mkdir(destination, 0755)
	counter := filepath.Join(dir, "calls")
	tool := filepath.Join(dir, "update-trust")
	script := fmt.Sprintf("#!/bin/sh\nif [ -f '%s' ]; then printf x >> '%s'; exit 0; fi\nprintf x > '%s'\nexit 1\n", counter, counter, counter)
	os.WriteFile(tool, []byte(script), 0755)
	installer := linuxCAInstaller{}
	if _, err = installer.install(source, destination, tool, fingerprint); err == nil {
		t.Fatal("failed trust update reported success")
	}
	if _, err = installer.install(source, destination, tool, fingerprint); err != nil {
		t.Fatal("partial certificate copy prevented retry:", err)
	}
	if _, err = installer.install(source, destination, tool, fingerprint); err != nil {
		t.Fatal(err)
	}
	calls, _ := os.ReadFile(counter)
	if string(calls) != "xx" {
		t.Fatal("success was not cached, or failure was cached")
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
	linuxHosts = &hostsStore{path: path, protected: true}
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

func TestManagedHostsHandlesDuplicateCompleteBlocks(t *testing.T) {
	content := "custom\n#X-HOSTS-BEGIN#\nold\n#X-HOSTS-END#\nmiddle\n#X-HOSTS-BEGIN#\nold2\n#X-HOSTS-END#\ntail\n"
	got, err := mergeManagedHosts(content, "")
	if err != nil || got != "custom\n\nmiddle\n\ntail\n" {
		t.Fatalf("got %q: %v", got, err)
	}
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

func TestManagedHostsAppendPreservesWhitespace(t *testing.T) {
	content := "custom\n\n\n"
	got, err := mergeManagedHosts(content, "127.0.0.1 arbitrary.domain\n")
	if err != nil || !strings.HasPrefix(got, content) {
		t.Fatalf("outside content changed: %q, %v", got, err)
	}
}

func TestHostsContentAndConflict(t *testing.T) {
	path := filepath.Join(t.TempDir(), "hosts")
	original := "127.0.0.1 localhost\n"
	if err := os.WriteFile(path, []byte(original), 0644); err != nil {
		t.Fatal(err)
	}
	store := hostsStore{path: path}
	before, _ := os.Stat(path)
	first, err := store.read()
	if err != nil {
		t.Fatal(err)
	}
	content := "# custom full text\n203.0.113.42 any.domain.invalid arbitrary-name\n::1 ipv6.example\n"
	if err := store.replace(content, first.Digest); err != nil {
		t.Fatal(err)
	}
	after, _ := os.Stat(path)
	if os.SameFile(before, after) {
		t.Fatal("hosts save must publish a complete new file atomically")
	}
	if err := store.replace(original, first.Digest); err == nil {
		t.Fatal("stale edit overwritten")
	}
	got, _ := os.ReadFile(path)
	if string(got) != content {
		t.Fatal("full text changed")
	}
}

func TestHostsRejectsSymlink(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "protected")
	os.WriteFile(target, []byte("keep"), 0644)
	link := filepath.Join(dir, "hosts")
	os.Symlink(target, link)
	store := hostsStore{path: link}
	if _, err := store.read(); err == nil {
		t.Fatal("followed symlink")
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
	if err = store.replace("new arbitrary hosts\n", snapshot.Digest); err != nil {
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

func TestManagedHostsPreservesOtherContent(t *testing.T) {
	original := "# custom\n198.51.100.1 user.local\n#X-HOSTS-BEGIN#\n127.0.0.1 old.local\n#X-HOSTS-END#\n# tail\n"
	got, err := mergeManagedHosts(original, "203.0.113.8 arbitrary.domain\n")
	if err != nil {
		t.Fatal(err)
	}
	want := "# custom\n198.51.100.1 user.local\n#X-HOSTS-BEGIN#\n203.0.113.8 arbitrary.domain\n#X-HOSTS-END#\n# tail\n"
	if got != want {
		t.Fatalf("got %q", got)
	}
}
