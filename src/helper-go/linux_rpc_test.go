//go:build linux

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// Business clients wait for EOF, unlike the health checker which half-closes.
func TestLinuxRPCResponseCloses(t *testing.T) {
	if os.Getuid() == 0 {
		t.Skip("run with an ordinary account; root RPC is covered by TestLinuxSignedRPC")
	}
	savedPolicy, savedKey := installedLinuxPolicy, helperKey
	t.Cleanup(func() { installedLinuxPolicy, helperKey = savedPolicy, savedKey })
	installedLinuxPolicy = linuxPolicy{Version: Helper_Version, UID: os.Getuid(), GID: os.Getgid()}
	helperKey = bytes.Repeat([]byte{1}, 32)
	for _, tc := range []struct {
		name, module, function string
		code                   int
		halfClose              bool
	}{
		{"success", "helper", "version", 0, false},
		{"business rejection", "tools", "runScript", 1, false},
		{"health half-close", "helper", "version", 0, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			socket := filepath.Join(t.TempDir(), "socket")
			listener, err := net.Listen("unix", socket)
			if err != nil {
				t.Fatal(err)
			}
			defer listener.Close()
			app := NewAppHelper()
			go func() {
				conn, err := listener.Accept()
				if err == nil {
					app.handleClient(conn)
				}
			}()
			conn, err := net.Dial("unix", socket)
			if err != nil {
				t.Fatal(err)
			}
			defer conn.Close()
			conn.SetDeadline(time.Now().Add(time.Second))
			exe, _ := os.Executable()
			req := TaskItem{Key: "eof", Module: tc.module, Function: tc.function, Args: []interface{}{}, Ts: time.Now().UnixMilli(), Nonce: fmt.Sprint(time.Now().UnixNano()), ClientPid: os.Getpid(), ClientExe: exe}
			req.Sig = signTaskForTest(helperKey, req)
			data, _ := json.Marshal(req)
			if _, err = conn.Write(data); err != nil {
				t.Fatal(err)
			}
			var res Response
			if err = json.NewDecoder(conn).Decode(&res); err != nil {
				t.Fatal(err)
			}
			if res.Key != "eof" || res.Code != tc.code {
				t.Fatalf("unexpected response: %+v", res)
			}
			if tc.halfClose {
				conn.(*net.UnixConn).CloseWrite()
			}
			if _, err = io.ReadAll(conn); err != nil {
				t.Fatalf("response arrived without EOF: %v", err)
			}
		})
	}
}

func TestLinuxHostsSyncReportsChanges(t *testing.T) {
	path := filepath.Join(t.TempDir(), "hosts")
	content := "127.0.0.1 localhost\n#X-HOSTS-BEGIN#\n203.0.113.8     arbitrary.example\n#X-HOSTS-END#\n# keep tail\n"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	savedHosts := linuxHosts
	linuxHosts = &hostsStore{path: path}
	t.Cleanup(func() { linuxHosts = savedHosts })
	p := linuxPolicy{Version: Helper_Version, UID: 1000}
	send := func(fn string, entries []interface{}, digest string) (interface{}, error) {
		return dispatchLinux(TaskItem{Module: "host", Function: fn, Args: []interface{}{map[string]interface{}{"entries": entries, "digest": digest}}}, p)
	}
	entries := []interface{}{map[string]interface{}{"ip": "203.0.113.8", "domain": "arbitrary.example"}}
	before, _ := os.Stat(path)
	changed, err := send("syncManagedEntries", entries, digest(content))
	if err != nil || changed != false {
		t.Fatalf("matching block must report no change: %v %v", changed, err)
	}
	after, _ := os.Stat(path)
	if !os.SameFile(before, after) {
		t.Fatal("no-op replaced hosts")
	}
	changed, err = send("clearManagedEntries", []interface{}{}, digest(content))
	if err != nil || changed != true {
		t.Fatalf("clear must report change: %v %v", changed, err)
	}
	want := "127.0.0.1 localhost\n\n# keep tail\n"
	got, _ := os.ReadFile(path)
	if string(got) != want {
		t.Fatalf("outside block changed: %q", got)
	}
	changed, err = send("clearManagedEntries", []interface{}{}, digest(want))
	if err != nil || changed != false {
		t.Fatalf("second clear must report no change: %v %v", changed, err)
	}
	if _, err = send("syncManagedEntries", entries, digest(content)); err == nil {
		t.Fatal("stale snapshot accepted")
	}
}
