package utils

import "os"

type immutableHomeAliasMetadata struct {
	component        string
	resolvedTarget   string
	aliasMode        os.FileMode
	aliasUID         uint32
	aliasParentMode  os.FileMode
	aliasParentUID   uint32
	targetMode       os.FileMode
	targetUID        uint32
	targetParentMode os.FileMode
	targetParentUID  uint32
}

func isSecureRootDirectory(mode os.FileMode, uid uint32) bool {
	return uid == 0 && mode.IsDir() && mode.Perm()&0022 == 0
}

func isTrustedImmutableHomeAlias(metadata immutableHomeAliasMetadata) bool {
	return metadata.component == "/home" &&
		metadata.resolvedTarget == "/var/home" &&
		metadata.aliasMode&os.ModeSymlink != 0 &&
		metadata.aliasUID == 0 &&
		isSecureRootDirectory(metadata.aliasParentMode, metadata.aliasParentUID) &&
		isSecureRootDirectory(metadata.targetMode, metadata.targetUID) &&
		isSecureRootDirectory(metadata.targetParentMode, metadata.targetParentUID)
}
