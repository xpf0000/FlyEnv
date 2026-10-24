//go:build linux || darwin

package main

import (
	"net"
	"os"
	"path/filepath"
	"runtime"
	"syscall"
	"testing"
)

func socketFixtureDirectory(t *testing.T) string {
	t.Helper()
	root, err := filepath.EvalSymlinks("/tmp")
	if err != nil {
		t.Fatal(err)
	}
	dir, err := os.MkdirTemp(root, "hs-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	if err := os.Chmod(dir, 0777); err != nil {
		t.Fatal(err)
	}
	return dir
}

func TestUnixHelperSocketPublicationAndCleanup(t *testing.T) {
	path := filepath.Join(socketFixtureDirectory(t), "helper.sock")
	listener, err := listenUnixHelperSocket(path, os.Getuid(), os.Getgid())
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	if err := unixSocketReady(path, os.Getuid()); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(filepath.Dir(path))
	if err != nil || len(entries) != 1 || entries[0].Name() != "helper.sock" {
		t.Fatal("private publication directory leaked", entries, err)
	}
	connection, err := net.Dial(listener.Addr().Network(), listener.Addr().String())
	if err != nil {
		t.Fatal("published socket is not connectable", err)
	}
	connection.Close()
	if err := listener.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Lstat(path); !os.IsNotExist(err) {
		t.Fatal("closed listener left its socket behind", err)
	}
}

func TestUnixHelperSocketNeverChangesSymlinkTargetMetadata(t *testing.T) {
	dir := socketFixtureDirectory(t)
	target, path := filepath.Join(dir, "target"), filepath.Join(dir, "helper.sock")
	if err := os.WriteFile(target, []byte("original"), 0644); err != nil {
		t.Fatal(err)
	}
	before, err := os.Stat(target)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, path); err != nil {
		t.Fatal(err)
	}
	listener, err := listenUnixHelperSocket(path, os.Getuid(), os.Getgid())
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	after, err := os.Stat(target)
	if err != nil || !os.SameFile(before, after) || after.Mode() != before.Mode() {
		t.Fatal("socket publication changed an unrelated file", err)
	}
	if err := unixSocketReady(path, os.Getuid()); err != nil {
		t.Fatal(err)
	}
}

func TestUnixHelperSocketCloseKeepsReplacement(t *testing.T) {
	path := filepath.Join(socketFixtureDirectory(t), "helper.sock")
	listener, err := listenUnixHelperSocket(path, os.Getuid(), os.Getgid())
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("replacement"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := unixSocketReady(path, os.Getuid()); err == nil {
		t.Fatal("regular file accepted as the helper socket")
	}
	listener.Close()
	data, err := os.ReadFile(path)
	if err != nil || string(data) != "replacement" {
		t.Fatal("cleanup deleted a replacement inode", err)
	}
}

func TestUnixHelperSocketPublicationErrorPreservesDestination(t *testing.T) {
	path := filepath.Join(socketFixtureDirectory(t), "helper.sock")
	if err := os.Mkdir(path, 0755); err != nil {
		t.Fatal(err)
	}
	if listener, err := listenUnixHelperSocket(path, os.Getuid(), os.Getgid()); err == nil {
		listener.Close()
		t.Fatal("publication into a directory reported success")
	}
	info, err := os.Stat(path)
	if err != nil || !info.IsDir() {
		t.Fatal("failed publication changed the existing destination", err)
	}
	entries, err := os.ReadDir(filepath.Dir(path))
	if err != nil || len(entries) != 1 || entries[0].Name() != "helper.sock" {
		t.Fatal("failed publication leaked private staging", entries, err)
	}
}

func TestUnixHelperSocketSupportsSeparateLinuxRuntimeFilesystem(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("Linux tmpfs fixture")
	}
	tempInfo, tempErr := os.Stat("/tmp")
	runtimeInfo, runtimeErr := os.Stat("/dev/shm")
	if tempErr != nil || runtimeErr != nil || tempInfo.Sys().(*syscall.Stat_t).Dev == runtimeInfo.Sys().(*syscall.Stat_t).Dev {
		t.Skip("separate writable tmpfs is unavailable")
	}
	dir, err := os.MkdirTemp("/dev/shm", "hs-")
	if err != nil {
		t.Skip("tmpfs fixture is not writable", err)
	}
	defer os.RemoveAll(dir)
	path := filepath.Join(dir, "helper.sock")
	listener, err := listenUnixHelperSocket(path, os.Getuid(), os.Getgid())
	if err != nil {
		t.Fatal("socket publication must not rename across filesystems", err)
	}
	defer listener.Close()
	if err := unixSocketReady(path, os.Getuid()); err != nil {
		t.Fatal(err)
	}
}

func TestUnixHelperSocketConcurrentReplacementKeepsTargetMetadata(t *testing.T) {
	dir := socketFixtureDirectory(t)
	target, path := filepath.Join(dir, "target"), filepath.Join(dir, "helper.sock")
	if err := os.WriteFile(target, []byte("original"), 0644); err != nil {
		t.Fatal(err)
	}
	before, err := os.Stat(target)
	if err != nil {
		t.Fatal(err)
	}
	stop, done := make(chan struct{}), make(chan struct{})
	go func() {
		defer close(done)
		for {
			select {
			case <-stop:
				return
			default:
				os.Remove(path)
				os.Symlink(target, path)
			}
		}
	}()
	defer func() { close(stop); <-done }()
	for attempt := 0; attempt < 25; attempt++ {
		listener, err := listenUnixHelperSocket(path, os.Getuid(), os.Getgid())
		if err != nil {
			t.Fatal(err)
		}
		listener.Close()
		info, err := os.Stat(target)
		if err != nil || !os.SameFile(before, info) || info.Mode() != before.Mode() {
			t.Fatal("concurrent socket replacement changed the target", err)
		}
	}
}
