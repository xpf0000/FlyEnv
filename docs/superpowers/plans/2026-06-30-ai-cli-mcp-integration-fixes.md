# AI CLI MCP Integration Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix MCP list parsing, authenticated remote MCP registration, Kimi MCP coverage, and FlyEnv MCP client quick-config parity across Antigravity, Codex, Copilot CLI, and Kimi.

**Architecture:** Keep per-client MCP parsing and persistence inside each fork module, but add a small shared MCP helper layer for display-model normalization, command joining, and optional bearer-header generation. Update the renderer tabs to share the same token-aware add-flow behavior, and cover the changed parsing/writing paths with a targeted `tsx` regression script plus scoped lint/type verification.

**Tech Stack:** Electron, Vue 3 Composition API, TypeScript, Element Plus, Node filesystem helpers, TOML helpers, `tsx` regression scripts

---

## File Map

- Create: `src/shared/aiCliMcp.ts`
  Responsibility: small shared helpers for MCP transport classification, command string assembly, and optional bearer-header generation.
- Create: `scripts/ai-cli-mcp-integration-test.ts`
  Responsibility: regression coverage for Antigravity, Codex, Copilot CLI, Kimi, and FlyEnv MCP client snippet generation.
- Create: `src/render/components/Kimi/MCP.vue`
  Responsibility: Kimi MCP list, add dialog, delete flow, and refresh action.
- Modify: `src/fork/module/Antigravity/index.ts`
  Responsibility: parse/write the real Gemini shared MCP config schema and report the correct scope.
- Modify: `src/fork/module/Codex/index.ts`
  Responsibility: parse nested Codex transport output and write HTTP auth headers only when present.
- Modify: `src/fork/module/CopilotCli/index.ts`
  Responsibility: map `source` correctly, keep stdio CLI flow, and persist authenticated HTTP servers via config JSON.
- Modify: `src/fork/module/Kimi/index.ts`
  Responsibility: add `listMcp()`, `removeMcp()`, and token-optional remote writes.
- Modify: `src/shared/mcpClientConfig.ts`
  Responsibility: expand supported FlyEnv quick-config clients and omit empty auth headers from generated snippets.
- Modify: `src/render/components/MCP/setup.ts`
  Responsibility: extend `addToClient()` to Antigravity and Copilot CLI and reuse the shared client flag union.
- Modify: `src/render/components/MCP/ClientConfig.vue`
  Responsibility: expose Antigravity and Copilot CLI in the quick-config switcher and one-click buttons.
- Modify: `src/render/components/Antigravity/MCP.vue`
  Responsibility: add token-aware remote MCP form handling while keeping the current table layout.
- Modify: `src/render/components/Antigravity/setup.ts`
  Responsibility: pass `token` through IPC for remote MCP registration.
- Modify: `src/render/components/Codex/MCP.vue`
  Responsibility: add token-aware remote MCP form handling while keeping the current table layout.
- Modify: `src/render/components/Codex/setup.ts`
  Responsibility: pass `token` through IPC for remote MCP registration.
- Modify: `src/render/components/CopilotCli/MCP.vue`
  Responsibility: add token-aware remote MCP form handling while keeping the current table layout.
- Modify: `src/render/components/CopilotCli/setup.ts`
  Responsibility: pass `token` through IPC for remote MCP registration.
- Modify: `src/render/components/Kimi/Index.vue`
  Responsibility: add the missing `MCP` tab to Kimi.
- Modify: `src/render/components/Kimi/setup.ts`
  Responsibility: add MCP state, list refresh, add, and remove methods for the new Kimi tab.
- Modify: `src/lang/en/kimi.json`
  Responsibility: add Kimi MCP labels used by the new tab.
- Modify: `src/lang/zh/kimi.json`
  Responsibility: add Kimi MCP labels used by the new tab.
- Modify: `src/lang/zh-hant/kimi.json`
  Responsibility: add Kimi MCP labels used by the new tab.
- Modify: `src/lang/en/mcp.json`
  Responsibility: update shared FlyEnv MCP client-config copy to mention the newly supported AI CLIs.
- Modify: `src/lang/zh/mcp.json`
  Responsibility: update shared FlyEnv MCP client-config copy to mention the newly supported AI CLIs.
- Modify: `src/lang/zh-hant/mcp.json`
  Responsibility: update shared FlyEnv MCP client-config copy to mention the newly supported AI CLIs.

### Task 1: Shared MCP helpers plus Antigravity/Codex adapter fixes

**Files:**
- Create: `src/shared/aiCliMcp.ts`
- Create: `scripts/ai-cli-mcp-integration-test.ts`
- Modify: `src/fork/module/Antigravity/index.ts`
- Modify: `src/fork/module/Codex/index.ts`
- Test: `scripts/ai-cli-mcp-integration-test.ts`

- [ ] **Step 1: Write the failing regression cases for Antigravity and Codex**

```ts
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Antigravity from '../src/fork/module/Antigravity'
import Codex from '../src/fork/module/Codex'

async function runFork<T>(promiseLike: Promise<T>): Promise<T> {
  return await promiseLike
}

async function testAntigravityParsesServerUrlAndSharedScope() {
  const root = mkdtempSync(join(tmpdir(), 'flyenv-antigravity-mcp-'))
  process.env.GEMINI_HOME = root
  mkdirSync(join(root, 'config'), { recursive: true })
  writeFileSync(
    join(root, 'config', 'mcp_config.json'),
    JSON.stringify(
      {
        mcpServers: {
          flyenv: {
            serverUrl: 'http://127.0.0.1:7682',
            headers: { Authorization: 'Bearer abc' }
          }
        }
      },
      null,
      2
    )
  )

  const list = await runFork((Antigravity as any).listMcp())
  assert.equal(list[0]?.type, 'http')
  assert.equal(list[0]?.commandOrUrl, 'http://127.0.0.1:7682')
  assert.equal(list[0]?.scope, 'shared')
  rmSync(root, { recursive: true, force: true })
}

async function testCodexParsesNestedTransportOutput() {
  ;(Codex as any).runCommand = async () =>
    JSON.stringify([
      {
        name: 'flyenv',
        enabled: true,
        transport: {
          type: 'streamable_http',
          url: 'http://127.0.0.1:7682',
          http_headers: { Authorization: 'Bearer abc' }
        },
        auth_status: 'bearer_token'
      }
    ])

  const list = await runFork((Codex as any).listMcp())
  assert.equal(list[0]?.type, 'streamable_http')
  assert.equal(list[0]?.commandOrUrl, 'http://127.0.0.1:7682')
  assert.equal(list[0]?.scope, 'user')
}

await testAntigravityParsesServerUrlAndSharedScope()
await testCodexParsesNestedTransportOutput()
console.log('ai-cli-mcp-integration-test: partial ok')
```

- [ ] **Step 2: Run the regression script and verify it fails on the current parsing logic**

Run:

```bash
npx tsx scripts/ai-cli-mcp-integration-test.ts
```

Expected: FAIL with an `AssertionError` showing Antigravity still returns `scope: "user"` or an empty `commandOrUrl`, and Codex still reads top-level `type` / `url` instead of `transport`.

- [ ] **Step 3: Implement the shared helper file and wire Antigravity/Codex to the correct fields**

```ts
// src/shared/aiCliMcp.ts
export interface AIClientMcpRow {
  name: string
  type: string
  commandOrUrl: string
  scope: string
}

export function joinMcpCommand(command?: string, args?: string[]): string {
  return [command, ...(Array.isArray(args) ? args : [])].filter(Boolean).join(' ')
}

export function optionalBearerHeaders(token?: string): Record<string, string> | undefined {
  const trimmed = token?.trim() ?? ''
  return trimmed ? { Authorization: `Bearer ${trimmed}` } : undefined
}

export function isRemoteMcpType(type?: string): boolean {
  return ['http', 'https', 'sse', 'remote', 'streamable_http'].includes(type ?? '')
}
```

```ts
// src/fork/module/Antigravity/index.ts
const remoteUrl = s?.serverUrl ?? s?.url ?? s?.httpUrl ?? ''
const type = s?.type ?? (remoteUrl ? 'http' : 'stdio')
const commandOrUrl = remoteUrl || joinMcpCommand(s?.command, s?.args)
list.push({ name, type, commandOrUrl, scope: 'shared' })

if (type === 'http' || type === 'sse') {
  data.mcpServers[name] = {
    serverUrl: commandOrUrl,
    ...(optionalBearerHeaders(token) ? { headers: optionalBearerHeaders(token) } : {})
  }
}
```

```ts
// src/fork/module/Codex/index.ts
const transport = s?.transport ?? {}
const type = transport?.type ?? s?.type ?? (transport?.url ? 'http' : 'stdio')
const commandOrUrl =
  transport?.url ?? s?.url ?? joinMcpCommand(s?.command, Array.isArray(s?.args) ? s.args : [])
list.push({
  name: s?.name ?? '',
  type,
  commandOrUrl,
  scope: 'user'
})

data.mcp_servers[name] = {
  transport: {
    type: 'streamable_http',
    url: commandOrUrl,
    ...(optionalBearerHeaders(token)
      ? { http_headers: optionalBearerHeaders(token) }
      : {})
  }
}
```

- [ ] **Step 4: Re-run the regression script and verify Antigravity/Codex cases pass**

Run:

```bash
npx tsx scripts/ai-cli-mcp-integration-test.ts
```

Expected: PASS for the Antigravity and Codex assertions, with the script printing `ai-cli-mcp-integration-test: partial ok`.

- [ ] **Step 5: Commit the shared helper plus Antigravity/Codex fixes**

```bash
git add scripts/ai-cli-mcp-integration-test.ts src/shared/aiCliMcp.ts src/fork/module/Antigravity/index.ts src/fork/module/Codex/index.ts
git commit -m "feat: normalize antigravity and codex mcp adapters"
```

### Task 2: Copilot CLI and Kimi fork-side MCP lifecycle fixes

**Files:**
- Modify: `scripts/ai-cli-mcp-integration-test.ts`
- Modify: `src/fork/module/CopilotCli/index.ts`
- Modify: `src/fork/module/Kimi/index.ts`
- Test: `scripts/ai-cli-mcp-integration-test.ts`

- [ ] **Step 1: Extend the regression script with Copilot CLI and Kimi cases**

```ts
import CopilotCli from '../src/fork/module/CopilotCli'
import Kimi from '../src/fork/module/Kimi'

async function testCopilotUsesSourceAndConfigFileForRemoteAuth() {
  const root = mkdtempSync(join(tmpdir(), 'flyenv-copilot-mcp-'))
  process.env.COPILOT_CONFIG_DIR = root
  mkdirSync(root, { recursive: true })

  ;(CopilotCli as any).runCommand = async () =>
    JSON.stringify({
      mcpServers: {
        flyenv: {
          tools: ['*'],
          type: 'http',
          url: 'http://127.0.0.1:7682',
          source: 'user'
        }
      }
    })

  const list = await runFork((CopilotCli as any).listMcp())
  assert.equal(list[0]?.scope, 'user')

  await runFork((CopilotCli as any).addMcp('flyenv', 'http', 'http://127.0.0.1:7682', 'abc'))
  const config = JSON.parse(readFileSync(join(root, 'mcp-config.json'), 'utf8'))
  assert.equal(config.mcpServers.flyenv.url, 'http://127.0.0.1:7682')
  assert.equal(config.mcpServers.flyenv.headers.Authorization, 'Bearer abc')
  rmSync(root, { recursive: true, force: true })
}

async function testKimiListsAndWritesRemoteServersWithoutEmptyBearer() {
  const root = mkdtempSync(join(tmpdir(), 'flyenv-kimi-mcp-'))
  process.env.KIMI_CODE_HOME = root
  mkdirSync(root, { recursive: true })

  await runFork((Kimi as any).addMcp('flyenv', 'http', 'http://127.0.0.1:7682', ''))
  const config = JSON.parse(readFileSync(join(root, 'mcp.json'), 'utf8'))
  assert.equal(config.mcpServers.flyenv.url, 'http://127.0.0.1:7682')
  assert.equal('headers' in config.mcpServers.flyenv, false)

  const list = await runFork((Kimi as any).listMcp())
  assert.equal(list[0]?.type, 'http')
  assert.equal(list[0]?.scope, 'user')

  await runFork((Kimi as any).removeMcp('flyenv'))
  const afterDelete = JSON.parse(readFileSync(join(root, 'mcp.json'), 'utf8'))
  assert.equal(afterDelete.mcpServers.flyenv, undefined)
  rmSync(root, { recursive: true, force: true })
}

await testCopilotUsesSourceAndConfigFileForRemoteAuth()
await testKimiListsAndWritesRemoteServersWithoutEmptyBearer()
console.log('ai-cli-mcp-integration-test: fork ok')
```

- [ ] **Step 2: Run the regression script and verify Copilot/Kimi cases fail first**

Run:

```bash
npx tsx scripts/ai-cli-mcp-integration-test.ts
```

Expected: FAIL with an `AssertionError` showing Copilot still reports the wrong scope or never writes `mcp-config.json`, and Kimi still emits `Authorization: "Bearer "` or has no `listMcp()` / `removeMcp()`.

- [ ] **Step 3: Implement Copilot and Kimi persistence changes**

```ts
// src/fork/module/CopilotCli/index.ts
list.push({
  name: s?.name ?? '',
  type: s?.type ?? (s?.url ? 'http' : 'local'),
  commandOrUrl: s?.url ?? joinMcpCommand(s?.command, s?.args),
  scope: s?.source ?? 'user'
})

if (type === 'http' || type === 'sse') {
  const file = this.mcpConfigFile()
  let data: any = existsSync(file) ? JSON.parse(await readFile(file, 'utf-8')) : {}
  data.mcpServers = data.mcpServers ?? {}
  data.mcpServers[name] = {
    tools: ['*'],
    type: 'http',
    url: commandOrUrl,
    ...(optionalBearerHeaders(token)
      ? { headers: optionalBearerHeaders(token) }
      : {})
  }
  await writeFile(file, JSON.stringify(data, null, 2))
  resolve(true)
  return
}
```

```ts
// src/fork/module/Kimi/index.ts
listMcp() {
  return new ForkPromise(async (resolve) => {
    const list: Array<{ name: string; type: string; commandOrUrl: string; scope: string }> = []
    const file = this.mcpFile()
    if (!existsSync(file)) {
      resolve(list)
      return
    }
    const data = JSON.parse(await readFile(file, 'utf-8'))
    Object.entries(data?.mcpServers ?? {}).forEach(([name, value]: any) => {
      list.push({
        name,
        type: value?.transport === 'sse' ? 'sse' : 'http',
        commandOrUrl: value?.url ?? '',
        scope: 'user'
      })
    })
    resolve(list)
  })
}

const headers = optionalBearerHeaders(token)
data.mcpServers[name] = {
  url: commandOrUrl,
  ...(headers ? { headers } : {})
}

removeMcp(name: string) {
  return new ForkPromise(async (resolve, reject) => {
    const file = this.mcpFile()
    const data = existsSync(file) ? JSON.parse(await readFile(file, 'utf-8')) : {}
    if (data?.mcpServers?.[name]) {
      delete data.mcpServers[name]
      await writeFile(file, JSON.stringify(data, null, 2))
    }
    resolve(true)
  })
}
```

- [ ] **Step 4: Re-run the regression script and verify all fork-side MCP cases pass**

Run:

```bash
npx tsx scripts/ai-cli-mcp-integration-test.ts
```

Expected: PASS for Antigravity, Codex, Copilot CLI, and Kimi, with the script printing `ai-cli-mcp-integration-test: fork ok`.

- [ ] **Step 5: Commit the Copilot/Kimi fork fixes**

```bash
git add scripts/ai-cli-mcp-integration-test.ts src/fork/module/CopilotCli/index.ts src/fork/module/Kimi/index.ts
git commit -m "feat: fix copilot and kimi mcp persistence"
```

### Task 3: FlyEnv MCP quick-config expansion for Antigravity and Copilot CLI

**Files:**
- Modify: `scripts/ai-cli-mcp-integration-test.ts`
- Modify: `src/shared/mcpClientConfig.ts`
- Modify: `src/render/components/MCP/setup.ts`
- Modify: `src/render/components/MCP/ClientConfig.vue`
- Modify: `src/lang/en/mcp.json`
- Modify: `src/lang/zh/mcp.json`
- Modify: `src/lang/zh-hant/mcp.json`
- Test: `scripts/ai-cli-mcp-integration-test.ts`

- [ ] **Step 1: Add failing snippet assertions for Antigravity/Copilot quick config**

```ts
import { buildHttpClientConfigSnippet } from '../src/shared/mcpClientConfig'

function testSnippetGenerationOmitsEmptyBearerAndSupportsNewClients() {
  const antigravitySnippet = buildHttpClientConfigSnippet(
    'antigravity',
    'http://127.0.0.1:7682',
    ''
  )
  assert.match(antigravitySnippet, /serverUrl/)
  assert.doesNotMatch(antigravitySnippet, /Authorization/)

  const copilotSnippet = buildHttpClientConfigSnippet(
    'copilotCli',
    'http://127.0.0.1:7682',
    'abc'
  )
  assert.match(copilotSnippet, /"type": "http"/)
  assert.match(copilotSnippet, /"Authorization": "Bearer abc"/)
}

testSnippetGenerationOmitsEmptyBearerAndSupportsNewClients()
console.log('ai-cli-mcp-integration-test: snippet ok')
```

- [ ] **Step 2: Run the regression script and verify the new client snippet assertions fail**

Run:

```bash
npx tsx scripts/ai-cli-mcp-integration-test.ts
```

Expected: FAIL because `MCPHttpClientFlag` does not include `antigravity` / `copilotCli`, and the generated HTTP snippets still include empty `Authorization` headers.

- [ ] **Step 3: Implement the shared client-config updates and quick-add mapping**

```ts
// src/shared/mcpClientConfig.ts
export type MCPHttpClientFlag =
  | 'claudeCode'
  | 'codex'
  | 'openCode'
  | 'kimi'
  | 'antigravity'
  | 'copilotCli'

const headers = optionalBearerHeaders(token)

if (client === 'antigravity') {
  return JSON.stringify(
    {
      mcpServers: {
        flyenv: {
          serverUrl: url,
          ...(headers ? { headers } : {})
        }
      }
    },
    null,
    2
  )
}

if (client === 'copilotCli') {
  return JSON.stringify(
    {
      mcpServers: {
        flyenv: {
          tools: ['*'],
          type: 'http',
          url,
          ...(headers ? { headers } : {})
        }
      }
    },
    null,
    2
  )
}
```

```ts
// src/render/components/MCP/setup.ts
addToClient(clientFlag: 'claudeCode' | 'codex' | 'openCode' | 'kimi' | 'antigravity' | 'copilotCli') {
  const typeMap: Record<typeof clientFlag, string> = {
    claudeCode: 'http',
    codex: 'http',
    openCode: 'remote',
    kimi: 'http',
    antigravity: 'http',
    copilotCli: 'http'
  }
  return new Promise((resolve) => {
    IPC.send(`app-fork:${clientFlag}`, 'addMcp', 'flyenv', typeMap[clientFlag], this.serverUrl, this.config.token)
```

```vue
<!-- src/render/components/MCP/ClientConfig.vue -->
<el-radio-button label="Antigravity CLI" :value="'antigravity'">Antigravity CLI</el-radio-button>
<el-radio-button label="GitHub Copilot CLI" :value="'copilotCli'">GitHub Copilot CLI</el-radio-button>

<el-button @click="add('antigravity')">
  {{ I18nT('mcp.addToClient', { client: 'Antigravity CLI' }) }}
</el-button>
<el-button @click="add('copilotCli')">
  {{ I18nT('mcp.addToClient', { client: 'GitHub Copilot CLI' }) }}
</el-button>
```

- [ ] **Step 4: Re-run the regression script and scoped lint for the shared quick-config files**

Run:

```bash
npx tsx scripts/ai-cli-mcp-integration-test.ts
npx eslint src/shared/aiCliMcp.ts src/shared/mcpClientConfig.ts src/render/components/MCP/setup.ts src/render/components/MCP/ClientConfig.vue
```

Expected: the script prints `ai-cli-mcp-integration-test: snippet ok`, and `eslint` exits cleanly for the touched shared MCP files.

- [ ] **Step 5: Commit the quick-config expansion**

```bash
git add scripts/ai-cli-mcp-integration-test.ts src/shared/aiCliMcp.ts src/shared/mcpClientConfig.ts src/render/components/MCP/setup.ts src/render/components/MCP/ClientConfig.vue src/lang/en/mcp.json src/lang/zh/mcp.json src/lang/zh-hant/mcp.json
git commit -m "feat: expand flyenv mcp client quick config"
```

### Task 4: Token-aware MCP add dialogs for Antigravity, Codex, and Copilot CLI

**Files:**
- Modify: `src/render/components/Antigravity/MCP.vue`
- Modify: `src/render/components/Antigravity/setup.ts`
- Modify: `src/render/components/Codex/MCP.vue`
- Modify: `src/render/components/Codex/setup.ts`
- Modify: `src/render/components/CopilotCli/MCP.vue`
- Modify: `src/render/components/CopilotCli/setup.ts`
- Test: `src/render/components/Antigravity/MCP.vue`
- Test: `src/render/components/Codex/MCP.vue`
- Test: `src/render/components/CopilotCli/MCP.vue`

- [ ] **Step 1: Write the failing UI contract by updating the three MCP dialogs to pass `token` before setup signatures are changed**

```vue
<script lang="ts" setup>
  const form = reactive({
    name: '',
    type: 'stdio',
    commandOrUrl: '',
    token: ''
  })

  const isRemoteType = computed(() => ['http', 'sse'].includes(form.type))

  const submitAdd = async () => {
    const ok = await CodexSetup.addMcp(
      form.name.trim(),
      form.type,
      form.commandOrUrl.trim(),
      form.token.trim()
    )
    if (ok) {
      addVisible.value = false
    }
  }
</script>

<el-form-item v-if="isRemoteType" :label="I18nT('mcp.token')">
  <el-input v-model="form.token" placeholder="Bearer token" show-password />
</el-form-item>
```

- [ ] **Step 2: Run scoped lint and type checks and verify the old setup signatures now fail**

Run:

```bash
npx eslint src/render/components/Antigravity/MCP.vue src/render/components/Codex/MCP.vue src/render/components/CopilotCli/MCP.vue
npx vue-tsc --noEmit --pretty false
```

Expected: `eslint` may pass, but `vue-tsc` should report argument-count errors for `addMcp(...)` calls until the matching setup methods accept `token`.

- [ ] **Step 3: Update the three setup classes to forward `token` over IPC and keep existing success/error handling**

```ts
// src/render/components/Codex/setup.ts
addMcp(name: string, type: string, commandOrUrl: string, token = '') {
  return new Promise((resolve) => {
    IPC.send('app-fork:codex', 'addMcp', name, type, commandOrUrl, token).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          MessageSuccess(I18nT('base.success'))
          this.refreshMcp()
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        resolve(res?.code === 0)
      }
    )
  })
}
```

```ts
// src/render/components/Antigravity/setup.ts
addMcp(name: string, type: string, commandOrUrl: string, token = '') {
  return new Promise((resolve) => {
    IPC.send('app-fork:antigravity', 'addMcp', name, type, commandOrUrl, token).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          MessageSuccess(I18nT('base.success'))
          this.refreshMcp()
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        resolve(res?.code === 0)
      }
    )
  })
}
```

```ts
// src/render/components/CopilotCli/setup.ts
addMcp(name: string, type: string, commandOrUrl: string, token = '') {
  return new Promise((resolve) => {
    IPC.send('app-fork:copilotCli', 'addMcp', name, type, commandOrUrl, token).then(
      (key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          MessageSuccess(I18nT('base.success'))
          this.refreshMcp()
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        resolve(res?.code === 0)
      }
    )
  })
}
```

- [ ] **Step 4: Re-run scoped lint and type checks for the three updated dialogs**

Run:

```bash
npx eslint src/render/components/Antigravity/MCP.vue src/render/components/Antigravity/setup.ts src/render/components/Codex/MCP.vue src/render/components/Codex/setup.ts src/render/components/CopilotCli/MCP.vue src/render/components/CopilotCli/setup.ts
npx vue-tsc --noEmit --pretty false
```

Expected: no new diagnostics from the six touched MCP dialog/setup files; unrelated repo baseline diagnostics may still remain elsewhere.

- [ ] **Step 5: Commit the token-aware dialog updates**

```bash
git add src/render/components/Antigravity/MCP.vue src/render/components/Antigravity/setup.ts src/render/components/Codex/MCP.vue src/render/components/Codex/setup.ts src/render/components/CopilotCli/MCP.vue src/render/components/CopilotCli/setup.ts
git commit -m "feat: add token-aware ai cli mcp forms"
```

### Task 5: Add the missing Kimi MCP tab and complete final verification

**Files:**
- Create: `src/render/components/Kimi/MCP.vue`
- Modify: `src/render/components/Kimi/Index.vue`
- Modify: `src/render/components/Kimi/setup.ts`
- Modify: `src/lang/en/kimi.json`
- Modify: `src/lang/zh/kimi.json`
- Modify: `src/lang/zh-hant/kimi.json`
- Test: `scripts/ai-cli-mcp-integration-test.ts`

- [ ] **Step 1: Write the failing Kimi UI contract by adding the new tab component before the setup state exists**

```vue
<!-- src/render/components/Kimi/Index.vue -->
<script lang="ts" setup>
  import McpVM from './MCP.vue'

  const tabs = [
    I18nT('base.service'),
    I18nT('base.configFile'),
    I18nT('base.log'),
    I18nT('kimi.sessions'),
    I18nT('kimi.mcp')
  ]
</script>

<div class="main-block">
  <ServiceList v-if="tab === 0"></ServiceList>
  <ConfigVM v-else-if="tab === 1"></ConfigVM>
  <LogsVM v-else-if="tab === 2"></LogsVM>
  <SessionsVM v-else-if="tab === 3"></SessionsVM>
  <McpVM v-else-if="tab === 4"></McpVM>
</div>
```

```vue
<!-- src/render/components/Kimi/MCP.vue -->
<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left flex items-center">
          <span>{{ I18nT('kimi.mcp') }}</span>
          <el-tooltip :content="I18nT('kimi.addServer')" placement="top" :show-after="300">
            <el-button link class="ml-3" :icon="Plus" @click="openAdd" />
          </el-tooltip>
        </div>
        <el-button link :disabled="KimiSetup.mcpLoading" @click="KimiSetup.refreshMcp()">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="w-[24px] h-[24px]"
            :class="{ 'fa-spin': KimiSetup.mcpLoading }"
          ></yb-icon>
        </el-button>
      </div>
    </template>

    <div class="w-full h-full overflow-hidden">
      <div v-loading="KimiSetup.mcpLoading" class="p-5 h-full overflow-hidden flex flex-col">
        <el-scrollbar v-if="KimiSetup.mcpServers.length > 0">
          <el-table :data="KimiSetup.mcpServers" style="width: 100%">
            <el-table-column prop="name" :label="I18nT('kimi.mcpName')" width="180" />
            <el-table-column prop="type" :label="I18nT('kimi.mcpType')" width="100" />
            <el-table-column
              prop="commandOrUrl"
              :label="I18nT('kimi.mcpCommandOrUrl')"
              show-overflow-tooltip
            />
            <el-table-column prop="scope" :label="I18nT('kimi.mcpScope')" width="100" />
            <el-table-column :label="I18nT('base.action')" width="100" align="center">
              <template #default="{ row }">
                <el-button link type="danger" @click="confirmRemove(row.name)">
                  {{ I18nT('base.del') }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-scrollbar>
      </div>
    </div>

    <el-dialog v-model="addVisible" :title="I18nT('kimi.addServer')" width="500" append-to-body>
      <el-form label-position="top" @submit.prevent>
        <el-form-item :label="I18nT('kimi.mcpName')">
          <el-input v-model="form.name" placeholder="my-server" />
        </el-form-item>
        <el-form-item :label="I18nT('kimi.mcpType')">
          <el-radio-group v-model="form.type">
            <el-radio-button value="http">http</el-radio-button>
            <el-radio-button value="sse">sse</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="I18nT('kimi.mcpCommandOrUrl')">
          <el-input v-model="form.commandOrUrl" placeholder="https://example.com/mcp" />
        </el-form-item>
        <el-form-item :label="I18nT('mcp.token')">
          <el-input v-model="form.token" placeholder="Bearer token" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addVisible = false">{{ I18nT('base.cancel') }}</el-button>
        <el-button type="primary" :disabled="!canSubmit" @click="submitAdd">
          {{ I18nT('base.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script lang="ts" setup>
  import { computed, onMounted, reactive, ref } from 'vue'
  import { Plus } from '@element-plus/icons-vue'
  import { ElMessageBox } from 'element-plus'
  import { I18nT } from '@lang/index'
  import { KimiSetup } from './setup'

  const addVisible = ref(false)
  const form = reactive({
    name: '',
    type: 'http',
    commandOrUrl: '',
    token: ''
  })

  const canSubmit = computed(() => form.name.trim() && form.commandOrUrl.trim())

  const openAdd = () => {
    form.name = ''
    form.type = 'http'
    form.commandOrUrl = ''
    form.token = ''
    addVisible.value = true
  }

  const submitAdd = async () => {
    const ok = await KimiSetup.addMcp(
      form.name.trim(),
      form.type,
      form.commandOrUrl.trim(),
      form.token.trim()
    )
    if (ok) {
      addVisible.value = false
    }
  }

  const confirmRemove = (name: string) => {
    ElMessageBox.confirm(I18nT('base.delAlertContent'), I18nT('base.delAlertTitle'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      type: 'warning'
    })
      .then(() => KimiSetup.removeMcp(name))
      .catch(() => {})
  }

  onMounted(() => {
    KimiSetup.refreshMcp()
  })
</script>
```

- [ ] **Step 2: Run scoped lint and type checks and verify Kimi fails until setup state and i18n keys are added**

Run:

```bash
npx eslint src/render/components/Kimi/Index.vue src/render/components/Kimi/MCP.vue src/render/components/Kimi/setup.ts
npx vue-tsc --noEmit --pretty false
```

Expected: `vue-tsc` should complain that `KimiSetup` lacks `mcpServers` / `mcpLoading` / `refreshMcp` / `addMcp` / `removeMcp`, and the Kimi locale object lacks `mcp`-related keys.

- [ ] **Step 3: Implement Kimi setup state and locale keys**

```ts
// src/render/components/Kimi/setup.ts
export interface McpItem {
  name: string
  type: string
  commandOrUrl: string
  scope: string
}

class Kimi {
  mcpServers: McpItem[] = []
  mcpLoading = false

  refreshMcp() {
    this.mcpLoading = true
    IPC.send('app-fork:kimi', 'listMcp').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.mcpServers = res?.data ?? []
      }
      this.mcpLoading = false
    })
  }

  addMcp(name: string, type: string, commandOrUrl: string, token = '') {
    return new Promise((resolve) => {
      IPC.send('app-fork:kimi', 'addMcp', name, type, commandOrUrl, token).then(
        (key: string, res: any) => {
          IPC.off(key)
          if (res?.code === 0) {
            MessageSuccess(I18nT('base.success'))
            this.refreshMcp()
          } else {
            MessageError(res?.msg ?? I18nT('base.fail'))
          }
          resolve(res?.code === 0)
        }
      )
    })
  }

  removeMcp(name: string) {
    return new Promise((resolve) => {
      IPC.send('app-fork:kimi', 'removeMcp', name).then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          MessageSuccess(I18nT('base.success'))
          this.refreshMcp()
        } else {
          MessageError(res?.msg ?? I18nT('base.fail'))
        }
        resolve(res?.code === 0)
      })
    })
  }
}
```

```json
// src/lang/en/kimi.json
{
  "mcp": "MCP",
  "addServer": "Add Server",
  "mcpName": "Name",
  "mcpType": "Type",
  "mcpCommandOrUrl": "Command / URL",
  "mcpScope": "Scope"
}
```

```json
// src/lang/zh/kimi.json
{
  "mcp": "MCP",
  "addServer": "添加服务器",
  "mcpName": "名称",
  "mcpType": "类型",
  "mcpCommandOrUrl": "命令 / URL",
  "mcpScope": "范围"
}
```

```json
// src/lang/zh-hant/kimi.json
{
  "mcp": "MCP",
  "addServer": "新增伺服器",
  "mcpName": "名稱",
  "mcpType": "類型",
  "mcpCommandOrUrl": "命令 / URL",
  "mcpScope": "範圍"
}
```

```ts
// scripts/ai-cli-mcp-integration-test.ts
await testAntigravityParsesServerUrlAndSharedScope()
await testCodexParsesNestedTransportOutput()
await testCopilotUsesSourceAndConfigFileForRemoteAuth()
await testKimiListsAndWritesRemoteServersWithoutEmptyBearer()
testSnippetGenerationOmitsEmptyBearerAndSupportsNewClients()
console.log('ai-cli-mcp-integration-test: ok')
```

- [ ] **Step 4: Run the full targeted verification set and perform manual UI checks**

Run:

```bash
npx tsx scripts/ai-cli-mcp-integration-test.ts
npx eslint src/shared/aiCliMcp.ts src/shared/mcpClientConfig.ts src/fork/module/Antigravity/index.ts src/fork/module/Codex/index.ts src/fork/module/CopilotCli/index.ts src/fork/module/Kimi/index.ts src/render/components/Antigravity/MCP.vue src/render/components/Antigravity/setup.ts src/render/components/Codex/MCP.vue src/render/components/Codex/setup.ts src/render/components/CopilotCli/MCP.vue src/render/components/CopilotCli/setup.ts src/render/components/Kimi/Index.vue src/render/components/Kimi/MCP.vue src/render/components/Kimi/setup.ts src/render/components/MCP/setup.ts src/render/components/MCP/ClientConfig.vue
npx vue-tsc --noEmit --pretty false
```

Expected:

- `npx tsx scripts/ai-cli-mcp-integration-test.ts` prints `ai-cli-mcp-integration-test: ok`
- `eslint` exits cleanly for the touched files
- `vue-tsc` shows no new diagnostics for the MCP files changed in this plan; unrelated baseline diagnostics may still remain elsewhere in the repo

Manual UI verification:

- Antigravity MCP table shows correct `type`, `Command / URL`, and `scope`
- Codex MCP table shows `transport.type`, nested URL, and `user` scope
- Copilot CLI MCP table shows `source` in the scope column
- Antigravity/Codex/Copilot add dialogs show `token` only for remote transports
- Kimi now has an `MCP` tab with add/remove/refresh behavior
- FlyEnv MCP client config shows Antigravity CLI and GitHub Copilot CLI in both snippet selection and one-click registration

- [ ] **Step 5: Commit the Kimi MCP tab and final verification-safe UI updates**

```bash
git add scripts/ai-cli-mcp-integration-test.ts src/render/components/Kimi/Index.vue src/render/components/Kimi/MCP.vue src/render/components/Kimi/setup.ts src/lang/en/kimi.json src/lang/zh/kimi.json src/lang/zh-hant/kimi.json
git commit -m "feat: add kimi mcp tab"
```
