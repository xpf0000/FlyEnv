//go:build darwin

package main

import (
	"fmt"
	"golang.org/x/sys/unix"
	"os"
	"path/filepath"
)

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
	case "host.sslFindCertificate", "host.sslAddTrustedCert":
		return dispatchUnixCA(info, p, darwinPolicyDir)
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
			var req unixFTPStart
			if err := decodeUnix(info.Args[0], &req); err != nil {
				return nil, err
			}
			return startDarwinFTP(req, p)
		}
	case "ftp.stop":
		if len(info.Args) == 0 {
			return stopDarwinFTP(p)
		}
	case "ftp.refreshUsers":
		if len(info.Args) == 1 {
			var req unixFTPUsers
			if err := decodeUnix(info.Args[0], &req); err != nil {
				return nil, err
			}
			return refreshDarwinFTPUsers(p, req.Users)
		}
	}
	return nil, fmt.Errorf("macOS helper denies %s.%s", info.Module, info.Function)
}
func refreshDarwinDNS() error {
	// Both are fixed supplementary resolver actions; one failure cannot suppress the other.
	first := runSystemTool("/usr/bin/dscacheutil", "-flushcache")
	second := runSystemTool("/usr/bin/killall", "-HUP", "mDNSResponder")
	if first != nil || second != nil {
		return fmt.Errorf("DNS refresh failed: cache=%v responder=%v", first, second)
	}
	return nil
}
