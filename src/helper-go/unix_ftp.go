//go:build linux || darwin

package main

import (
	"fmt"
	"net"
	"path/filepath"
	"strconv"
	"strings"
)

type unixFTPStart struct {
	Bin    string `json:"bin"`
	Config string `json:"config"`
	Users  string `json:"users"`
}

type unixFTPUsers struct {
	Users string `json:"users"`
}

func ftpConfig(source, dir string) (string, error) {
	if len(source) > hostsLimit || strings.TrimSpace(source) == "" {
		return "", fmt.Errorf("expected bounded FTP configuration")
	}
	booleans := strings.Fields("ChrootEveryone BrokenClientsCompatibility VerboseLog DisplayDotFiles AnonymousOnly NoAnonymous DontResolve AnonymousCanCreateDirs AntiWarez AllowUserFXP AllowAnonymousFXP ProhibitDotFilesWrite ProhibitDotFilesRead AutoRename AnonymousCantUpload CustomerProof")
	counts := strings.Fields("MaxClientsNumber MaxClientsPerIP MaxIdleTime MinUID MaxDiskUsage")
	allowedBool, allowedCount := map[string]bool{}, map[string]bool{}
	for _, key := range booleans {
		allowedBool[key] = true
	}
	for _, key := range counts {
		allowedCount[key] = true
	}
	seen := map[string]bool{}
	lines := []string{}
	for _, line := range strings.Split(source, "\n") {
		line = strings.TrimSpace(strings.SplitN(line, "#", 2)[0])
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 || strings.ContainsAny(line, "\x00\r") {
			return "", fmt.Errorf("invalid FTP configuration line")
		}
		key, value := fields[0], strings.Join(fields[1:], " ")
		if seen[key] {
			return "", fmt.Errorf("duplicate FTP option: %s", key)
		}
		seen[key] = true
		valid := false
		switch {
		case allowedBool[key], key == "Daemonize":
			valid = value == "yes" || value == "no"
		case allowedCount[key]:
			n, err := strconv.Atoi(value)
			valid = err == nil && n > 0 && n <= 65535
		case key == "UnixAuthentication", key == "CreateHomeDir":
			valid = value == "no"
		case key == "PureDB", key == "PIDFile":
			// User-supplied paths are never read or written by root; fixed targets below.
			valid = true
		case key == "Bind":
			parts := strings.Split(value, ",")
			if len(parts) == 2 {
				port, err := strconv.Atoi(parts[1])
				valid = net.ParseIP(parts[0]) != nil && err == nil && port > 0 && port <= 65535
			}
		case key == "PassivePortRange", key == "LimitRecursion":
			if len(fields) == 3 {
				a, e1 := strconv.Atoi(fields[1])
				b, e2 := strconv.Atoi(fields[2])
				valid = e1 == nil && e2 == nil && a > 0 && b > 0 && a <= 1000000 && b <= 1000000
				if key == "PassivePortRange" {
					valid = valid && a <= b && b <= 65535
				}
			}
		case key == "Maxload":
			n, err := strconv.ParseFloat(value, 64)
			valid = err == nil && n > 0 && n <= 1000
		case key == "Umask":
			parts := strings.Split(value, ":")
			if len(parts) == 2 {
				a, e1 := strconv.ParseUint(parts[0], 8, 16)
				b, e2 := strconv.ParseUint(parts[1], 8, 16)
				valid = e1 == nil && e2 == nil && a <= 0777 && b <= 0777
			}
		case key == "SyslogFacility":
			valid = value == "ftp"
		}
		if !valid {
			return "", fmt.Errorf("unsupported or invalid root FTP option: %s", key)
		}
		if key != "Daemonize" && key != "PureDB" && key != "PIDFile" && key != "UnixAuthentication" {
			lines = append(lines, key+" "+value)
		}
	}
	lines = append(lines, "Daemonize no", "UnixAuthentication no", "PureDB "+filepath.Join(dir, "users.pdb"), "PIDFile "+filepath.Join(dir, "pure-ftpd.pid"))
	return strings.Join(lines, "\n") + "\n", nil
}
func ftpUsers(source string, p unixPolicy) (string, error) {
	if p.UID <= 0 || p.GID <= 0 || len(source) > hostsLimit || strings.ContainsAny(source, "\x00\r") {
		return "", fmt.Errorf("invalid FTP users")
	}
	seen, lines := map[string]bool{}, []string{}
	for _, line := range strings.Split(source, "\n") {
		if line == "" {
			continue
		}
		fields := strings.Split(line, ":")
		if len(fields) < 6 || len(fields) > 32 || fields[0] == "" || len(fields[0]) > 128 || fields[1] == "" || len(fields[1]) > 1024 || !filepath.IsAbs(fields[5]) || seen[fields[0]] {
			return "", fmt.Errorf("invalid or duplicate FTP account")
		}
		seen[fields[0]] = true
		fields[2], fields[3] = strconv.Itoa(p.UID), strconv.Itoa(p.GID)
		lines = append(lines, strings.Join(fields, ":"))
	}
	if len(lines) == 0 {
		return "", nil
	}
	return strings.Join(lines, "\n") + "\n", nil
}
