//go:build darwin

package main

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"golang.org/x/sys/unix"
	"io"
	"net"
	"os"
	"path/filepath"
	"syscall"
)

const darwinPolicyDir = "/Library/Application Support/FlyEnv/Helper"
const darwinPolicyPath = darwinPolicyDir + "/policy.json"
const darwinKeyPath = darwinPolicyDir + "/client.key"
const darwinSocketPath = "/private/var/run/flyenv-helper/helper.sock"

type darwinPolicy = unixPolicy

var installedDarwinPolicy darwinPolicy

func listenDarwinSocket() (net.Listener, error) {
	// Socket creation precedes accepting clients; never expose a world-connectable inode.
	previous := unix.Umask(0077)
	defer unix.Umask(previous)
	return net.Listen("unix", SOCKET_PATH)
}

func validateDarwinUID(uid int) error {
	if installedDarwinPolicy.UID <= 0 || uid != installedDarwinPolicy.UID {
		return fmt.Errorf("unauthorized macOS peer")
	}
	return nil
}
func prepareDarwinSocket() error {
	if err := os.MkdirAll(filepath.Dir(darwinSocketPath), 0755); err != nil {
		return err
	}
	return protectedDirectory(filepath.Dir(darwinSocketPath))
}
func darwinSocketReady() error {
	if err := protectedDirectory(filepath.Dir(darwinSocketPath)); err != nil {
		return err
	}
	if err := os.Chown(darwinSocketPath, installedDarwinPolicy.UID, installedDarwinPolicy.GID); err != nil {
		return err
	}
	return os.Chmod(darwinSocketPath, 0600)
}
func loadDarwinKey() error {
	if err := protectedDirectory(filepath.Dir(darwinKeyPath)); err != nil {
		return err
	}
	f, err := openNoSymlinks(darwinKeyPath, unix.O_RDONLY|unix.O_NONBLOCK, 0)
	if err != nil {
		return err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return err
	}
	meta := st.Sys().(*syscall.Stat_t)
	if !st.Mode().IsRegular() || meta.Uid != 0 || meta.Nlink != 1 || st.Mode().Perm() != 0600 || st.Size() != 32 {
		return fmt.Errorf("unprotected macOS helper key")
	}
	if err = checkDarwinKeyACL(f, installedDarwinPolicy.UID); err != nil {
		return err
	}
	key, err := io.ReadAll(io.LimitReader(f, 33))
	if err != nil {
		return err
	}
	if len(key) != 32 {
		return fmt.Errorf("invalid macOS key size")
	}
	helperKey = key
	return nil
}
func initializeDarwin() error {
	if os.Geteuid() != 0 {
		return fmt.Errorf("Darwin helper must run as root")
	}
	data, err := protectedFile(darwinPolicyPath, 65536)
	if err != nil {
		return fmt.Errorf("Darwin policy: %w", err)
	}
	if err = decodeUnix(json.RawMessage(data), &installedDarwinPolicy); err != nil {
		return err
	}
	p := installedDarwinPolicy
	if err := validateUnixPolicy(p); err != nil {
		return err
	}

	return nil
}
func installDarwinPolicy(args []string) error {
	p, err := policyInstallInputs(args)
	if err != nil {
		return err
	}
	if err = os.MkdirAll(darwinPolicyDir, 0755); err != nil {
		return err
	}
	if err = protectedDirectory(darwinPolicyDir); err != nil {
		return err
	}

	key := make([]byte, 32)
	if _, err = rand.Read(key); err != nil {
		return err
	}
	if err = writeProtectedFile(darwinKeyPath, key, 0600, 0); err != nil {
		return err
	}
	f, err := openNoSymlinks(darwinKeyPath, unix.O_RDONLY, 0)
	if err != nil {
		return err
	}
	err = setDarwinKeyACL(f, p.UID)
	f.Close()
	if err != nil {
		return fmt.Errorf("cannot set the helper key's UID read ACL: %w", err)
	}
	data, _ := json.MarshalIndent(p, "", "  ")
	return writeProtectedFile(darwinPolicyPath, data, 0644, 0)
}

// Health checks the startup snapshot; it never reloads credentials into live
// request globals. Policy/key updates require stopping and restarting the helper.
func validateDarwinHealth(p darwinPolicy) error {
	data, err := protectedFile(darwinPolicyPath, 65536)
	if err != nil {
		return err
	}
	var current darwinPolicy
	if err = decodeUnix(json.RawMessage(data), &current); err != nil {
		return err
	}
	if current != p {
		return fmt.Errorf("macOS policy changed; restart helper")
	}
	if err = protectedDirectory(filepath.Dir(darwinKeyPath)); err != nil {
		return err
	}
	f, err := openNoSymlinks(darwinKeyPath, unix.O_RDONLY|unix.O_NONBLOCK, 0)
	if err != nil {
		return err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return err
	}
	meta := st.Sys().(*syscall.Stat_t)
	if !st.Mode().IsRegular() || meta.Uid != 0 || meta.Nlink != 1 || st.Size() != 32 || st.Mode().Perm() != 0600 {
		return fmt.Errorf("unprotected macOS helper key")
	}
	if err = checkDarwinKeyACL(f, p.UID); err != nil {
		return err
	}
	key, err := io.ReadAll(io.LimitReader(f, 33))
	if err != nil {
		return err
	}
	if !bytes.Equal(key, helperKey) {
		return fmt.Errorf("macOS helper key changed; restart helper")
	}
	if err = protectedDirectory(filepath.Dir(darwinSocketPath)); err != nil {
		return err
	}
	socket, err := os.Lstat(darwinSocketPath)
	if err != nil {
		return err
	}
	socketMeta := socket.Sys().(*syscall.Stat_t)
	if socket.Mode()&os.ModeSocket == 0 || socketMeta.Uid != uint32(p.UID) || socket.Mode().Perm() != 0600 {
		return fmt.Errorf("unprotected macOS helper socket")
	}

	return nil
}
