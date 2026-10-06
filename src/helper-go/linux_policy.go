//go:build linux

package main

import (
	"bytes"
	"crypto/rand"
	"crypto/x509"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"os"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"

	"golang.org/x/sys/unix"
)

const linuxPolicyPath = "/etc/flyenv-helper/policy.json"
const linuxKeyPath = "/etc/flyenv-helper/client.key"
const linuxSocketPath = "/run/flyenv-helper/helper.sock"
const linuxCAPath = "/etc/flyenv-helper/approved-ca.crt"
const hostsLimit = 1024 * 1024

type linuxPolicy struct {
	Version       int    `json:"version"`
	UID           int    `json:"uid"`
	GID           int    `json:"gid"`
	DataRoot      string `json:"dataRoot"`
	CAFingerprint string `json:"caFingerprint"`
}

var installedLinuxPolicy linuxPolicy

// POSIX ACL: root read/write, exactly the installed UID read, no group/other access.
func linuxKeyACL(uid int) []byte {
	acl := make([]byte, 4+5*8)
	binary.LittleEndian.PutUint32(acl, 2)
	entries := [][3]uint32{{1, 6, 0xffffffff}, {2, 4, uint32(uid)}, {4, 0, 0xffffffff}, {16, 4, 0xffffffff}, {32, 0, 0xffffffff}}
	for i, entry := range entries {
		offset := 4 + i*8
		binary.LittleEndian.PutUint16(acl[offset:], uint16(entry[0]))
		binary.LittleEndian.PutUint16(acl[offset+2:], uint16(entry[1]))
		binary.LittleEndian.PutUint32(acl[offset+4:], entry[2])
	}
	return acl
}

func protectedDirectory(path string) error {
	for dir := path; ; dir = filepath.Dir(dir) {
		f, err := openNoSymlinks(dir, unix.O_RDONLY|unix.O_DIRECTORY, 0)
		if err != nil {
			return err
		}
		st, err := f.Stat()
		f.Close()
		if err != nil {
			return err
		}
		if st.Sys().(*syscall.Stat_t).Uid != 0 || st.Mode().Perm()&0022 != 0 {
			return fmt.Errorf("unprotected directory: %s", dir)
		}
		if dir == "/" {
			return nil
		}
	}
}

func prepareLinuxSocket() error {
	if err := os.MkdirAll(filepath.Dir(linuxSocketPath), 0755); err != nil {
		return err
	}
	return protectedDirectory(filepath.Dir(linuxSocketPath))
}

func validateLinuxUID(uid int) error {
	if installedLinuxPolicy.UID <= 0 || uid != installedLinuxPolicy.UID {
		return fmt.Errorf("unauthorized Linux peer")
	}
	return nil
}

// Walk directory descriptors rather than following path components as root.
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
	f, err := openProtectedLinuxFile(path, size)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return io.ReadAll(io.LimitReader(f, size+1))
}

func openProtectedLinuxFile(path string, size int64) (*os.File, error) {
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
	if !st.Mode().IsRegular() || st.Sys().(*syscall.Stat_t).Uid != 0 || st.Mode().Perm()&0022 != 0 || st.Size() > size {
		f.Close()
		return nil, fmt.Errorf("unprotected file: %s", path)
	}
	return f, nil
}

func decodeLinux(value interface{}, target interface{}) error {
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

func initializeLinux() error {
	if os.Geteuid() != 0 {
		return fmt.Errorf("Linux helper must run as root")
	}
	data, err := protectedFile(linuxPolicyPath, 65536)
	if err != nil {
		return fmt.Errorf("Linux policy: %w", err)
	}
	if err = decodeLinux(json.RawMessage(data), &installedLinuxPolicy); err != nil {
		return err
	}
	p := installedLinuxPolicy
	if p.Version != Helper_Version || p.UID <= 0 || p.GID <= 0 || !filepath.IsAbs(p.DataRoot) || filepath.Clean(p.DataRoot) != p.DataRoot || p.DataRoot == "/" {
		return fmt.Errorf("invalid Linux policy")
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

func loadLinuxKey() error {
	key, err := protectedFile(linuxKeyPath, 32)
	if err != nil {
		return err
	}
	if len(key) != 32 {
		return fmt.Errorf("invalid Linux key size")
	}
	helperKey = key
	f, err := openNoSymlinks(linuxKeyPath, unix.O_RDONLY, 0)
	if err != nil {
		return err
	}
	defer f.Close()
	acl := make([]byte, 256)
	n, err := unix.Fgetxattr(int(f.Fd()), "system.posix_acl_access", acl)
	if err != nil || !bytes.Equal(acl[:n], linuxKeyACL(installedLinuxPolicy.UID)) {
		return fmt.Errorf("Linux key ACL does not match the authorized UID")
	}
	return nil
}

func linuxSocketReady() error {
	if _, err := protectedFile(linuxPolicyPath, 65536); err != nil {
		return err
	}
	if err := os.Chown(linuxSocketPath, installedLinuxPolicy.UID, installedLinuxPolicy.GID); err != nil {
		return err
	}
	return os.Chmod(linuxSocketPath, 0600)
}

func installLinuxPolicy(args []string) error {
	if os.Geteuid() != 0 || len(args) != 5 {
		return fmt.Errorf("policy installation requires root, uid:gid, data root and CA path")
	}
	parts := strings.Split(args[1], ":")
	if len(parts) != 2 {
		return fmt.Errorf("invalid account")
	}
	uid, e1 := strconv.Atoi(parts[0])
	gid, e2 := strconv.Atoi(parts[1])
	if e1 != nil || e2 != nil || uid <= 0 || gid <= 0 {
		return fmt.Errorf("root target is forbidden")
	}
	account, err := user.LookupId(parts[0])
	if err != nil || account.Gid != parts[1] {
		return fmt.Errorf("invalid target account")
	}
	root := filepath.Clean(args[2])
	f, err := openNoSymlinks(root, unix.O_RDONLY|unix.O_DIRECTORY, 0)
	if err != nil {
		return err
	}
	st, err := f.Stat()
	f.Close()
	if err != nil {
		return err
	}
	if root == "/" || int(st.Sys().(*syscall.Stat_t).Uid) != uid {
		return fmt.Errorf("data root must belong to the desktop account")
	}
	if err = os.MkdirAll("/etc/flyenv-helper", 0755); err != nil {
		return err
	}
	if err = protectedDirectory("/etc/flyenv-helper"); err != nil {
		return err
	}
	p := linuxPolicy{Version: Helper_Version, UID: uid, GID: gid, DataRoot: root}
	if args[3] != "" {
		cert, err := openNoSymlinks(args[3], unix.O_RDONLY|unix.O_NONBLOCK, 0)
		if err != nil {
			return err
		}
		cs, err := cert.Stat()
		if err != nil || !cs.Mode().IsRegular() || cs.Size() > 256*1024 {
			cert.Close()
			return fmt.Errorf("invalid CA file")
		}
		data, err := io.ReadAll(io.LimitReader(cert, 256*1024+1))
		cert.Close()
		if err != nil {
			return err
		}
		block, rest := pem.Decode(data)
		if block == nil || block.Type != "CERTIFICATE" || len(bytes.TrimSpace(rest)) != 0 {
			return fmt.Errorf("expected one public certificate")
		}
		parsed, err := x509.ParseCertificate(block.Bytes)
		if err != nil || !parsed.IsCA {
			return fmt.Errorf("expected CA certificate")
		}
		p.CAFingerprint = digest(string(parsed.Raw))
		if p.CAFingerprint != args[4] {
			return fmt.Errorf("CA changed since installation was prepared; prepare the command again")
		}
		if err = writeLinuxProtected(linuxCAPath, data, 0644, 0); err != nil {
			return err
		}
	}
	if args[3] == "" && args[4] != "" {
		return fmt.Errorf("missing approved CA")
	}
	key := make([]byte, 32)
	if _, err = rand.Read(key); err != nil {
		return err
	}
	if err = writeLinuxProtected(linuxKeyPath, key, 0600, 0); err != nil {
		return err
	}
	f, err = openNoSymlinks(linuxKeyPath, unix.O_RDONLY, 0)
	if err != nil {
		return err
	}
	err = unix.Fsetxattr(int(f.Fd()), "system.posix_acl_access", linuxKeyACL(uid), 0)
	f.Close()
	if err != nil {
		return fmt.Errorf("cannot set the helper key's UID read ACL: %w", err)
	}
	data, _ := json.MarshalIndent(p, "", "  ")
	return writeLinuxProtected(linuxPolicyPath, data, 0644, 0)
}
func writeLinuxProtected(path string, data []byte, mode os.FileMode, gid int) error {
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

type linuxCAInstaller struct {
	mu        sync.Mutex
	installed string
}

var linuxApprovedCA linuxCAInstaller

func (i *linuxCAInstaller) install(source, dir, tool, fingerprint string) (bool, error) {
	i.mu.Lock()
	defer i.mu.Unlock()
	data, err := protectedFile(source, 256*1024)
	if err != nil {
		return false, err
	}
	block, _ := pem.Decode(data)
	if block == nil || block.Type != "CERTIFICATE" || digest(string(block.Bytes)) != fingerprint {
		return false, fmt.Errorf("approved CA changed")
	}
	if err = protectedDirectory(dir); err != nil {
		return false, err
	}
	destination := filepath.Join(dir, "flyenv-"+fingerprint+".crt")
	if i.installed == fingerprint {
		existing, err := protectedFile(destination, 256*1024)
		if err == nil && bytes.Equal(existing, data) {
			return true, nil
		}
	}
	if err = writeLinuxProtected(destination, data, 0644, 0); err != nil {
		return false, err
	}
	if err = runTrustedLinuxTool(tool); err != nil {
		return false, fmt.Errorf("approved CA copied but trust update failed: %w", err)
	}
	i.installed = fingerprint
	return true, nil
}
