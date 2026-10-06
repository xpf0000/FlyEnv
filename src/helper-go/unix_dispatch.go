//go:build linux || darwin

package main

import (
	"fmt"
	"strings"
)

func dispatchHosts(info TaskItem, store *hostsStore) (interface{}, error) {
	switch info.Module + "." + info.Function {
	case "host.readHosts":
		if len(info.Args) != 0 {
			break
		}
		return store.read()
	case "host.replaceHostsContent":
		if len(info.Args) != 1 {
			break
		}
		var req struct {
			Content string `json:"content"`
			Digest  string `json:"digest"`
		}
		if err := decodeUnix(info.Args[0], &req); err != nil {
			return nil, err
		}
		return store.replace(req.Content, req.Digest)
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
		if err := decodeUnix(info.Args[0], &req); err != nil {
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
		return store.syncManaged(entries, req.Digest)
	}
	return nil, fmt.Errorf("invalid hosts operation or argument count")
}
