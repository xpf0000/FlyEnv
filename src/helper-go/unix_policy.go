//go:build linux || darwin

package main

import (
	"bytes"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
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
	Version       int    `json:"version"`
	UID           int    `json:"uid"`
	GID           int    `json:"gid"`
	DataRoot      string `json:"dataRoot"`
	CAFingerprint string `json:"caFingerprint"`
}

func protectedDirectory(path string) error {
	for dir := path; ; dir = filepath.Dir(dir) {
		f, err := openNoSymlinks(dir, unix.O_RDONLY|unix.O_DIRECTORY, 0)
		if err != nil {
			return err
		}
		st, err := f.Stat()
		if err == nil {
			err = validateProtectedACL(f)
		}
		f.Close()
		if err != nil {
			return err
		}
		if !protectedDirectoryMode(dir, st) {
			return fmt.Errorf("unprotected directory: %s", dir)
		}
		if dir == "/" {
			return nil
		}
	}
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
	f, err := openProtectedFile(path, size)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, size+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > size {
		return nil, fmt.Errorf("protected file exceeds size limit: %s", path)
	}
	return data, nil
}

func openProtectedFile(path string, size int64) (*os.File, error) {
	if err := protectedDirectory(filepath.Dir(path)); err != nil {
		return nil, err
	}
	f, err := openNoSymlinks(path, unix.O_RDONLY, 0)
	if err != nil {
		return nil, err
	}
	st, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, err
	}
	if !st.Mode().IsRegular() || st.Sys().(*syscall.Stat_t).Uid != 0 || st.Mode().Perm()&0022 != 0 || st.Size() > size || st.Sys().(*syscall.Stat_t).Nlink != 1 {
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
	if p.CAFingerprint != "" {
		raw, err := hex.DecodeString(p.CAFingerprint)
		if err != nil || len(raw) != 32 || p.CAFingerprint != strings.ToLower(p.CAFingerprint) {
			return fmt.Errorf("invalid approved CA fingerprint")
		}
	}
	account, err := user.LookupId(strconv.Itoa(p.UID))
	if err != nil || account.Gid != strconv.Itoa(p.GID) {
		return fmt.Errorf("invalid target account")
	}
	return nil
}
func policyInstallInputs(args []string) (unixPolicy, []byte, error) {
	empty := unixPolicy{}
	if os.Geteuid() != 0 || len(args) != 5 {
		return empty, nil, fmt.Errorf("policy installation requires root, uid:gid, data root and CA path")
	}
	parts := strings.Split(args[1], ":")
	if len(parts) != 2 {
		return empty, nil, fmt.Errorf("invalid account")
	}
	uid, e1 := strconv.Atoi(parts[0])
	gid, e2 := strconv.Atoi(parts[1])
	if e1 != nil || e2 != nil || uid <= 0 || gid <= 0 {
		return empty, nil, fmt.Errorf("root target is forbidden")
	}
	p := unixPolicy{Version: Helper_Version, UID: uid, GID: gid, DataRoot: args[2]}
	if err := validateUnixPolicy(p); err != nil {
		return empty, nil, err
	}
	f, err := openNoSymlinks(p.DataRoot, unix.O_RDONLY|unix.O_DIRECTORY, 0)
	if err != nil {
		return empty, nil, err
	}
	st, err := f.Stat()
	f.Close()
	if err != nil {
		return empty, nil, err
	}
	if int(st.Sys().(*syscall.Stat_t).Uid) != uid {
		return empty, nil, fmt.Errorf("data root must belong to the desktop account")
	}
	if args[3] == "" {
		if args[4] != "" {
			return empty, nil, fmt.Errorf("missing approved CA")
		}
		return p, nil, nil
	}
	cert, err := openNoSymlinks(args[3], unix.O_RDONLY|unix.O_NONBLOCK, 0)
	if err != nil {
		return empty, nil, err
	}
	defer cert.Close()
	cs, err := cert.Stat()
	if err != nil || !cs.Mode().IsRegular() || cs.Sys().(*syscall.Stat_t).Nlink != 1 || cs.Size() > 256*1024 {
		return empty, nil, fmt.Errorf("invalid CA file")
	}
	data, err := io.ReadAll(io.LimitReader(cert, 256*1024+1))
	if err != nil {
		return empty, nil, err
	}
	if len(data) > 256*1024 {
		return empty, nil, fmt.Errorf("CA file exceeds size limit")
	}
	p.CAFingerprint, err = publicCAFingerprint(data)
	if err != nil {
		return empty, nil, err
	}
	if p.CAFingerprint != args[4] {
		return empty, nil, fmt.Errorf("CA changed since installation was prepared; prepare the command again")
	}
	return p, data, nil
}

func publicCAFingerprint(data []byte) (string, error) {
	block, rest := pem.Decode(data)
	if block == nil || block.Type != "CERTIFICATE" || len(bytes.TrimSpace(rest)) != 0 {
		return "", fmt.Errorf("expected one public certificate")
	}
	parsed, err := x509.ParseCertificate(block.Bytes)
	if err != nil || !parsed.IsCA {
		return "", fmt.Errorf("expected CA certificate")
	}
	return digest(string(parsed.Raw)), nil
}
