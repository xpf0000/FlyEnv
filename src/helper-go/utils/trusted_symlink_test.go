package utils

import (
	"os"
	"testing"
)

func secureImmutableHomeMetadata() immutableHomeAliasMetadata {
	return immutableHomeAliasMetadata{
		component:        "/home",
		resolvedTarget:   "/var/home",
		aliasMode:        os.ModeSymlink | 0777,
		aliasUID:         0,
		aliasParentMode:  os.ModeDir | 0755,
		aliasParentUID:   0,
		targetMode:       os.ModeDir | 0755,
		targetUID:        0,
		targetParentMode: os.ModeDir | 0755,
		targetParentUID:  0,
	}
}

func TestTrustedImmutableHomeAliasPolicy(t *testing.T) {
	valid := secureImmutableHomeMetadata()
	if !isTrustedImmutableHomeAlias(valid) {
		t.Fatal("secure /home -> /var/home alias should be trusted")
	}

	tests := []struct {
		name   string
		mutate func(*immutableHomeAliasMetadata)
	}{
		{name: "missing metadata", mutate: func(m *immutableHomeAliasMetadata) { *m = immutableHomeAliasMetadata{} }},
		{name: "wrong component", mutate: func(m *immutableHomeAliasMetadata) { m.component = "/opt" }},
		{name: "wrong target", mutate: func(m *immutableHomeAliasMetadata) { m.resolvedTarget = "/srv/home" }},
		{name: "alias is not symlink", mutate: func(m *immutableHomeAliasMetadata) { m.aliasMode = os.ModeDir | 0755 }},
		{name: "alias is not root owned", mutate: func(m *immutableHomeAliasMetadata) { m.aliasUID = 1000 }},
		{name: "alias parent is not root owned", mutate: func(m *immutableHomeAliasMetadata) { m.aliasParentUID = 1000 }},
		{name: "alias parent is not directory", mutate: func(m *immutableHomeAliasMetadata) { m.aliasParentMode = 0755 }},
		{name: "alias parent is writable", mutate: func(m *immutableHomeAliasMetadata) { m.aliasParentMode = os.ModeDir | 0775 }},
		{name: "target is symlink", mutate: func(m *immutableHomeAliasMetadata) { m.targetMode = os.ModeSymlink | 0777 }},
		{name: "target is not directory", mutate: func(m *immutableHomeAliasMetadata) { m.targetMode = 0644 }},
		{name: "target is not root owned", mutate: func(m *immutableHomeAliasMetadata) { m.targetUID = 1000 }},
		{name: "target is writable", mutate: func(m *immutableHomeAliasMetadata) { m.targetMode = os.ModeDir | 0775 }},
		{name: "target parent is not root owned", mutate: func(m *immutableHomeAliasMetadata) { m.targetParentUID = 1000 }},
		{name: "target parent is not directory", mutate: func(m *immutableHomeAliasMetadata) { m.targetParentMode = 0755 }},
		{name: "target parent is writable", mutate: func(m *immutableHomeAliasMetadata) { m.targetParentMode = os.ModeDir | 0775 }},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			metadata := valid
			test.mutate(&metadata)
			if isTrustedImmutableHomeAlias(metadata) {
				t.Fatalf("insecure metadata should be rejected: %+v", metadata)
			}
		})
	}
}
