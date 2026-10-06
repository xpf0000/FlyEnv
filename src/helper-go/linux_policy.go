//go:build linux

package main

import (
	"bytes"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"golang.org/x/sys/unix"
)

const linuxPolicyPath = "/etc/flyenv-helper/policy.json"
const linuxKeyPath = "/etc/flyenv-helper/client.key"
const linuxSocketPath = "/run/flyenv-helper/helper.sock"
const linuxCAPath = "/etc/flyenv-helper/approved-ca.crt"

type linuxPolicy = unixPolicy

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

func initializeLinux() error {
	if os.Geteuid() != 0 {
		return fmt.Errorf("Linux helper must run as root")
	}
	data, err := protectedFile(linuxPolicyPath, 65536)
	if err != nil {
		return fmt.Errorf("Linux policy: %w", err)
	}
	if err = decodeUnix(json.RawMessage(data), &installedLinuxPolicy); err != nil {
		return err
	}
	p := installedLinuxPolicy
	if err := validateUnixPolicy(p); err != nil {
		return err
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
	p, certData, err := policyInstallInputs(args)
	if err != nil {
		return err
	}
	if err = os.MkdirAll("/etc/flyenv-helper", 0755); err != nil {
		return err
	}
	if err = protectedDirectory("/etc/flyenv-helper"); err != nil {
		return err
	}
	if len(certData) > 0 {
		if err = writeProtectedFile(linuxCAPath, certData, 0644, 0); err != nil {
			return err
		}
	}

	key := make([]byte, 32)
	if _, err = rand.Read(key); err != nil {
		return err
	}
	if err = writeProtectedFile(linuxKeyPath, key, 0600, 0); err != nil {
		return err
	}
	f, err := openNoSymlinks(linuxKeyPath, unix.O_RDONLY, 0)
	if err != nil {
		return err
	}
	err = unix.Fsetxattr(int(f.Fd()), "system.posix_acl_access", linuxKeyACL(p.UID), 0)
	f.Close()
	if err != nil {
		return fmt.Errorf("cannot set the helper key's UID read ACL: %w", err)
	}
	data, _ := json.MarshalIndent(p, "", "  ")
	return writeProtectedFile(linuxPolicyPath, data, 0644, 0)
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
	if err = writeProtectedFile(destination, data, 0644, 0); err != nil {
		return false, err
	}
	if err = runTrustedTool(tool); err != nil {
		return false, fmt.Errorf("approved CA copied but trust update failed: %w", err)
	}
	i.installed = fingerprint
	return true, nil
}
