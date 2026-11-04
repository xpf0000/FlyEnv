//go:build linux || darwin

package main

import (
	"fmt"
	"os"
	"os/user"
	"strconv"
	"syscall"
)

// Credentials come from the installed account, never RPC data or root's groups.
func unixUserCredential(p unixPolicy) (*syscall.Credential, error) {
	if p.UID <= 0 || p.GID <= 0 {
		return nil, fmt.Errorf("ordinary Unix account required")
	}
	account, err := user.LookupId(strconv.Itoa(p.UID))
	if err != nil {
		return nil, err
	}
	if account.Gid != strconv.Itoa(p.GID) {
		return nil, fmt.Errorf("Unix account primary group changed")
	}
	groups, err := account.GroupIds()
	if err != nil {
		return nil, fmt.Errorf("Unix account groups: %w", err)
	}
	credential := &syscall.Credential{Uid: uint32(p.UID), Gid: uint32(p.GID)}
	seen := map[uint32]bool{}
	for _, value := range append(groups, account.Gid) {
		gid, err := strconv.ParseUint(value, 10, 32)
		if err != nil {
			return nil, fmt.Errorf("invalid Unix account group: %w", err)
		}
		if !seen[uint32(gid)] {
			credential.Groups = append(credential.Groups, uint32(gid))
			seen[uint32(gid)] = true
		}
	}
	// Ordinary direct/test execution already has the account's groups and cannot
	// call setgroups. A root Helper always installs the full system group set.
	credential.NoSetGroups = os.Geteuid() != 0 && os.Geteuid() == p.UID && os.Getegid() == p.GID
	return credential, nil
}
