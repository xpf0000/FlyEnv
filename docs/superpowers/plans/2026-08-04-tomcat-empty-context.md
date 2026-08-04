# Tomcat Empty Context Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop emitting empty Tomcat Context entries and remove historical empty entries from FlyEnv-managed Hosts whenever `server.xml` is regenerated.

**Architecture:** Keep the change in `makeTomcatServerXML`, the shared global/custom Tomcat configuration builder. New Host templates omit the invalid Context, while a parsed-object cleanup removes only Context objects that contain exactly blank `path` and `docBase` attributes. A focused `tsx` script exercises the real builder and verifies managed and non-managed Host behavior.

**Tech Stack:** TypeScript, `fast-xml-parser`, Node `assert/strict`, `tsx`.

---

### Task 1: Add Tomcat server.xml regression coverage

**Files:**
- Create: `scripts/tomcat-server-xml-test.ts`

- [ ] **Step 1: Write the failing test**

Create a real builder test that initializes the global base directory needed by `makeTomcatServerXML`, builds a minimal Tomcat configuration, and verifies the three required behaviors:

```ts
import assert from 'node:assert/strict'
import { XMLParser } from 'fast-xml-parser'
import { makeTomcatServerXML } from '../src/fork/module/Tomcat/ServerXML'

;(global as any).Server = { BaseDir: '/tmp/flyenv-tomcat-test' }

const tomcatHost: any = {
  id: 1,
  name: 'example.test',
  alias: '',
  root: '/var/www/example',
  type: 'tomcat',
  useSSL: false,
  ssl: { cert: '', key: '' },
  port: { tomcat: 8080 }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  attributesGroupName: ''
})

const baseConfig = `<?xml version="1.0" encoding="UTF-8"?>
<Server><Service><Engine name="Catalina" defaultHost="localhost" /></Service></Server>`

const created = makeTomcatServerXML('/tmp/tomcat/conf', baseConfig, [tomcatHost])
assert.doesNotMatch(created, /<Context(?:\s|>)/)

const existing = `<?xml version="1.0" encoding="UTF-8"?>
<Server><Service><Engine>
  <Host name="example.test" appBase="/var/www/old" appFlag="FlyEnv">
    <Context path="" docBase=""></Context>
    <Context path="/app" docBase="/var/www/app"><Resource name="jdbc/app" /></Context>
  </Host>
  <Host name="manual.test" appBase="/var/www/manual">
    <Context path="" docBase=""></Context>
  </Host>
</Engine></Service></Server>`

const repaired = makeTomcatServerXML('/tmp/tomcat/conf', existing, [tomcatHost])
const hosts = parser.parse(repaired).Server.Service.Engine.Host
const flyEnvHost = hosts.find((host: any) => host.name === 'example.test')
const manualHost = hosts.find((host: any) => host.name === 'manual.test')
const flyEnvContexts = Array.isArray(flyEnvHost.Context) ? flyEnvHost.Context : [flyEnvHost.Context]

assert.equal(flyEnvContexts.length, 1)
assert.equal(flyEnvContexts[0].path, '/app')
assert.equal(flyEnvContexts[0].docBase, '/var/www/app')
assert.equal(manualHost.Context.path, '')
assert.equal(manualHost.Context.docBase, '')

console.log('tomcat server.xml regression tests passed')
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn tsx scripts/tomcat-server-xml-test.ts`

Expected: FAIL because generated and existing FlyEnv Hosts still contain the empty Context.

- [ ] **Step 3: Commit the test scaffold after the red run**

Run:

```bash
git add scripts/tomcat-server-xml-test.ts
git commit -m "test: cover Tomcat empty context cleanup"
```

### Task 2: Stop emitting and clean historical empty Contexts

**Files:**
- Modify: `src/fork/module/Tomcat/ServerXML.ts:117-155`
- Modify: `scripts/tomcat-server-xml-test.ts`

- [ ] **Step 1: Implement the minimal cleanup helper**

Add a local predicate and cleanup function immediately before `cleanVhost`. They must accept the parser's single-object and array representations, touch only FlyEnv-managed Hosts, and delete only a Context with exactly the two empty attributes:

```ts
  const isEmptyContext = (context: any) => {
    return (
      context &&
      context.path === '' &&
      context.docBase === '' &&
      Object.keys(context).length === 2
    )
  }

  const cleanEmptyContext = () => {
    const hosts = serverXML.Server.Service.Engine.Host
    const list = Array.isArray(hosts) ? hosts : hosts ? [hosts] : []
    for (const host of list) {
      if (host.appFlag !== 'FlyEnv' || !host.Context) continue
      if (Array.isArray(host.Context)) {
        host.Context = host.Context.filter((context: any) => !isEmptyContext(context))
        if (host.Context.length === 0) delete host.Context
      } else if (isEmptyContext(host.Context)) {
        delete host.Context
      }
    }
  }
```

Remove both template lines that create `<Context path="" docBase=""></Context>`. Call `cleanEmptyContext()` after `cleanVhost(allName)` and before `builder.build(serverXML)`.

- [ ] **Step 2: Run the focused test to verify it passes**

Run: `yarn tsx scripts/tomcat-server-xml-test.ts`

Expected: `tomcat server.xml regression tests passed`.

- [ ] **Step 3: Run existing adjacent coverage**

Run:

```bash
yarn tsx scripts/service-web-panel-test.ts
yarn test:clickhouse-ch-ui
```

Expected: both scripts pass.

- [ ] **Step 4: Inspect formatting and commit the implementation**

Run:

```bash
git diff --check
git add src/fork/module/Tomcat/ServerXML.ts scripts/tomcat-server-xml-test.ts
git commit -m "fix: remove empty Tomcat contexts"
```

### Task 3: Final verification and handoff

**Files:**
- Verify: `src/fork/module/Tomcat/ServerXML.ts`
- Verify: `scripts/tomcat-server-xml-test.ts`

- [ ] **Step 1: Run the complete focused verification set**

Run:

```bash
yarn tsx scripts/tomcat-server-xml-test.ts
yarn tsx scripts/service-web-panel-test.ts
yarn test:clickhouse-ch-ui
```

Expected: all three scripts pass.

- [ ] **Step 2: Run TypeScript validation**

Run: `yarn vue-tsc --noEmit`

Expected: if existing unrelated errors remain, confirm the output has no errors in `Tomcat/ServerXML.ts` or `tomcat-server-xml-test.ts` and report the baseline failures separately.

- [ ] **Step 3: Inspect the final worktree**

Run:

```bash
git diff --check
git status --short
git diff master...HEAD --stat
```

Expected: no whitespace errors; only the design, plan, Tomcat source, and regression test are included.
