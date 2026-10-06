//go:build darwin

package main

import (
	"fmt"
	"golang.org/x/sys/unix"
	"os"
	"path/filepath"
	"sync"
	"time"
)

var darwinCAMutex sync.Mutex

func dispatchDarwin(info TaskItem, p darwinPolicy) (interface{}, error) {
	if p.Version != Helper_Version || p.UID <= 0 {
		return nil, fmt.Errorf("macOS policy unavailable")
	}
	switch info.Module + "." + info.Function {
	case "helper.version":
		if len(info.Args) == 0 {
			return Helper_Version, nil
		}
	case "helper.health":
		if len(info.Args) == 0 {
			if err := validateDarwinHealth(p); err != nil {
				return nil, err
			}
			health := helperHealthResponse(os.Getpid(), "", "")
			health["policyVersion"] = p.Version
			health["policyUID"] = p.UID
			health["healthy"] = true
			return health, nil
		}
	case "host.readHosts", "host.replaceHostsContent", "host.syncManagedEntries", "host.clearManagedEntries":
		return dispatchHosts(info, darwinHosts)
	case "host.installApprovedCA":
		if len(info.Args) != 1 || info.Args[0] != p.CAFingerprint || p.CAFingerprint == "" {
			return nil, fmt.Errorf("CA is not approved; reinstall helper to approve this public certificate")
		}
		return installDarwinCA(p.CAFingerprint)
	case "host.dnsRefresh":
		if len(info.Args) == 0 {
			return true, refreshDarwinDNS()
		}
	case "tools.repairManagedPidDirectory":
		if len(info.Args) == 0 {
			f, err := openNoSymlinks(filepath.Join(p.DataRoot, "server/pid"), unix.O_RDONLY|unix.O_DIRECTORY, 0)
			if err != nil {
				return nil, err
			}
			defer f.Close()
			if err = f.Chown(p.UID, p.GID); err != nil {
				return nil, err
			}
			return true, f.Chmod(0755)
		}
	case "ftp.start":
		if len(info.Args) == 1 {
			var req struct {
				Bin string `json:"bin"`
			}
			if err := decodeUnix(info.Args[0], &req); err != nil {
				return nil, err
			}
			return startDarwinFTP(req.Bin, p)
		}
	case "ftp.stop":
		if len(info.Args) == 0 {
			return stopDarwinFTP(p)
		}
	case "ftp.refreshUsers":
		if len(info.Args) == 0 {
			return refreshDarwinFTPUsers(p)
		}
	}
	return nil, fmt.Errorf("macOS helper denies %s.%s", info.Module, info.Function)
}
func refreshDarwinDNS() error {
	// Both are fixed supplementary resolver actions; one failure cannot suppress the other.
	first := runTrustedTool("/usr/bin/dscacheutil", "-flushcache")
	second := runTrustedTool("/usr/bin/killall", "-HUP", "mDNSResponder")
	if first != nil || second != nil {
		return fmt.Errorf("DNS refresh failed: cache=%v responder=%v", first, second)
	}
	return nil
}
func installDarwinCA(fingerprint string) (bool, error) {
	darwinCAMutex.Lock()
	defer darwinCAMutex.Unlock()
	if err := validateDarwinApprovedCA(fingerprint); err != nil {
		return false, err
	}
	const keychain = "/Library/Keychains/System.keychain"
	keychainFile, err := openProtectedFile(keychain, 128*1024*1024)
	if err != nil {
		return false, err
	}
	keychainFile.Close()
	if err = runTrustedTool("/usr/bin/security", "add-trusted-cert", "-d", "-r", "trustRoot", "-k", keychain, darwinCAPath); err != nil {
		return false, fmt.Errorf("approved CA trust installation failed: %w", err)
	}
	// Cert presence alone isn't trust: verify the basic trust policy using only
	// the local System keychain, without an explicit trust anchor or network fetch.
	trusted, err := openProtectedFile("/usr/bin/security", 128*1024*1024)
	if err != nil {
		return false, err
	}
	trusted.Close()
	_, err = runFixedTool("/usr/bin/security", 20*time.Second, "verify-cert", "-c", darwinCAPath, "-p", "basic", "-l", "-L", "-k", keychain)
	if err != nil {
		return false, fmt.Errorf("CA installed but system trust verification failed: %w", err)
	}
	return true, nil
}

func validateDarwinApprovedCA(fingerprint string) error {
	data, err := protectedFile(darwinCAPath, 256*1024)
	if err != nil {
		return err
	}
	actual, err := publicCAFingerprint(data)
	if err != nil {
		return err
	}
	if actual != fingerprint {
		return fmt.Errorf("approved CA changed")
	}
	return nil
}
