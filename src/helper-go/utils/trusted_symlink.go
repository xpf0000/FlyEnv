package utils

import "os"

type immutableHomeAliasMetadata struct {
	component        string
	resolvedTarget   string
	aliasMode        os.FileMode
	aliasParentMode  os.FileMode
	targetMode       os.FileMode
	targetParentMode os.FileMode
}

// Directory ownership, modes and ACLs are not alias acceptance criteria.
func isTrustedImmutableHomeAlias(metadata immutableHomeAliasMetadata) bool {
	return metadata.component == "/home" &&
		metadata.resolvedTarget == "/var/home" &&
		metadata.aliasMode&os.ModeSymlink != 0 &&
		metadata.aliasParentMode.IsDir() &&
		metadata.targetMode.IsDir() &&
		metadata.targetParentMode.IsDir()
}
