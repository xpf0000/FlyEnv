# Static HTTP Server Add and Windows Drag-and-Drop Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the Static HTTP Server Add button and make the Windows `FlyEnvStartup` scheduled task run at normal user integrity so Explorer folder drag-and-drop works after auto-launch.

**Architecture:** Keep the existing HTTP server folder picker, directory validation, multi-folder drop parsing, persistence, and automatic startup flow. Fix the parent-to-child Add button wiring in Vue, and centralize scheduled-task run-level selection in the Go helper while mirroring the same rule in the TypeScript PowerShell fallback: `FlyEnvStartup` is limited, helper tasks remain highest.

**Tech Stack:** Vue 3 with TypeScript, Electron main-process IPC, Go helper, Node `assert`, `tsx`, PowerShell fallback generation.

---

## File Structure

- Create `scripts/http-serve-add-button-test.ts`: source-level regression check for the Vue Add button wiring because the repository has no renderer component test runner.
- Modify `src/render/components/HttpServe/Index.vue`: restore the Add button click handler and typed child component reference.
- Create `src/helper-go/module/tool_test.go`: unit coverage for task-name-based Windows run-level selection.
- Modify `src/helper-go/module/tool.go`: select `limited` for `FlyEnvStartup` and `highest` for privileged helper tasks.
- Modify `scripts/windows-helper-fallback-plan-test.ts`: require matching run-level behavior from the PowerShell fallback.
- Modify `src/shared/WindowsHelperFallback.ts`: emit the selected run level in the generated `schtasks` command.

### Task 1: Add Failing Windows Auto-Launch Run-Level Tests

**Files:**
- Create: `src/helper-go/module/tool_test.go`
- Modify: `scripts/windows-helper-fallback-plan-test.ts`

- [ ] **Step 1: Add the Go run-level unit test**

Create `src/helper-go/module/tool_test.go`:

```go
package module

import "testing"

func TestAutoStartRunLevel(t *testing.T) {
	tests := []struct {
		name     string
		taskName string
		want     string
	}{
		{name: "FlyEnv app uses normal user integrity", taskName: "FlyEnvStartup", want: "limited"},
		{name: "helper task keeps elevated integrity", taskName: "FlyEnvHelperTask", want: "highest"},
		{name: "legacy helper task keeps elevated integrity", taskName: "flyenv-helper", want: "highest"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := autoStartRunLevel(tt.taskName); got != tt.want {
				t.Fatalf("autoStartRunLevel(%q) = %q, want %q", tt.taskName, got, tt.want)
			}
		})
	}
}
```

- [ ] **Step 2: Extend the fallback test with app and helper expectations**

After the existing `setAutoStartPlan` assertions in `scripts/windows-helper-fallback-plan-test.ts`, add:

```ts
assert.match(setAutoStartPlan.script, /\/rl limited/)

const setHelperAutoStartPlan = buildWindowsHelperFallbackPlan(
  'tools',
  'setAutoStartWin',
  [true, 'FlyEnvHelperTask', 'C:/FlyEnv/flyenv-helper.exe'],
  6000
)
assert.match(setHelperAutoStartPlan.script, /\/rl highest/)
```

- [ ] **Step 3: Format the Go test**

Run:

```powershell
gofmt -w src/helper-go/module/tool_test.go
```

Expected: command exits successfully and produces no output.

- [ ] **Step 4: Run both tests and verify RED**

Run:

```powershell
go test ./module
```

Working directory: `src/helper-go`

Expected: FAIL because `autoStartRunLevel` is undefined.

Run:

```powershell
npx tsx scripts/windows-helper-fallback-plan-test.ts
```

Working directory: repository root.

Expected: FAIL because the generated `FlyEnvStartup` script currently contains `/rl highest` instead of `/rl limited`.

### Task 2: Implement Task-Name-Based Windows Run Levels

**Files:**
- Modify: `src/helper-go/module/tool.go`
- Modify: `src/shared/WindowsHelperFallback.ts`
- Test: `src/helper-go/module/tool_test.go`
- Test: `scripts/windows-helper-fallback-plan-test.ts`

- [ ] **Step 1: Add the Go run-level selector**

Immediately before `SetAutoStartWin` in `src/helper-go/module/tool.go`, add:

```go
func autoStartRunLevel(taskName string) string {
	if taskName == "FlyEnvStartup" {
		return "limited"
	}
	return "highest"
}
```

- [ ] **Step 2: Use the selector in the Go `schtasks` arguments**

Replace:

```go
"/sc", "onlogon", "/rl", "highest", "/f",
```

with:

```go
"/sc", "onlogon", "/rl", autoStartRunLevel(taskName), "/f",
```

- [ ] **Step 3: Mirror the selector in the TypeScript fallback generator**

At the start of `buildSetAutoStartScript` in `src/shared/WindowsHelperFallback.ts`, add:

```ts
const runLevel = args.taskName === 'FlyEnvStartup' ? 'limited' : 'highest'
```

Replace:

```ts
& $schtasksExe /create /tn $taskName /tr ('"' + $exePath + '"') /sc onlogon /rl highest /f | Out-Null
```

with:

```ts
& $schtasksExe /create /tn $taskName /tr ('"' + $exePath + '"') /sc onlogon /rl ${runLevel} /f | Out-Null
```

- [ ] **Step 4: Format the Go implementation**

Run:

```powershell
gofmt -w src/helper-go/module/tool.go src/helper-go/module/tool_test.go
```

Expected: command exits successfully and produces no output.

- [ ] **Step 5: Run both tests and verify GREEN**

Run from `src/helper-go`:

```powershell
go test ./module
```

Expected: PASS.

Run from repository root:

```powershell
npx tsx scripts/windows-helper-fallback-plan-test.ts
```

Expected output ends with:

```text
windows helper fallback plan test passed
```

- [ ] **Step 6: Commit the Windows auto-launch fix**

```powershell
git add -- src/helper-go/module/tool.go src/helper-go/module/tool_test.go src/shared/WindowsHelperFallback.ts scripts/windows-helper-fallback-plan-test.ts
git commit -m "fix: run FlyEnv auto launch without elevation"
```

### Task 3: Add a Failing Static HTTP Server Add Button Regression Check

**Files:**
- Create: `scripts/http-serve-add-button-test.ts`

- [ ] **Step 1: Write the source contract test**

Create `scripts/http-serve-add-button-test.ts`:

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('../src/render/components/HttpServe/Index.vue', import.meta.url),
  'utf8'
)

assert.match(source, /<el-radio-button[^>]*@click\.stop="doAdd"/s)
assert.match(source, /const list = ref<HttpServeListInstance>\(\)/)
assert.match(source, /list\.value\?\.choosePath\(\)/)

console.log('http serve add button test passed')
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
npx tsx scripts/http-serve-add-button-test.ts
```

Expected: FAIL because the Add radio button has no `@click.stop="doAdd"` handler.

### Task 4: Restore the Static HTTP Server Add Button

**Files:**
- Modify: `src/render/components/HttpServe/Index.vue`
- Test: `scripts/http-serve-add-button-test.ts`

- [ ] **Step 1: Connect the button to the child folder picker**

Change `src/render/components/HttpServe/Index.vue` to:

```vue
<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <el-radio-button
        :label="I18nT('common.action.add')"
        :value="0"
        @click.stop="doAdd"
      ></el-radio-button>
    </el-radio-group>
    <List ref="list"></List>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { I18nT } from '@lang/index'
  import List from './List.vue'

  type HttpServeListInstance = {
    choosePath: () => void
  }

  const tab = computed(() => 0)
  const list = ref<HttpServeListInstance>()

  const doAdd = () => {
    list.value?.choosePath()
  }
</script>
```

- [ ] **Step 2: Run the button regression test and verify GREEN**

Run:

```powershell
npx tsx scripts/http-serve-add-button-test.ts
```

Expected output:

```text
http serve add button test passed
```

- [ ] **Step 3: Run Vue type checking for the component ref contract**

Run:

```powershell
npx vue-tsc --noEmit
```

Expected: exit code 0 with no TypeScript or Vue template errors.

- [ ] **Step 4: Commit the Add button fix**

```powershell
git add -- src/render/components/HttpServe/Index.vue scripts/http-serve-add-button-test.ts
git commit -m "fix: restore static HTTP server add action"
```

### Task 5: Final Verification

**Files:**
- Verify all changed implementation and regression files.

- [ ] **Step 1: Run targeted TypeScript regression checks**

```powershell
npx tsx scripts/http-serve-add-button-test.ts
npx tsx scripts/windows-helper-fallback-plan-test.ts
```

Expected: both commands exit 0 and print their respective `passed` messages.

- [ ] **Step 2: Run the Go helper tests**

Run from `src/helper-go`:

```powershell
go test ./...
```

Expected: all packages pass with zero failures.

- [ ] **Step 3: Verify the helper contract**

Run from repository root:

```powershell
yarn test:helper:contract
```

Expected: exit code 0.

- [ ] **Step 4: Run renderer and shared-code type checking**

```powershell
npx vue-tsc --noEmit
```

Expected: exit code 0 with no errors.

- [ ] **Step 5: Lint changed TypeScript and Vue files**

```powershell
npx eslint src/render/components/HttpServe/Index.vue src/shared/WindowsHelperFallback.ts scripts/http-serve-add-button-test.ts scripts/windows-helper-fallback-plan-test.ts
```

Expected: exit code 0 with no lint or formatting errors.

- [ ] **Step 6: Check formatting and the final diff**

```powershell
gofmt -d src/helper-go/module/tool.go src/helper-go/module/tool_test.go
git diff --check
git status --short
```

Expected: `gofmt -d` and `git diff --check` produce no output. `git status --short` shows only any intentionally uncommitted plan file or unrelated pre-existing user files.

- [ ] **Step 7: Confirm the Windows task behavior for release testing**

After building/installing a version containing the fix, disable and re-enable FlyEnv auto-launch, then run:

```powershell
(Get-ScheduledTask -TaskName 'FlyEnvStartup').Principal | Format-List UserId,LogonType,RunLevel
```

Expected:

```text
RunLevel : Limited
```

On the next login, FlyEnv should accept a folder dragged from Explorer across the Static HTTP Server page.
