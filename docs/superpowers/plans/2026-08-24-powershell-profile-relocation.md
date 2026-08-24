# PowerShell Profile Relocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permit Windows PowerShell profile integration when the Windows Documents folder is relocated outside the helper user's home directory.

**Architecture:** Keep the existing `tools.installFlyEnvPowerShellIntegration` operation and its fixed FlyEnv runtime-script boundary. Remove only the profile-target home containment requirement from the Go helper and both TypeScript fallback validation layers; the edition-specific directory/filename and reparse-point protections remain. No renderer operation, IPC shape, state owner, progress event, or process lifecycle changes are introduced.

**Tech Stack:** Go helper, TypeScript, generated PowerShell, Node `assert` test scripts, Yarn.

**Operation contract:** Owner remains the `Tool.win` fork operation, invoked through `Helper.send('tools', 'installFlyEnvPowerShellIntegration', ...)`. Start event, intermediate progress text, terminal helper response, duplicate-invocation behavior, runtime-script interaction, and lifecycle ownership are unchanged. This patch adds no long-running renderer operation, child process, or new state; therefore no new operation lifecycle tests are required.

**Module-boundary checklist:** No new module, persisted state, Pinia store, controller, lifecycle workflow, or public shared type is added. No exception authorization is required.

---

### Task 1: Lock the relocated-profile contract with a failing regression test

**Files:**
- Modify: `scripts/flyenv-shell-integration-test.ts:10-50, 118-205`
- Modify: `src/helper-go/utils/whitelist_test.go:152-188`

- [ ] **Step 1: Extend the cross-platform integration test before changing production code**

Add the Go validator source and assertions near the existing source-contract reads:

```ts
const helperGoWhitelist = fs.readFileSync(
  join(root, 'src/helper-go/utils/whitelist.go'),
  'utf8'
)

assert.doesNotMatch(helperGoWhitelist, /os\.UserHomeDir\(\)/)
assert.doesNotMatch(fallback, /callerHome/)
assert.doesNotMatch(fallback, /Test-FlyEnvShellPathInDirectory \$profilePath \$userHome/)
```

Replace the Windows-only fallback assertion that currently expects an outside-home standard profile to throw with this assertion:

```ts
assert.doesNotThrow(() =>
  buildFlyEnvPowerShellIntegrationUacPlan([
    {
      ...request,
      profiles: [
        {
          edition: 'windows-powershell',
          path: join(
            path.dirname(isolatedRoot),
            'outside-home',
            'WindowsPowerShell',
            'Microsoft.PowerShell_profile.ps1'
          )
        }
      ]
    }
  ])
)
```

Rename the Go test to `TestValidateFlyEnvPowerShellProfilePathAllowsRedirectedDocumentsOutsideHome` and change its `outsideHome` check to require success and normalized-path equality:

```go
outsideHome := filepath.Join(
	filepath.Dir(home),
	"outside-home",
	"WindowsPowerShell",
	"Microsoft.PowerShell_profile.ps1",
)
clean, err = ValidateFlyEnvPowerShellProfilePath(outsideHome, "windows-powershell")
if err != nil {
	t.Fatalf("redirected profile outside the current user home should be allowed: %v", err)
}
if !pathEqual(clean, outsideHome) {
	t.Fatalf("validated profile path = %q, want %q", clean, outsideHome)
}
```

- [ ] **Step 2: Run the focused integration test and confirm it fails for the expected legacy containment guards**

Run: `yarn test:flyenv-shell-integration`

Expected: FAIL at `assert.doesNotMatch`, because `whitelist.go` still calls `os.UserHomeDir()` and the fallback still contains `callerHome`/`Test-FlyEnvShellPathInDirectory` profile validation.

### Task 2: Remove the Go helper's home containment validation

**Files:**
- Modify: `src/helper-go/utils/whitelist.go:570-611`
- Test: `src/helper-go/utils/whitelist_test.go:152-188`

- [ ] **Step 1: Preserve only the profile-shape and reparse-point checks**

Replace the validator documentation and body after `PathHasSymlinkComponent` with:

```go
// ValidateFlyEnvPowerShellProfilePath only permits the two standard
// edition-specific PowerShell profile names. Windows may relocate Documents
// outside the helper user's home, so profile location is not restricted to it.
func ValidateFlyEnvPowerShellProfilePath(path, edition string) (string, error) {
	if runtime.GOOS != "windows" {
		return "", fmt.Errorf("PowerShell profile validation is only supported on Windows")
	}
	clean, err := cleanAbsPath(path)
	if err != nil {
		return "", err
	}
	if hasSymlink, err := PathHasSymlinkComponent(clean); err != nil {
		return "", err
	} else if hasSymlink {
		return "", fmt.Errorf("PowerShell profile path contains a reparse point: %s", path)
	}
	var expectedDirectory, expectedFileName string
	switch edition {
	case "windows-powershell":
		expectedDirectory = "WindowsPowerShell"
		expectedFileName = "Microsoft.PowerShell_profile.ps1"
	case "pwsh":
		expectedDirectory = "PowerShell"
		expectedFileName = "Profile.ps1"
	default:
		return "", fmt.Errorf("unsupported PowerShell edition: %s", edition)
	}
	if !strings.EqualFold(filepath.Base(filepath.Dir(clean)), expectedDirectory) ||
		!strings.EqualFold(filepath.Base(clean), expectedFileName) {
		return "", fmt.Errorf("unexpected PowerShell profile path for %s: %s", edition, path)
	}
	return clean, nil
}
```

- [ ] **Step 2: Format and execute Go helper tests**

Run: `gofmt -w src/helper-go/utils/whitelist.go src/helper-go/utils/whitelist_test.go && yarn test:helper:go`

Expected: PASS. On macOS/Linux, the Windows-only relocation behavior test is reported as skipped; it executes in the Windows helper test job.

### Task 3: Align the UAC fallback's preflight and elevated validation

**Files:**
- Modify: `src/shared/WindowsHelperFallback.ts:70-92, 514-603, 781-977, 1361-1365`
- Test: `scripts/flyenv-shell-integration-test.ts:10-50, 118-205`

- [ ] **Step 1: Remove `callerHome` from fallback request state and options**

Use these declarations:

```ts
type ValidatedFlyEnvPowerShellIntegrationArgs = {
  scriptPath: string
  scriptBase64: string
  profiles: FlyEnvPowerShellProfileTarget[]
}

export type FlyEnvPowerShellIntegrationUacPlanOptions = {
  powershellPath?: string
  resultPath?: string
  nonce?: string
}
```

Change `validateFlyEnvPowerShellProfileTarget` to accept only `(value, index)`, and retain only this final profile-shape condition:

```ts
if (
  path.win32.basename(path.win32.dirname(targetPath)).toLowerCase() !==
    expectedDirectory.toLowerCase() ||
  path.win32.basename(targetPath).toLowerCase() !== expectedFileName.toLowerCase()
) {
  helperExecutionFailed(`unexpected ${edition} profile path: ${targetPath}`)
}
```

Change `validateFlyEnvPowerShellIntegrationArgs` to accept only `args`, map with `validateFlyEnvPowerShellProfileTarget(profile, index)`, and return:

```ts
return { scriptPath, scriptBase64, profiles }
```

- [ ] **Step 2: Remove the redundant elevated home check from the generated script**

Build `runtimeSetup` with only the JSON payload:

```ts
const runtimeSetup = `$payloadJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(${powerShellString(Buffer.from(JSON.stringify(args), 'utf8').toString('base64'))}))
$payload = $payloadJson | ConvertFrom-Json`
```

Change the generated PowerShell function declaration and call:

```powershell
function Assert-FlyEnvPowerShellIntegrationPayload($Request) {
```

```powershell
$payload = Assert-FlyEnvPowerShellIntegrationPayload $payload
```

Within its profile loop, delete `$userHome = Normalize-FlyEnvShellPath $CallerHome 'current user home'` and remove only this containment clause from the profile-path condition:

```powershell
-not (Test-FlyEnvShellPathInDirectory $profilePath $userHome) -or
```

Finally, call the preflight validator with no home option:

```ts
const validated = validateFlyEnvPowerShellIntegrationArgs(args)
```

- [ ] **Step 3: Run the focused regression test and confirm it passes**

Run: `yarn test:flyenv-shell-integration`

Expected: PASS with `FlyEnv shell integration tests passed`.

### Task 4: Verify the combined change and inspect the final scope

**Files:**
- Verify: `src/helper-go/utils/whitelist.go`
- Verify: `src/shared/WindowsHelperFallback.ts`
- Verify: `src/helper-go/utils/whitelist_test.go`
- Verify: `scripts/flyenv-shell-integration-test.ts`

- [ ] **Step 1: Run formatting and focused verification**

Run: `gofmt -w src/helper-go/utils/whitelist.go src/helper-go/utils/whitelist_test.go && yarn test:flyenv-shell-integration && yarn test:helper:go && yarn test:helper:go:vet`

Expected: all commands succeed; any Windows-specific tests skipped on the current non-Windows host are reported as skipped rather than failed.

- [ ] **Step 2: Review the patch for accidental boundary or security changes**

Run: `git diff --check && git diff -- src/helper-go/utils/whitelist.go src/shared/WindowsHelperFallback.ts src/helper-go/utils/whitelist_test.go scripts/flyenv-shell-integration-test.ts`

Expected: no whitespace errors; only home containment and its tests/options are removed. Runtime script validation, edition/filename checks, duplicate-edition checks, and reparse-point rejection remain present.
