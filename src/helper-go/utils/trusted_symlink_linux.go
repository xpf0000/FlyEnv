//go:build linux

package utils

import (
	"os"
	"path/filepath"
)

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

	return isTrustedImmutableHomeAlias(immutableHomeAliasMetadata{
		component:        component,
		resolvedTarget:   filepath.Clean(resolvedTarget),
		aliasMode:        aliasInfo.Mode(),
		aliasParentMode:  aliasParentInfo.Mode(),
		targetMode:       targetInfo.Mode(),
		targetParentMode: targetParentInfo.Mode(),
	})
}
