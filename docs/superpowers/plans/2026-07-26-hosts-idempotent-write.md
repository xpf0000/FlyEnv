# Idempotent System Hosts Write Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Skip privileged system hosts writes whenever FlyEnv's managed hosts block already reflects the desired site mappings.

**Architecture:** Extract the pure managed-block reconciliation into a fork utility that returns the next complete system hosts text plus an actual-change flag. `Host._initHost()` continues to generate mappings and `app.hosts.txt`, then delegates its system hosts decision to that utility; it invokes `writeFileByRoot()` only when the flag is true.

**Tech Stack:** TypeScript, Node `assert`, `tsx`, FlyEnv fork process.

---

## File Structure

- Create: `src/fork/module/Host/SystemHostsBlock.ts` — pure FlyEnv marker-block reconciliation with no filesystem dependencies.
- Modify: `src/fork/module/Host/index.ts:378-434` — use reconciliation result to avoid unnecessary privileged writes and return actual write status.
- Create: `scripts/hosts-idempotent-write-test.ts` — executable regression coverage for reconciliation behavior and `_initHost` integration boundary.
- Modify: `package.json` — add the focused test script.

### Task 1: Write the failing idempotent-write regression test

**Files:**
- Create: `scripts/hosts-idempotent-write-test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add a focused test and script**

Create `scripts/hosts-idempotent-write-test.ts`:

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { reconcileSystemHostsBlock } from '../src/fork/module/Host/SystemHostsBlock'

const block = '#X-HOSTS-BEGIN#\n127.0.0.1     demo.test\n#X-HOSTS-END#'

assert.deepEqual(reconcileSystemHostsBlock('127.0.0.1 localhost\n', ''), {
  content: '127.0.0.1 localhost\n',
  changed: false
})
assert.deepEqual(reconcileSystemHostsBlock(`127.0.0.1 localhost\n${block}`, block), {
  content: `127.0.0.1 localhost\n${block}`,
  changed: false
})
assert.deepEqual(reconcileSystemHostsBlock('127.0.0.1 localhost', block), {
  content: `127.0.0.1 localhost\n${block}`,
  changed: true
})
assert.deepEqual(reconcileSystemHostsBlock(`127.0.0.1 localhost\n${block}`, ''), {
  content: '127.0.0.1 localhost\n',
  changed: true
})

const source = readFileSync(join(process.cwd(), 'src/fork/module/Host/index.ts'), 'utf8')
assert.match(source, /reconcileSystemHostsBlock\(content, x\)/)
assert.match(source, /if \(result\.changed\) \{\s*await writeFileByRoot\(this\.hostsFile, result\.content\)/)

console.log('hosts idempotent write checks passed')
```

Add to `package.json`:

```json
"test:hosts-idempotent-write": "tsx scripts/hosts-idempotent-write-test.ts"
```

- [ ] **Step 2: Verify RED**

Run: `yarn test:hosts-idempotent-write`

Expected: failure because `SystemHostsBlock.ts` and the package script do not yet exist.

### Task 2: Reconcile and conditionally write the system hosts block

**Files:**
- Create: `src/fork/module/Host/SystemHostsBlock.ts`
- Modify: `src/fork/module/Host/index.ts:418-433`

- [ ] **Step 1: Implement the pure reconciliation helper**

Create `src/fork/module/Host/SystemHostsBlock.ts`:

```ts
const managedBlockPattern = /(#X-HOSTS-BEGIN#)([\s\S]*?)(#X-HOSTS-END#)/g

export const reconcileSystemHostsBlock = (content: string, desiredBlock: string) => {
  const blocks = content.match(managedBlockPattern) ?? []
  if (!desiredBlock && blocks.length === 0) {
    return { content, changed: false }
  }
  if (desiredBlock && blocks.length === 1 && blocks[0] === desiredBlock) {
    return { content, changed: false }
  }

  const withoutManagedBlocks = content.replace(managedBlockPattern, '')
  const separator =
    desiredBlock && withoutManagedBlocks.length > 0 && !withoutManagedBlocks.endsWith('\n') ? '\n' : ''
  const nextContent = desiredBlock
    ? `${withoutManagedBlocks}${separator}${desiredBlock}`
    : withoutManagedBlocks

  return { content: nextContent, changed: nextContent !== content }
}
```

The helper preserves all unrelated hosts-file bytes and removes duplicate FlyEnv
blocks if a reconciliation is required.

- [ ] **Step 2: Use the helper in `_initHost()`**

In `src/fork/module/Host/index.ts`, import `reconcileSystemHostsBlock`. Remove
the existing `content.match(...)`, `content.replace(...)`, `content.trim()`,
and unconditional `writeFileByRoot()` block. Keep `content` as the raw value
returned by `readFileByRoot()`, then build `x` only from the current host list
and reconcile against that raw value:

```ts
let x = ''
if (host.length) {
  x = `#X-HOSTS-BEGIN#\n${host.join('\n')}\n#X-HOSTS-END#`
}

const result = reconcileSystemHostsBlock(content, x)
if (result.changed) {
  await writeFileByRoot(this.hostsFile, result.content)
}
resolve(result.changed)
```

Do not transform `content` before calling the helper. This preserves all
unrelated content, whitespace, and line endings. Do not change host
collection, `app.hosts.txt`, or the `writeToSystem === false` branch.

- [ ] **Step 3: Verify GREEN**

Run: `yarn test:hosts-idempotent-write`

Expected: `hosts idempotent write checks passed` and exit code 0.

### Task 3: Verify the change

**Files:**
- Create: `src/fork/module/Host/SystemHostsBlock.ts`
- Create: `scripts/hosts-idempotent-write-test.ts`
- Modify: `src/fork/module/Host/index.ts`
- Modify: `package.json`

- [ ] **Step 1: Run focused hosts regressions**

Run: `yarn test:hosts-idempotent-write && yarn test:startup-hosts-sync`

Expected: both scripts print their success messages and exit 0.

- [ ] **Step 2: Run lint and type checks**

Run: `yarn eslint src/fork/module/Host/SystemHostsBlock.ts src/fork/module/Host/index.ts scripts/hosts-idempotent-write-test.ts && yarn vue-tsc --noEmit`

Expected: exit code 0 with no lint or type errors.

- [ ] **Step 3: Check whitespace and commit**

Run: `git diff --check`

Expected: exit code 0 with no output.

```bash
git add package.json scripts/hosts-idempotent-write-test.ts src/fork/module/Host/SystemHostsBlock.ts src/fork/module/Host/index.ts docs/superpowers/plans/2026-07-26-hosts-idempotent-write.md
git commit -m "fix: skip unchanged system hosts writes"
```
