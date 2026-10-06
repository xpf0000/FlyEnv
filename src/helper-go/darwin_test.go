//go:build darwin

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"golang.org/x/sys/unix"
	"helper-go/utils"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestDarwinFixedBoundary(t *testing.T) {
	p := darwinPolicy{Version: Helper_Version, UID: 501, GID: 20}
	for _, action := range []string{"tools.runScript", "tools.writeFileByRoot", "tools.writeBufferBase64ByRoot", "tools.readFileByRoot", "tools.rm", "tools.chmod", "tools.kill", "tools.killPorts", "tools.ln_s", "tools.processListWin", "tools.getPortPids", "tools.removeLoginItemMac", "rabbitmq.initPlugin", "php.iniFileFixed", "redis.logFileFixed", "mailpit.binFixed", "mysql.macportsDirFixed", "mariadb.macportsDirFixed", "host.sslAddTrustedCert", "host.sslFindCertificate", "service.launchLowPort"} {
		parts := strings.SplitN(action, ".", 2)
		if _, err := dispatchDarwin(TaskItem{Module: parts[0], Function: parts[1]}, p); err == nil {
			t.Fatal("accepted closed operation", action)
		}
	}
	for _, request := range []TaskItem{{Module: "host", Function: "replaceHostsContent", Args: []interface{}{map[string]interface{}{"content": "text", "digest": strings.Repeat("a", 64), "path": "/etc/profile"}}}, {Module: "host", Function: "installApprovedCA", Args: []interface{}{"attacker"}}, {Module: "tools", Function: "repairManagedPidDirectory", Args: []interface{}{"/etc"}}, {Module: "ftp", Function: "start", Args: []interface{}{map[string]interface{}{"bin": "/tmp/pure-ftpd", "label": "attacker"}}}} {
		if _, err := dispatchDarwin(request, p); err == nil {
			t.Fatal("accepted unapproved argument", request)
		}
	}
}
func TestDarwinPeerBindingAndSignedDenial(t *testing.T) {
	dir, err := os.MkdirTemp("/private/tmp", "fh-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(dir)
	socket := filepath.Join(dir, "socket")
	listener, err := net.Listen("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	savedPolicy, savedKey := installedDarwinPolicy, helperKey
	defer func() { installedDarwinPolicy = savedPolicy; helperKey = savedKey }()
	installedDarwinPolicy = darwinPolicy{Version: Helper_Version, UID: os.Getuid(), GID: os.Getgid()}
	helperKey = bytes.Repeat([]byte{1}, 32)
	app := NewAppHelper()
	if app.validatePeer(utils.PeerInfo{UID: os.Getuid() + 1}) == nil {
		t.Fatal("foreign UID accepted")
	}
	if app.validateClientBinding(TaskItem{ClientPid: os.Getpid()}, utils.PeerInfo{PID: -1}) == nil {
		t.Fatal("missing true PID accepted")
	}
	for _, fakePID := range []bool{false, true} {
		conn, err := net.Dial("unix", socket)
		if err != nil {
			t.Fatal(err)
		}
		server, err := listener.Accept()
		if err != nil {
			t.Fatal(err)
		}
		peer, err := utils.PeerInfoFromConn(server)
		if err != nil || peer.PID != os.Getpid() || peer.UID != os.Getuid() {
			t.Fatalf("wrong actual peer: %+v %v", peer, err)
		}
		go app.handleClient(server)
		req := TaskItem{Key: "test", Module: "tools", Function: "runScript", Args: []interface{}{"/bin/sh", "/tmp/attacker"}, Ts: time.Now().UnixMilli(), Nonce: fmt.Sprint(time.Now().UnixNano()), ClientPid: os.Getpid()}
		if fakePID {
			req.ClientPid++
		}
		req.Sig = signTaskForTest(helperKey, req)
		data, _ := json.Marshal(req)
		conn.SetDeadline(time.Now().Add(3 * time.Second))
		conn.Write(data)
		var response Response
		if err = json.NewDecoder(conn).Decode(&response); err != nil {
			t.Fatal(err)
		}
		conn.Close()
		if response.Code == 0 {
			t.Fatal("signed closed RPC accepted")
		}
		if !fakePID && !strings.Contains(response.Msg, "macOS helper denies") {
			t.Fatal(response.Msg)
		}
		if fakePID && response.Msg != "client binding mismatch" {
			t.Fatal(response.Msg)
		}
	}
}
func TestDarwinFTPExecutableAndFixedPlist(t *testing.T) {
	dir := canonicalTempDir(t)
	data, err := os.ReadFile("/usr/bin/true")
	if err != nil {
		t.Fatal(err)
	}
	bin := filepath.Join(dir, "pure-ftpd")
	os.WriteFile(bin, data, 0755)
	if _, err = darwinFTPBinary(bin, "pure-ftpd"); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(bin, []byte("#!/bin/sh\nid\n"), 0755)
	if _, err = darwinFTPBinary(bin, "pure-ftpd"); err == nil {
		t.Fatal("accepted script")
	}
	os.Remove(bin)
	if err = unix.Mkfifo(bin, 0755); err != nil {
		t.Fatal(err)
	}
	if _, err = darwinFTPBinary(bin, "pure-ftpd"); err == nil {
		t.Fatal("accepted FIFO")
	}
	plist := darwinFTPPlist(darwinPolicy{UID: 501}, "/user/&/pure-ftpd", "/private/fixed")
	for _, expected := range []string{"com.flyenv.pure-ftpd.501", "/user/&amp;/pure-ftpd", "AbandonProcessGroup</key><false/>", "KeepAlive</key><false/>"} {
		if !strings.Contains(plist, expected) {
			t.Fatal("missing fixed setting", expected)
		}
	}
}

func TestDarwinOversizedResponseRetainsRequestKey(t *testing.T) {
	dir, err := os.MkdirTemp("/private/tmp", "fh-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(dir)
	path := filepath.Join(dir, "hosts")
	if err = os.WriteFile(path, bytes.Repeat([]byte{1}, 512*1024), 0644); err != nil {
		t.Fatal(err)
	}
	savedPolicy, savedKey, savedHosts := installedDarwinPolicy, helperKey, darwinHosts
	defer func() { installedDarwinPolicy, helperKey, darwinHosts = savedPolicy, savedKey, savedHosts }()
	installedDarwinPolicy = darwinPolicy{Version: Helper_Version, UID: os.Getuid(), GID: os.Getgid()}
	helperKey = bytes.Repeat([]byte{1}, 32)
	darwinHosts = &hostsStore{path: path}
	listener, err := net.Listen("unix", filepath.Join(dir, "socket"))
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	conn, err := net.Dial("unix", listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	server, err := listener.Accept()
	if err != nil {
		t.Fatal(err)
	}
	go NewAppHelper().handleClient(server)
	req := TaskItem{Key: "oversized-response", Module: "host", Function: "readHosts", Ts: time.Now().UnixMilli(), Nonce: fmt.Sprint(time.Now().UnixNano()), ClientPid: os.Getpid()}
	req.Sig = signTaskForTest(helperKey, req)
	data, _ := json.Marshal(req)
	conn.SetDeadline(time.Now().Add(3 * time.Second))
	if _, err = conn.Write(data); err != nil {
		t.Fatal(err)
	}
	var response Response
	if err = json.NewDecoder(conn).Decode(&response); err != nil {
		t.Fatal(err)
	}
	if response.Code != 1 || response.Msg != "helper response exceeds size limit" || response.Key != req.Key {
		t.Fatalf("oversized response must remain associated with its request: %+v", response)
	}
}

func TestDarwinSocketIsPrivateAtCreation(t *testing.T) {
	dir, err := os.MkdirTemp("/private/tmp", "fh-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(dir)
	previousPath := SOCKET_PATH
	SOCKET_PATH = filepath.Join(dir, "socket")
	defer func() { SOCKET_PATH = previousPath }()
	previousMask := unix.Umask(0)
	defer unix.Umask(previousMask)
	listener, err := listenDarwinSocket()
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	st, err := os.Lstat(SOCKET_PATH)
	if err != nil {
		t.Fatal(err)
	}
	if st.Mode().Perm()&0077 != 0 {
		t.Fatalf("socket exposed before ready: %v", st.Mode())
	}
	if current := unix.Umask(0); current != 0 {
		t.Fatalf("creation leaked process umask: %03o", current)
	}
}
