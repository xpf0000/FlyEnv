//go:build linux

package utils

import (
	"os"
	"path/filepath"
	"syscall"
)

func unixFileUID(info os.FileInfo) (uint32, bool) {
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return 0, false
	}
	return stat.Uid, true
}

func isTrustedSystemSymlinkComponent(component string, aliasInfo os.FileInfo) bool {
	component = filepath.Clean(component)
	if component != "/home" || aliasInfo.Mode()&os.ModeSymlink == 0 {
		return false
	}

	resolvedTarget, err := filepath.EvalSymlinks(component)
	if err != nil || filepath.Clean(resolvedTarget) != "/var/home" {
		return false
	}

	aliasParentInfo, err := os.Lstat(filepath.Dir(component))
	if err != nil {
		return false
	}
	targetInfo, err := os.Lstat(resolvedTarget)
	if err != nil || targetInfo.Mode()&os.ModeSymlink != 0 {
		return false
	}
	targetParentInfo, err := os.Lstat(filepath.Dir(resolvedTarget))
	if err != nil {
		return false
	}

	aliasUID, aliasOK := unixFileUID(aliasInfo)
	aliasParentUID, aliasParentOK := unixFileUID(aliasParentInfo)
	targetUID, targetOK := unixFileUID(targetInfo)
	targetParentUID, targetParentOK := unixFileUID(targetParentInfo)
	if !aliasOK || !aliasParentOK || !targetOK || !targetParentOK {
		return false
	}

	return isTrustedImmutableHomeAlias(immutableHomeAliasMetadata{
		component:        component,
		resolvedTarget:   filepath.Clean(resolvedTarget),
		aliasMode:        aliasInfo.Mode(),
		aliasUID:         aliasUID,
		aliasParentMode:  aliasParentInfo.Mode(),
		aliasParentUID:   aliasParentUID,
		targetMode:       targetInfo.Mode(),
		targetUID:        targetUID,
		targetParentMode: targetParentInfo.Mode(),
		targetParentUID:  targetParentUID,
	})
}
