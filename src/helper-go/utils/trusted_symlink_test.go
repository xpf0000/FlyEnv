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
		aliasParentMode:  os.ModeDir | 0755,
		targetMode:       os.ModeDir | 0755,
		targetParentMode: os.ModeDir | 0755,
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
		allow  bool
	}{
		{name: "missing metadata", mutate: func(m *immutableHomeAliasMetadata) { *m = immutableHomeAliasMetadata{} }},
		{name: "wrong component", mutate: func(m *immutableHomeAliasMetadata) { m.component = "/opt" }},
		{name: "wrong target", mutate: func(m *immutableHomeAliasMetadata) { m.resolvedTarget = "/srv/home" }},
		{name: "alias is not symlink", mutate: func(m *immutableHomeAliasMetadata) { m.aliasMode = os.ModeDir | 0755 }},
		{name: "alias parent is not directory", mutate: func(m *immutableHomeAliasMetadata) { m.aliasParentMode = 0755 }},
		{name: "alias parent is group writable", mutate: func(m *immutableHomeAliasMetadata) { m.aliasParentMode = os.ModeDir | 0775 }, allow: true},
		{name: "alias parent is world writable", mutate: func(m *immutableHomeAliasMetadata) { m.aliasParentMode = os.ModeDir | 0757 }, allow: true},
		{name: "target is symlink", mutate: func(m *immutableHomeAliasMetadata) { m.targetMode = os.ModeSymlink | 0777 }},
		{name: "target is not directory", mutate: func(m *immutableHomeAliasMetadata) { m.targetMode = 0644 }},
		{name: "target is group writable", mutate: func(m *immutableHomeAliasMetadata) { m.targetMode = os.ModeDir | 0775 }, allow: true},
		{name: "target is world writable", mutate: func(m *immutableHomeAliasMetadata) { m.targetMode = os.ModeDir | 0757 }, allow: true},
		{name: "target parent is not directory", mutate: func(m *immutableHomeAliasMetadata) { m.targetParentMode = 0755 }},
		{name: "target parent is group writable", mutate: func(m *immutableHomeAliasMetadata) { m.targetParentMode = os.ModeDir | 0775 }, allow: true},
		{name: "target parent is world writable", mutate: func(m *immutableHomeAliasMetadata) { m.targetParentMode = os.ModeDir | 0757 }, allow: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			metadata := valid
			test.mutate(&metadata)
			if actual := isTrustedImmutableHomeAlias(metadata); actual != test.allow {
				t.Fatalf("alias acceptance = %v, expected %v for %+v", actual, test.allow, metadata)
			}
		})
	}
}
