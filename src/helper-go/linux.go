//go:build linux

package main

// All Linux requests stop here; the legacy root dispatcher is never used.
import (
	"fmt"
	"golang.org/x/sys/unix"
	"os"
	"path/filepath"
	"strings"
)

func dispatchLinux(info TaskItem, p linuxPolicy) (interface{}, error) {
	if info.Module == "helper" && len(info.Args) == 0 {
		switch info.Function {
		case "version":
			return Helper_Version, nil
		case "health":
			return helperHealthResponse(os.Getpid(), "", ""), nil
		}
	}
	if p.Version != Helper_Version || p.UID <= 0 {
		return nil, fmt.Errorf("Linux policy unavailable")
	}
	switch info.Module + "." + info.Function {
	case "ftp.start":
		if len(info.Args) != 1 {
			break
		}
		var req struct {
			Bin string `json:"bin"`
		}
		if err := decodeLinux(info.Args[0], &req); err != nil {
			return nil, err
		}
		return startLinuxFTP(req.Bin, p)
	case "ftp.stop":
		if len(info.Args) != 0 {
			break
		}
		return stopLinuxFTP(p)
	case "ftp.refreshUsers":
		if len(info.Args) != 0 {
			break
		}
		return refreshLinuxFTPUsers(p)
	case "host.readHosts":
		if len(info.Args) != 0 {
			break
		}
		return linuxHosts.read()
	case "host.replaceHostsContent":
		if len(info.Args) != 1 {
			break
		}
		var req struct {
			Content string `json:"content"`
			Digest  string `json:"digest"`
		}
		if err := decodeLinux(info.Args[0], &req); err != nil {
			return nil, err
		}
		return true, linuxHosts.replace(req.Content, req.Digest)
	case "host.syncManagedEntries", "host.clearManagedEntries":
		if len(info.Args) != 1 {
			break
		}
		var req struct {
			Entries []struct {
				IP     string `json:"ip"`
				Domain string `json:"domain"`
			} `json:"entries"`
			Digest string `json:"digest"`
		}
		if err := decodeLinux(info.Args[0], &req); err != nil {
			return nil, err
		}
		entries := ""
		if info.Function == "clearManagedEntries" && len(req.Entries) != 0 {
			return nil, fmt.Errorf("clear does not accept entries")
		}
		for _, entry := range req.Entries {
			// Only hosts syntax separators are rejected, never an IP/domain allowlist.
			if entry.IP == "" || entry.Domain == "" || strings.ContainsAny(entry.IP+entry.Domain, "\x00\r\n\t #") {
				return nil, fmt.Errorf("invalid hosts entry separators")
			}
			entries += entry.IP + "     " + entry.Domain + "\n"
		}
		if len(req.Digest) != 64 {
			return nil, fmt.Errorf("hosts digest is required")
		}
		return linuxHosts.syncManaged(entries, req.Digest)
	case "service.launchLowPort":
		if len(info.Args) != 1 {
			break
		}
		var req linuxLaunch
		if err := decodeLinux(info.Args[0], &req); err != nil {
			return nil, err
		}
		return launchLinuxService(req, p)
	case "tools.repairManagedPidDirectory":
		if len(info.Args) != 0 {
			break
		}
		f, err := openNoSymlinks(filepath.Join(p.DataRoot, "server", "pid"), unix.O_RDONLY|unix.O_DIRECTORY, 0)
		if err != nil {
			return nil, err
		}
		defer f.Close()
		if err = f.Chown(p.UID, p.GID); err != nil {
			return nil, err
		}
		return true, f.Chmod(0755)
	case "host.installApprovedCA":
		if len(info.Args) != 1 || info.Args[0] != p.CAFingerprint || p.CAFingerprint == "" {
			return nil, fmt.Errorf("CA is not approved; reinstall helper to approve this public certificate")
		}
		dir, tool := "/usr/local/share/ca-certificates", "/usr/sbin/update-ca-certificates"
		if _, err := os.Stat(tool); os.IsNotExist(err) {
			dir, tool = "/etc/pki/ca-trust/source/anchors", "/usr/bin/update-ca-trust"
		}
		return linuxApprovedCA.install(linuxCAPath, dir, tool, p.CAFingerprint)
	case "host.dnsRefresh":
		if len(info.Args) != 0 {
			break
		}
		return true, runTrustedLinuxTool("/usr/bin/resolvectl", "flush-caches")
	}
	return nil, fmt.Errorf("Linux helper denies %s.%s", info.Module, info.Function)
}
