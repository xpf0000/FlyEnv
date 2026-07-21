# Linux Immutable Home Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow FlyEnv's privileged helper to accept the verified Fedora Atomic `/home -> /var/home` system alias while continuing to reject user-controlled symlink components.

**Architecture:** Keep all Electron and FlyEnv paths unchanged. Refactor the helper's path walk to accept a trust predicate, add a platform-neutral immutable-home policy, collect real filesystem metadata only on Linux, and provide a deny-by-default implementation on other platforms. Bump the shared helper protocol version so installed helpers are replaced.

**Tech Stack:** Go 1.24.5 helper, TypeScript 5.8, Node/tsx assertion scripts.

---

## File Structure

- Create `src/helper-go/utils/trusted_symlink.go`: platform-neutral metadata model and fail-closed immutable-home trust policy.
- Create `src/helper-go/utils/trusted_symlink_linux.go`: Linux filesystem metadata collector for `/home` and `/var/home`.
- Create `src/helper-go/utils/trusted_symlink_other.go`: deny-by-default implementation for non-Linux builds.
- Create `src/helper-go/utils/trusted_symlink_test.go`: policy decision-table tests.
- Modify `src/helper-go/utils/whitelist.go`: route symlink decisions through a testable component walker.
- Modify `src/helper-go/utils/whitelist_test.go`: real filesystem tests for ordinary, trusted-prefix, and nested symlinks.
- Modify `scripts/helper-version-sync-test.ts`: require helper protocol version `17`.
- Modify `src/helper-go/main.go`: publish helper protocol version `17`.
- Modify `src/shared/AppHelperCheck.ts`: require helper protocol version `17` from Electron clients.

### Task 1: Establish the Baseline

**Files:**
- Read: `src/helper-go/go.mod`
- Read: `scripts/helper-go-test.ts`

- [ ] **Step 1: Confirm the worktree state and available toolchains**

Run:

```bash
git status --short
go version
node --version
yarn --version
```

Expected: only intentional plan/spec changes are present; Node and Yarn are available. The default Go binary may report 1.23.3.

- [ ] **Step 2: Run the current helper tests with the project Go toolchain**

Run:

```bash
GOTOOLCHAIN=auto yarn test:helper
```

Expected: helper contract, Go tests, and Go vet pass before implementation. If automatic toolchain acquisition is unavailable, stop and report the baseline limitation before changing production code.

### Task 2: Add Failing Symlink Policy and Walker Tests

**Files:**
- Create: `src/helper-go/utils/trusted_symlink_test.go`
- Modify: `src/helper-go/utils/whitelist_test.go`

- [ ] **Step 1: Write the failing immutable-home policy test**

Create `src/helper-go/utils/trusted_symlink_test.go` with a secure baseline metadata object and a decision table:

```go
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
```

- [ ] **Step 2: Add real filesystem path-walker tests**

Append tests to `src/helper-go/utils/whitelist_test.go` that resolve `t.TempDir()` first to avoid macOS's `/var -> /private/var` alias, create a modeled home alias, and call the future internal walker with a narrowly injected trust predicate:

```go
func TestPathHasSymlinkComponentRejectsOrdinarySymlink(t *testing.T) {
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	realDir := filepath.Join(root, "real")
	aliasDir := filepath.Join(root, "alias")
	if err := os.MkdirAll(realDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(realDir, aliasDir); err != nil {
		t.Fatal(err)
	}
	hasSymlink, err := PathHasSymlinkComponent(filepath.Join(aliasDir, "start-1.sh"))
	if err != nil {
		t.Fatal(err)
	}
	if !hasSymlink {
		t.Fatal("ordinary symlink component should be rejected")
	}
}

func TestPathSymlinkWalkerSkipsOnlyTrustedComponent(t *testing.T) {
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	realHome := filepath.Join(root, "var-home")
	aliasHome := filepath.Join(root, "home")
	serviceDir := filepath.Join(realHome, "user", "FlyEnv", "server")
	if err := os.MkdirAll(serviceDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(realHome, aliasHome); err != nil {
		t.Fatal(err)
	}
	scriptPath := filepath.Join(aliasHome, "user", "FlyEnv", "server", "start-1.sh")
	trustAlias := func(path string, _ os.FileInfo) bool { return pathEqual(path, aliasHome) }
	hasSymlink, err := pathHasSymlinkComponent(scriptPath, trustAlias)
	if err != nil {
		t.Fatal(err)
	}
	if hasSymlink {
		t.Fatal("modeled trusted home alias should be skipped")
	}

	outsideDir := filepath.Join(root, "outside")
	if err := os.MkdirAll(outsideDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outsideDir, filepath.Join(serviceDir, "nested")); err != nil {
		t.Fatal(err)
	}
	nestedScriptPath := filepath.Join(aliasHome, "user", "FlyEnv", "server", "nested", "start-2.sh")
	hasSymlink, err = pathHasSymlinkComponent(nestedScriptPath, trustAlias)
	if err != nil {
		t.Fatal(err)
	}
	if !hasSymlink {
		t.Fatal("nested user-controlled symlink should still be rejected")
	}
}
```

- [ ] **Step 3: Run the focused tests and verify the red state**

Run:

```bash
cd src/helper-go
GOTOOLCHAIN=auto go test ./utils -run 'TestTrustedImmutableHomeAliasPolicy|TestPathHasSymlinkComponentRejectsOrdinarySymlink|TestPathSymlinkWalkerSkipsOnlyTrustedComponent' -count=1
```

Expected: compilation fails because `immutableHomeAliasMetadata`, `isTrustedImmutableHomeAlias`, and `pathHasSymlinkComponent` do not exist. The failure must be limited to the missing planned API.

### Task 3: Implement the Fail-Closed Trusted Alias

**Files:**
- Create: `src/helper-go/utils/trusted_symlink.go`
- Create: `src/helper-go/utils/trusted_symlink_linux.go`
- Create: `src/helper-go/utils/trusted_symlink_other.go`
- Modify: `src/helper-go/utils/whitelist.go:432-454`

- [ ] **Step 1: Implement the platform-neutral policy**

Create `src/helper-go/utils/trusted_symlink.go`:

```go
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
```

- [ ] **Step 2: Implement Linux metadata collection**

Create `src/helper-go/utils/trusted_symlink_linux.go`:

```go
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
```

- [ ] **Step 3: Deny trusted aliases on non-Linux platforms**

Create `src/helper-go/utils/trusted_symlink_other.go`:

```go
//go:build !linux

package utils

import "os"

func isTrustedSystemSymlinkComponent(_ string, _ os.FileInfo) bool {
	return false
}
```

- [ ] **Step 4: Refactor the component walker and connect the policy**

Replace `PathHasSymlinkComponent` in `src/helper-go/utils/whitelist.go` with:

```go
type trustedSymlinkComponentFunc func(string, os.FileInfo) bool

func pathHasSymlinkComponent(path string, trust trustedSymlinkComponentFunc) (bool, error) {
	clean, err := cleanAbsPath(path)
	if err != nil {
		return false, err
	}
	for {
		info, statErr := os.Lstat(clean)
		if statErr == nil {
			if info.Mode()&os.ModeSymlink != 0 && !trust(clean, info) {
				return true, nil
			}
		} else if !os.IsNotExist(statErr) {
			return false, statErr
		}

		parent := filepath.Dir(clean)
		if parent == clean {
			break
		}
		clean = parent
	}
	return false, nil
}

func PathHasSymlinkComponent(path string) (bool, error) {
	return pathHasSymlinkComponent(path, isTrustedSystemSymlinkComponent)
}
```

- [ ] **Step 5: Format and run the focused tests**

Run:

```bash
gofmt -w src/helper-go/utils/trusted_symlink.go src/helper-go/utils/trusted_symlink_linux.go src/helper-go/utils/trusted_symlink_other.go src/helper-go/utils/trusted_symlink_test.go src/helper-go/utils/whitelist.go src/helper-go/utils/whitelist_test.go
cd src/helper-go
GOTOOLCHAIN=auto go test ./utils -run 'TestTrustedImmutableHomeAliasPolicy|TestPathHasSymlinkComponentRejectsOrdinarySymlink|TestPathSymlinkWalkerSkipsOnlyTrustedComponent' -count=1
```

Expected: all focused tests pass.

- [ ] **Step 6: Verify the Linux-only implementation compiles**

Run from `src/helper-go`:

```bash
GOTOOLCHAIN=auto GOOS=linux GOARCH=amd64 go test -c -o /tmp/flyenv-helper-utils-linux.test ./utils
```

Expected: exit code 0 and a Linux test binary is produced outside the repository.

- [ ] **Step 7: Run all helper tests and commit the behavior**

Run from the repository root:

```bash
GOTOOLCHAIN=auto yarn test:helper
git diff --check
git add src/helper-go/utils/trusted_symlink.go src/helper-go/utils/trusted_symlink_linux.go src/helper-go/utils/trusted_symlink_other.go src/helper-go/utils/trusted_symlink_test.go src/helper-go/utils/whitelist.go src/helper-go/utils/whitelist_test.go
git commit -m "fix: allow trusted immutable Linux home alias"
```

Expected: helper contract, Go tests, and Go vet pass; the commit includes only helper policy, walker, and tests.

### Task 4: Bump the Helper Protocol Version with TDD

**Files:**
- Modify: `scripts/helper-version-sync-test.ts:6`
- Modify: `src/helper-go/main.go:28`
- Modify: `src/shared/AppHelperCheck.ts:14`

- [ ] **Step 1: Make the synchronization test require version 17**

Change:

```ts
const expectedVersion = 16
```

to:

```ts
const expectedVersion = 17
```

- [ ] **Step 2: Run the synchronization test and verify the red state**

Run:

```bash
npx tsx scripts/helper-version-sync-test.ts
```

Expected: failure stating that the shared helper check version should be bumped.

- [ ] **Step 3: Bump both production declarations**

In `src/helper-go/main.go`:

```go
Helper_Version = 17
```

In `src/shared/AppHelperCheck.ts`:

```ts
export const HelperVersion = 17
```

- [ ] **Step 4: Run the synchronization and helper tests**

Run:

```bash
npx tsx scripts/helper-version-sync-test.ts
GOTOOLCHAIN=auto yarn test:helper
```

Expected: version synchronization, helper contract, Go tests, and Go vet all pass.

- [ ] **Step 5: Commit the protocol bump**

Run:

```bash
git add scripts/helper-version-sync-test.ts src/helper-go/main.go src/shared/AppHelperCheck.ts
git commit -m "chore: bump FlyEnv helper version to 17"
```

### Task 5: Final Verification

**Files:**
- Verify: all modified files
- Verify: `docs/superpowers/specs/2026-07-21-linux-immutable-home-path-design.md`

- [ ] **Step 1: Run fresh helper verification**

Run:

```bash
npx tsx scripts/helper-version-sync-test.ts
GOTOOLCHAIN=auto yarn test:helper
```

Expected: every command exits 0 with no test or vet failures.

- [ ] **Step 2: Run cross-platform compile checks**

Run from `src/helper-go`:

```bash
GOTOOLCHAIN=auto GOOS=linux GOARCH=amd64 go test -c -o /tmp/flyenv-helper-utils-linux.test ./utils
GOTOOLCHAIN=auto GOOS=windows GOARCH=amd64 go test -c -o /tmp/flyenv-helper-utils-windows.test.exe ./utils
```

Expected: Linux selects the metadata collector, Windows selects the deny-by-default stub, and both compile successfully.

- [ ] **Step 3: Inspect the final diff and requirements**

Run:

```bash
git status --short
git diff --check HEAD~2..HEAD
git show --stat --oneline HEAD~2..HEAD
```

Confirm:

- application runtime paths were not changed;
- only exact verified `/home -> /var/home` can be trusted;
- nested symlink rejection has a passing regression test;
- helper Go and TypeScript versions are both `17`;
- no generated helper binaries or unrelated files were committed.
