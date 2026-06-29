# AI Coding Group Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the current sidebar AI area into `AI Coding` and `AI`, moving coding-oriented AI CLI modules into the new top-level group without changing the rest of the sidebar behavior.

**Architecture:** Keep the change configuration-driven. Add one new module type in `src/render/core/type.ts`, expose its label through aside i18n, and reassign only the approved module definitions from `ai` to `aiCoding`. Verify the behavior with a lightweight source-level regression script because this repo does not currently ship a dedicated renderer unit-test runner.

**Tech Stack:** TypeScript, Vue 3 module config files, Vue I18n JSON dictionaries, `tsx` for script-style regression checks.

---

### Task 1: Add regression coverage for the new grouping

**Files:**
- Create: `scripts/ai-coding-group-test.ts`
- Modify: none
- Test: `npx tsx scripts/ai-coding-group-test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { AppModuleTypeEnum, AppModuleTypeList } from '../src/render/core/type.ts'

assert.equal(AppModuleTypeEnum.aiCoding, 'aiCoding')
assert.ok(AppModuleTypeList.indexOf('aiCoding') >= 0)
assert.ok(AppModuleTypeList.indexOf('aiCoding') < AppModuleTypeList.indexOf('ai'))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/ai-coding-group-test.ts`
Expected: FAIL because `aiCoding` does not exist in `AppModuleTypeEnum` and the target modules are still assigned to `ai`.

- [ ] **Step 3: Extend the test to assert module assignments and i18n labels**

```ts
const codingModules = ['Kimi', 'ClaudeCode', 'Codex', 'OpenCode'] as const
for (const name of codingModules) {
  const file = fs.readFileSync(path.join(repoRoot, `src/render/components/${name}/Module.ts`), 'utf8')
  assert.match(file, /moduleType:\s*'aiCoding'/)
}
```

- [ ] **Step 4: Run test to verify it still fails**

Run: `npx tsx scripts/ai-coding-group-test.ts`
Expected: FAIL because the source files still contain `moduleType: 'ai'` and the new `aside.aiCoding` label is still missing.

- [ ] **Step 5: Commit**

```bash
git add scripts/ai-coding-group-test.ts docs/superpowers/plans/2026-06-29-ai-coding-group.md
git commit -m "test: add AI coding group regression coverage"
```

### Task 2: Implement the new sidebar group

**Files:**
- Modify: `src/render/core/type.ts`
- Modify: `src/lang/en/aside.json`
- Modify: `src/lang/zh/aside.json`
- Modify: `src/render/components/Kimi/Module.ts`
- Modify: `src/render/components/ClaudeCode/Module.ts`
- Modify: `src/render/components/Codex/Module.ts`
- Modify: `src/render/components/OpenCode/Module.ts`
- Test: `npx tsx scripts/ai-coding-group-test.ts`

- [ ] **Step 1: Add the new module type and order**

```ts
export enum AppModuleTypeEnum {
  // ...
  aiCoding = 'aiCoding',
  ai = 'ai'
}

export const AppModuleTypeList: AllAppModuleType[] = [
  'site',
  'aiCoding',
  'ai'
]
```

- [ ] **Step 2: Add the new aside label**

```json
{
  "ai": "AI",
  "aiCoding": "AI Coding"
}
```

- [ ] **Step 3: Reassign the approved coding modules**

```ts
const module: AppModuleItem = {
  moduleType: 'aiCoding'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/ai-coding-group-test.ts`
Expected: PASS with a summary that the new group exists, the module order is correct, and the four coding modules now target `aiCoding`.

- [ ] **Step 5: Commit**

```bash
git add src/render/core/type.ts src/lang/en/aside.json src/lang/zh/aside.json src/render/components/Kimi/Module.ts src/render/components/ClaudeCode/Module.ts src/render/components/Codex/Module.ts src/render/components/OpenCode/Module.ts
git commit -m "feat: split AI coding tools into separate sidebar group"
```

### Task 3: Run repository-level sanity checks

**Files:**
- Modify: none
- Test: `npx tsc -p tsconfig.json --noEmit`
- Test: `git status --short`

- [ ] **Step 1: Run TypeScript validation**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: PASS with exit code 0.

- [ ] **Step 2: Run git status review**

Run: `git status --short`
Expected: Only the planned files are modified.

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "chore: verify AI coding sidebar split"
```
