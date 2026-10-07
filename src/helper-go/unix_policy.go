//go:build linux || darwin

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"golang.org/x/sys/unix"
	"io"
	"os"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
)

const hostsLimit = 1024 * 1024

type unixPolicy struct {
	Version  int    `json:"version"`
	UID      int    `json:"uid"`
	GID      int    `json:"gid"`
	DataRoot string `json:"dataRoot"`
}

func protectedDirectory(path string) error {
	// Only FlyEnv-managed directories belong to this policy. System ancestors
	// retain their administrator-configured ownership, modes and ACLs.
	f, err := openNoSymlinks(path, unix.O_RDONLY|unix.O_DIRECTORY, 0)
	if err != nil {
		return err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return err
	}
	if st.Sys().(*syscall.Stat_t).Uid != 0 || st.Mode().Perm()&0022 != 0 {
		return fmt.Errorf("unprotected directory: %s", path)
	}
	return validateProtectedACL(f)
}

func openNoSymlinks(path string, flags int, mode uint32) (*os.File, error) {
	if !filepath.IsAbs(path) || filepath.Clean(path) != path {
		return nil, fmt.Errorf("expected clean absolute path")
	}
	// Pinned directory descriptors also work on kernels predating openat2.
	parts := strings.Split(strings.TrimPrefix(path, "/"), "/")
	fd, err := unix.Open("/", unix.O_RDONLY|unix.O_DIRECTORY|unix.O_CLOEXEC, 0)
	if err != nil {
		return nil, err
	}
	for i, part := range parts {
		if part == "" {
			part = "."
		}
		nextFlags := unix.O_RDONLY | unix.O_DIRECTORY | unix.O_CLOEXEC | unix.O_NOFOLLOW
		nextMode := uint32(0)
		if i == len(parts)-1 {
			nextFlags = flags | unix.O_CLOEXEC | unix.O_NOFOLLOW
			nextMode = mode
		}
		next, openErr := unix.Openat(fd, part, nextFlags, nextMode)
		unix.Close(fd)
		if openErr != nil {
			return nil, openErr
		}
		fd = next
	}
	return os.NewFile(uintptr(fd), path), nil
}

func protectedFile(path string, size int64) ([]byte, error) {
	if err := protectedDirectory(filepath.Dir(path)); err != nil {
		return nil, err
	}
	f, err := openProtectedFile(path, size)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return readBoundedFile(f, size)
}

func regularFile(path string, size int64) ([]byte, error) {
	f, err := openRegularFile(path, size)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return readBoundedFile(f, size)
}

func readBoundedFile(f *os.File, size int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(f, size+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > size {
		return nil, fmt.Errorf("file exceeds size limit: %s", f.Name())
	}
	return data, nil
}

func openRegularFile(path string, size int64) (*os.File, error) {
	f, err := openNoSymlinks(path, unix.O_RDONLY|unix.O_NONBLOCK, 0)
	if err != nil {
		return nil, err
	}
	st, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, err
	}
	if !st.Mode().IsRegular() || st.Size() > size || st.Sys().(*syscall.Stat_t).Nlink != 1 {
		f.Close()
		return nil, fmt.Errorf("unsafe or oversized file: %s", path)
	}
	return f, nil
}

func openProtectedFile(path string, size int64) (*os.File, error) {
	f, err := openRegularFile(path, size)
	if err != nil {
		return nil, err
	}
	st, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, err
	}
	if st.Sys().(*syscall.Stat_t).Uid != 0 || st.Mode().Perm()&0022 != 0 {
		f.Close()
		return nil, fmt.Errorf("unprotected file: %s", path)
	}
	if err := validateProtectedACL(f); err != nil {
		f.Close()
		return nil, err
	}
	return f, nil
}

func decodeUnix(value interface{}, target interface{}) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	if bytes.Equal(data, []byte("null")) {
		return fmt.Errorf("missing request")
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	return dec.Decode(target)
}

func writeProtectedFile(path string, data []byte, mode os.FileMode, gid int) error {
	temp, err := os.CreateTemp(filepath.Dir(path), ".install-*")
	if err != nil {
		return err
	}
	defer os.Remove(temp.Name())
	defer temp.Close()
	if err = temp.Chown(0, gid); err != nil {
		return err
	}
	if err = temp.Chmod(mode); err != nil {
		return err
	}
	if _, err = temp.Write(data); err != nil {
		return err
	}
	if err = temp.Sync(); err != nil {
		return err
	}
	return os.Rename(temp.Name(), path)
}

func validateUnixPolicy(p unixPolicy) error {
	if p.Version != Helper_Version || p.UID <= 0 || p.GID <= 0 || !filepath.IsAbs(p.DataRoot) || filepath.Clean(p.DataRoot) != p.DataRoot || p.DataRoot == "/" {
		return fmt.Errorf("invalid helper policy")
	}
	account, err := user.LookupId(strconv.Itoa(p.UID))
	if err != nil || account.Gid != strconv.Itoa(p.GID) {
		return fmt.Errorf("invalid target account")
	}
	return nil
}
func policyInstallInputs(args []string) (unixPolicy, error) {
	empty := unixPolicy{}
	if os.Geteuid() != 0 || len(args) != 3 {
		return empty, fmt.Errorf("policy installation requires root, uid:gid, data root")
	}
	parts := strings.Split(args[1], ":")
	if len(parts) != 2 {
		return empty, fmt.Errorf("invalid account")
	}
	uid, e1 := strconv.Atoi(parts[0])
	gid, e2 := strconv.Atoi(parts[1])
	if e1 != nil || e2 != nil || uid <= 0 || gid <= 0 {
		return empty, fmt.Errorf("root target is forbidden")
	}
	dataRoot, err := filepath.EvalSymlinks(args[2])
	if err != nil {
		return empty, err
	}
	p := unixPolicy{Version: Helper_Version, UID: uid, GID: gid, DataRoot: dataRoot}
	if err := validateUnixPolicy(p); err != nil {
		return empty, err
	}
	f, err := openNoSymlinks(p.DataRoot, unix.O_RDONLY|unix.O_DIRECTORY, 0)
	if err != nil {
		return empty, err
	}
	f.Close()
	return p, nil
}
