# Tomcat Site Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each FlyEnv Tomcat site safely manage multiple Context mappings and host-level rewrite rules, make generated SSL configuration effective, and reconcile/restart an already running Tomcat after a site change.

**Architecture:** Keep the persisted site definition on the existing Tomcat host record, but keep all Tomcat-only TypeScript types and policy helpers in the Tomcat module. A fork-side reconciler owns standard Context descriptor files, `rewrite.config`, FlyEnv-marked Hosts/Valves/Connectors/SNI entries, and the selected `CATALINA_BASE`. A renderer-local singleton controller owns the save IPC and optional standard `ModuleInstalledItem.restart()`; the drawer retains only form state.

**Tech Stack:** TypeScript, Vue 3 Composition API, Electron IPC, `fast-xml-parser`, `fs-extra`, Node `assert/strict`, `tsx`, Vue I18n.

---

## File structure and ownership

| Path | Responsibility |
| --- | --- |
| `src/fork/module/Tomcat/Site.ts` | Tomcat-only persisted-record intersection, hostname/context validation, descriptor/rewrite ownership markers, file reconciliation. |
| `src/fork/module/Tomcat/ServerXML.ts` | Pure-ish `server.xml` reconciliation plus the single `reconcileTomcatBase()` entry point. |
| `src/fork/module/Tomcat/index.ts` | `saveSite()` fork endpoint; initializes the target CATALINA_BASE and rolls host/config state back on a failed reconciliation. |
| `src/fork/module/Host/index.ts` | Retains generic host-list persistence; invokes Tomcat validation and automatic certificate generation for the Tomcat branch only. |
| `src/render/components/Tomcat/setup.ts` | Awaits and resolves the same per-version CATALINA_BASE used by start and save. |
| `src/render/components/Host/Tomcat/TomcatSiteController.ts` | Module-local save/restart operation state, IPC listener lifetime, single-flight gate, UI store update, and hosts-file synchronization. |
| `src/render/components/Host/Tomcat/site.ts` | Renderer-local form types, defaults, hostname/context validation, and cloning helpers. |
| `src/render/components/Host/Tomcat/RewriteEditor.vue` | View-only rewrite-content editor. It never reads or writes a Tomcat file itself. |
| `src/render/components/Host/Tomcat/Edit.vue` | Drawer form for the primary hostname, multiple mappings, rewrite, certificate fields, and controller invocation. |
| `src/render/components/Host/Tomcat/ListTable.vue` | Routes delete and inline edits through the controller so no Tomcat mutation bypasses reconciliation. |
| `scripts/tomcat-site-test.ts` | Pure helper/validation regression tests. |
| `scripts/tomcat-site-save-test.ts` | Real temporary-CATALINA_BASE descriptor/rewrite reconciliation tests. |
| `scripts/tomcat-server-xml-test.ts` | Real XML reconciler regression tests, including RewriteValve and TLS ownership. |
| `scripts/renderer-operation-boundaries-test.ts` | Controller registration and save-operation contract tests. |

### State and operation contract

| Kind | Owner | Details |
| --- | --- | --- |
| Form input, mapping rows, field errors, drawer visibility | `Edit.vue` | May reset when its drawer unmounts. |
| Host record including `tomcat.contexts` and `tomcat.rewrite` | Existing encrypted Host list | This is existing host-domain persistence, not `config.setup`. |
| Save/restart in progress | `TomcatSiteController` singleton bound with `reactiveBind` | Starts on add/edit/delete; `code: 200` is progress only; terminal success/failure clears it. |
| Context descriptor/rewrite/server.xml files and actual process liveness | Tomcat fork module and `ModuleInstalledItem` | The controller never treats a loading flag as process liveness and calls only `restart()`. |

No exception to the FlyEnv module-boundary constraints is authorized or required: do not add a Pinia store, do not add module data to `config.setup`, and do not add a module-specific start/stop lifecycle API.

### Saved site shape

The shared `AppHost` interface must not gain Tomcat-only properties. Persist the following opaque property only on `type: 'tomcat'` host records and use Tomcat-local intersection types at both boundaries:

```ts
type TomcatContextMapping = {
  id: string
  path: string
  docBase: string
}

type TomcatSiteConfig = {
  contexts: TomcatContextMapping[]
  rewrite: {
    enabled: boolean
    content: string
  }
}
```

`root` remains the Tomcat Host `appBase`. External directories/WARs and custom paths use explicit Context descriptors. A direct appBase child is also valid when its requested path is exactly Tomcat's natural deployment path (`portal` to `/portal`, `ROOT` to `/`, including WARs); it is auto-deployed without a FlyEnv descriptor. appBase itself, nested children, and mismatched paths remain invalid.

### Generated-file ownership rules

- Context descriptor: first line is `<!-- FlyEnv Tomcat Context site=<site-id> context=<context-id> -->`; the only element is `<Context docBase="..." />`. The descriptor filename determines its path, so no `path` attribute is emitted.
- Rewrite file: first line is `# FlyEnv Tomcat Rewrite site=<site-id>`.
- `server.xml` elements owned by FlyEnv retain `appFlag="FlyEnv"`; manual Host, Valve, Connector, SNI configuration, Context descriptor, and rewrite file are preserved.
- `/` maps to `ROOT.xml`; `/api/v1` maps to `api#v1.xml`. Only a validated context path is ever converted into a filename.

### Commits

Commit after each green, focused task. Do not commit `/Users/x/Desktop/www/flyenv-tomcat-test` from this repository; it is a separate user workspace and its documentation change must be reviewed and committed there independently if desired.

---

### Task 1: Add pure Tomcat site types, validation, and descriptor-name coverage

**Files:**

- Create: `scripts/tomcat-site-test.ts`
- Create: `src/fork/module/Tomcat/Site.ts`

- [ ] **Step 1: Write the failing validation and filename test**

Create `scripts/tomcat-site-test.ts`. Use a unique temporary directory, create an empty appBase, an external exploded app directory, and an external `openmrs.war`. Exercise the public helpers that do not yet exist:

```ts
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  contextDescriptorName,
  tomcatHostName,
  validateTomcatSite
} from '../src/fork/module/Tomcat/Site'

const root = await mkdtemp(join(tmpdir(), 'flyenv-tomcat-site-'))
const appBase = join(root, 'appBase')
const exploded = join(root, 'applications', 'portal')
const war = join(root, 'artifacts', 'openmrs.war')
await mkdir(appBase, { recursive: true })
await mkdir(exploded, { recursive: true })
await mkdir(join(root, 'artifacts'), { recursive: true })
await writeFile(war, 'not-a-real-war')

assert.equal(contextDescriptorName('/'), 'ROOT.xml')
assert.equal(contextDescriptorName('/openmrs'), 'openmrs.xml')
assert.equal(contextDescriptorName('/api/v1'), 'api#v1.xml')
assert.throws(() => contextDescriptorName('openmrs'), /start with "\/"/)
assert.throws(() => contextDescriptorName('/api//v1'), /empty segment/)
assert.throws(() => contextDescriptorName('/api/../v1'), /unsafe segment/)
assert.throws(() => contextDescriptorName('/api#v1'), /unsafe character/)
assert.throws(() => contextDescriptorName('/api\\v1'), /unsafe character/)
assert.throws(() => contextDescriptorName('/api?v=1'), /unsafe character/)

const site: any = {
  id: 9,
  type: 'tomcat',
  name: 'openmrs.test',
  root: appBase,
  useSSL: false,
  autoSSL: false,
  ssl: { cert: '', key: '' },
  port: { tomcat: 8080, tomcat_ssl: 8443 },
  tomcat: {
    contexts: [
      { id: 'root', path: '/', docBase: exploded },
      { id: 'openmrs', path: '/openmrs', docBase: war }
    ],
    rewrite: { enabled: false, content: '' }
  }
}

assert.equal(tomcatHostName(site), 'openmrs.test')
await validateTomcatSite(site, [])

await assert.rejects(
  () =>
    validateTomcatSite(
      {
        ...site,
        tomcat: {
          ...site.tomcat,
          contexts: [
            { id: 'one', path: '/same', docBase: exploded },
            { id: 'two', path: '/same', docBase: war }
          ]
        }
      },
      []
    ),
  /duplicate Context path/
)
await assert.rejects(
  () =>
    validateTomcatSite(
      {
        ...site,
        tomcat: { ...site.tomcat, contexts: [{ id: 'inside', path: '/inside', docBase: appBase }] }
      },
      []
    ),
  /outside appBase/
)
await assert.rejects(
  () =>
    validateTomcatSite(
      {
        ...site,
        tomcat: {
          ...site.tomcat,
          contexts: [{ id: 'file', path: '/file', docBase: join(root, 'README.txt') }]
        }
      },
      []
    ),
  /directory or a \.war file/
)
await assert.rejects(
  () => validateTomcatSite(site, [{ ...site, id: 10, name: 'other.test' }]),
  /already belongs to another Tomcat site/
)

await rm(root, { recursive: true, force: true })
console.log('tomcat site validation tests passed')
```

- [ ] **Step 2: Run the test and confirm the expected red failure**

Run: `yarn tsx scripts/tomcat-site-test.ts`

Expected: TypeScript fails because `src/fork/module/Tomcat/Site.ts` and its three exported helpers do not exist.

- [ ] **Step 3: Add the Tomcat-only type and validation implementation**

Create `src/fork/module/Tomcat/Site.ts` with these exported types and helper contracts. Use `node:path` `isAbsolute`, `relative`, and `resolve`, `fs-extra` `realpath`/`stat` through `../../Fn`, and `AppHost` only as an intersection base:

```ts
export type TomcatContextMapping = { id: string; path: string; docBase: string }
export type TomcatSiteConfig = {
  contexts: TomcatContextMapping[]
  rewrite: { enabled: boolean; content: string }
}
export type TomcatSiteHost = AppHost & { tomcat?: TomcatSiteConfig }

export const tomcatSiteConfig = (host: TomcatSiteHost): TomcatSiteConfig => ({
  contexts: host.tomcat?.contexts ?? [],
  rewrite: host.tomcat?.rewrite ?? { enabled: false, content: '' }
})
```

Implement `tomcatHostName(host)` by trimming and lowercasing `host.name`. Implement `validateContextPath(path)` with these exact rules:

```ts
if (path === '/') return '/'
if (!path.startsWith('/')) throw new Error('Context path must start with "/"')
if (path.includes('//')) throw new Error('Context path cannot contain an empty segment')
if (/[\\?#\s]/.test(path)) throw new Error('Context path contains an unsafe character')
const segments = path.slice(1).split('/')
if (segments.some((segment) => segment === '.' || segment === '..')) {
  throw new Error('Context path contains an unsafe segment')
}
if (segments.some((segment) => !/^[A-Za-z0-9._~-]+$/.test(segment))) {
  throw new Error('Context path contains an unsafe character')
}
return path
```

Implement `contextDescriptorName(path)` by first calling `validateContextPath`; return `ROOT.xml` for `/`, otherwise `${path.slice(1).replaceAll('/', '#')}.xml`.

Implement asynchronous `validateTomcatSite(host, existing)` to reject a missing/non-absolute/non-directory `host.root`, duplicate normalized Context paths, an empty/non-absolute/nonexistent `docBase`, any non-directory docBase that does not end in `.war` case-insensitively, and a resolved docBase inside the resolved appBase. Use `relative(appBase, docBase)` and reject when the relative result is empty or does not begin with `..` and is not absolute. Reject a primary hostname collision with any other Tomcat record; exclude the same `id`. Do not validate the TLS certificate here yet—automatic certificate generation occurs first in Task 4.

- [ ] **Step 4: Re-run the focused test and inspect the result**

Run: `yarn tsx scripts/tomcat-site-test.ts`

Expected: `tomcat site validation tests passed`.

- [ ] **Step 5: Commit the green validation unit**

```bash
git add src/fork/module/Tomcat/Site.ts scripts/tomcat-site-test.ts
git commit -m "feat: validate Tomcat site context mappings"
```

### Task 2: Reconcile owned Context descriptors and host rewrite files

**Files:**

- Modify: `src/fork/module/Tomcat/Site.ts`
- Create: `scripts/tomcat-site-save-test.ts`

- [ ] **Step 1: Write the failing real-filesystem reconciliation test**

Create `scripts/tomcat-site-save-test.ts`. Build a temporary `conf/Catalina` tree and call a not-yet-exported `reconcileTomcatSiteFiles(catalinaBase, hosts)`. The test must prove all of these ownership cases with real files:

```ts
assert.equal(
  await readFile(join(base, 'conf/Catalina/openmrs.test/ROOT.xml'), 'utf8'),
  '<!-- FlyEnv Tomcat Context site=9 context=root -->\n<Context docBase="' + exploded + '" />\n'
)
assert.equal(
  await readFile(join(base, 'conf/Catalina/openmrs.test/api#v1.xml'), 'utf8'),
  '<!-- FlyEnv Tomcat Context site=9 context=api -->\n<Context docBase="' + war + '" />\n'
)
assert.equal(
  await readFile(join(base, 'conf/Catalina/www.openmrs.test/rewrite.config'), 'utf8'),
  '# FlyEnv Tomcat Rewrite site=9\nRewriteRule ^/$ /openmrs/ [R=302,L]\n'
)
```

Before the first reconciliation, create an unmarked `manual.xml` in `openmrs.test` and assert it remains after it. Reconcile a site renamed to `portal.test`; assert all marked site-9 descriptors and rewrite files disappear from the former hostname directory, while the manual descriptor remains. Then create an unmarked `conf/Catalina/portal.test/rewrite.config`, enable rewrite, and assert the operation rejects `/user-managed rewrite.config/` without changing the manual file. Add a final disable-rewrite pass with a FlyEnv-marked file and assert that only the marked file is removed.

Use fixed context IDs `root` and `api`, `id: 9`, an exploded directory and real `.war` test file outside `root`, so the expected marker/file names are deterministic.

- [ ] **Step 2: Run the reconciliation test and confirm red**

Run: `yarn tsx scripts/tomcat-site-save-test.ts`

Expected: FAIL because `reconcileTomcatSiteFiles` is not exported.

- [ ] **Step 3: Implement descriptor and rewrite reconciliation without touching user files**

Add these exports to `Site.ts`:

```ts
export const contextMarker = (siteId: number, contextId: string) =>
  `<!-- FlyEnv Tomcat Context site=${siteId} context=${contextId} -->`
export const rewriteMarker = (siteId: number) => `# FlyEnv Tomcat Rewrite site=${siteId}`
const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;'
      })[character]!
  )
export const reconcileTomcatSiteFiles = async (
  catalinaBase: string,
  hosts: TomcatSiteHost[]
): Promise<void> => {
  const root = join(catalinaBase, 'conf', 'Catalina')
  await mkdirp(root)
  const desiredDescriptors = new Map<string, string>()
  const desiredRewrites = new Map<string, string>()
  for (const host of hosts) {
    await validateTomcatSite(host, hosts)
    const hostDir = join(root, tomcatHostName(host))
    for (const context of tomcatSiteConfig(host).contexts) {
      const file = join(hostDir, contextDescriptorName(context.path))
      desiredDescriptors.set(
        file,
        `${contextMarker(host.id, context.id)}\n<Context docBase="${escapeXml(context.docBase)}" />\n`
      )
    }
    if (tomcatSiteConfig(host).rewrite.enabled) {
      desiredRewrites.set(
        join(hostDir, 'rewrite.config'),
        `${rewriteMarker(host.id)}\n${tomcatSiteConfig(host)
          .rewrite.content.replace(/\r\n/g, '\n')
          .replace(/\n*$/, '\n')}`
      )
    }
  }
  // Preflight all rewrite conflicts before removing any owned file.
  // Then scan and mutate only files carrying FlyEnv's exact ownership marker.
  for (const directory of await readdir(root)) {
    const hostDir = join(root, directory)
    if (!(await stat(hostDir)).isDirectory()) continue
    const rewriteFile = join(hostDir, 'rewrite.config')
    if (existsSync(rewriteFile) && desiredRewrites.has(rewriteFile)) {
      const first = (await readFile(rewriteFile, 'utf-8'))
        .split(/\r?\n/)
        .find((line) => line.trim())
      if (first && !/^# FlyEnv Tomcat Rewrite site=\d+$/.test(first)) {
        throw new Error(`Tomcat site has a user-managed rewrite.config: ${rewriteFile}`)
      }
    }
  }
  for (const directory of await readdir(root)) {
    const hostDir = join(root, directory)
    if (!(await stat(hostDir)).isDirectory()) continue
    for (const fileName of await readdir(hostDir)) {
      const file = join(hostDir, fileName)
      if (fileName.endsWith('.xml')) {
        const first = (await readFile(file, 'utf-8')).split(/\r?\n/, 1)[0]
        if (
          /^<!-- FlyEnv Tomcat Context site=\d+ context=[A-Za-z0-9]+ -->$/.test(first) &&
          !desiredDescriptors.has(file)
        ) {
          await remove(file)
        }
      } else if (fileName === 'rewrite.config') {
        const first = (await readFile(file, 'utf-8')).split(/\r?\n/).find((line) => line.trim())
        if (/^# FlyEnv Tomcat Rewrite site=\d+$/.test(first ?? '') && !desiredRewrites.has(file)) {
          await remove(file)
        }
      }
    }
  }
  for (const [file, content] of desiredDescriptors) {
    await mkdirp(dirname(file))
    await writeFile(file, content)
  }
  for (const [file, content] of desiredRewrites) {
    await mkdirp(dirname(file))
    await writeFile(file, content)
  }
}
```

Use `join(catalinaBase, 'conf', 'Catalina')` as the sole descriptor root. First construct a complete desired map keyed by `<host-name>/<descriptor-file>` and a complete desired rewrite map keyed by `<host-name>`. Render each descriptor exactly as:

```ts
;`${contextMarker(host.id, context.id)}\n<Context docBase="${escapeXml(docBase)}" />\n`
```

Render an enabled rewrite file exactly as:

```ts
;`${rewriteMarker(host.id)}\n${rewrite.content.replace(/\r\n/g, '\n').replace(/\n*$/, '\n')}`
```

Before writing or removing anything, scan every immediate child directory under `conf/Catalina` and detect unmarked `rewrite.config` files. If a desired rewrite key has an existing file whose first non-empty line is not its exact site marker, throw `new Error('Tomcat site has a user-managed rewrite.config: <path>')`. This preflight prevents a conflicting save from removing an older managed descriptor or rewrite file.

After preflight, scan all `.xml` descriptor files and remove only files whose first line matches `/^<!-- FlyEnv Tomcat Context site=(\\d+) context=([A-Za-z0-9]+) -->$/` and whose full path is absent from the desired descriptor map. Scan `rewrite.config` in each descriptor directory and remove it only when the first non-empty line matches `/^# FlyEnv Tomcat Rewrite site=\\d+$/` and its directory is absent from the desired rewrite map. Leave every unmarked descriptor and rewrite file untouched. Finally `mkdirp(dirname(file))` and write every desired descriptor/rewrite content. This global owned-file scan makes add, delete, and primary-hostname rename safe without requiring a stale `old` host list.

Reject a context id unless it matches `/^[A-Za-z0-9]+$/` before constructing a marker. Escape XML attribute values with `&amp;`, `&quot;`, `&lt;`, `&gt;`, and `&apos;`. Call `validateTomcatSite(host, hosts)` before rendering each desired host so malformed persisted data cannot generate a filename.

- [ ] **Step 4: Run file-reconciliation coverage and the pure helper suite**

```bash
yarn tsx scripts/tomcat-site-save-test.ts
yarn tsx scripts/tomcat-site-test.ts
```

Expected: both scripts print their pass messages.

- [ ] **Step 5: Commit the owned-file reconciler**

```bash
git add src/fork/module/Tomcat/Site.ts scripts/tomcat-site-save-test.ts
git commit -m "feat: reconcile Tomcat context and rewrite files"
```

### Task 3: Replace incremental Tomcat XML mutation with owned Host, Valve, and TLS reconciliation

**Files:**

- Modify: `scripts/tomcat-server-xml-test.ts`
- Modify: `src/fork/module/Tomcat/ServerXML.ts`

- [ ] **Step 1: Replace the narrow XML test with failing ownership and TLS cases**

Extend `scripts/tomcat-server-xml-test.ts` to parse `makeTomcatServerXML()` output and assert these cases:

```ts
assert.equal(flyEnvHost.unpackWARs, 'true')
assert.equal(flyEnvHost.deployOnStartup, 'true')
assert.equal(flyEnvHost.autoDeploy, 'true')
assert.equal(flyEnvHost.Context, undefined)
assert.equal(flyEnvRewriteValve.appFlag, 'FlyEnv')
assert.equal(flyEnvRewriteValve.className, 'org.apache.catalina.valves.rewrite.RewriteValve')
assert.ok(manualRewriteValve)
```

Use one site with primary hostname `a.test`, rewrite enabled, `tomcat_ssl: 8443`, and cert/key `/certs/a.crt`/`/certs/a.key`; add a second SSL site on the same port named `b.test` with `/certs/b.crt`/`/certs/b.key`. Assert that the FlyEnv HTTPS Connector has:

```ts
assert.equal(connector.appFlag, 'FlyEnv')
assert.equal(connector.SSLEnabled, 'true')
assert.equal(connector.scheme, 'https')
assert.equal(connector.secure, 'true')
assert.equal(connector.defaultSSLHostConfigName, '_default_')
```

Assert its marked `SSLHostConfig` records include `_default_`, `a.test`, `www.a.test`, and `b.test`, that the default certificate is from lexicographically first primary host `a.test`, and each named host has its own corresponding cert/key. Feed output back into the builder with `a.test` certificate paths changed and assert the existing marked named config now has the new paths. Then disable rewrite and SSL for `a.test`; assert its FlyEnv RewriteValve and SNI records disappear, a user-owned RewriteValve and a user-owned `SSLHostConfig hostName="manual.test"` remain, and no stale FlyEnv record remains.

Add an input with a user-owned HTTPS Connector on port 9443 plus an SSL FlyEnv site on 9443 and assert `makeTomcatServerXML()` throws `/user-managed HTTPS Connector/`. Keep the existing regression that a manual `<Context path="" docBase="">` is not altered, while a FlyEnv inline empty Context is removed.

- [ ] **Step 2: Run the updated XML suite and confirm red**

Run: `yarn tsx scripts/tomcat-server-xml-test.ts`

Expected: FAIL on missing `deployOnStartup`, RewriteValve, `secure`, marked default SNI configuration, and certificate replacement behavior.

- [ ] **Step 3: Add stable XML shape helpers and desired Tomcat records**

Refactor `ServerXML.ts` instead of extending the existing per-host `handlePort` loop. Retain the existing parser/builder options, then add:

```ts
const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value]

const setArrayOrDelete = (object: Record<string, any>, key: string, values: any[]) => {
  if (values.length === 0) delete object[key]
  else object[key] = values
}
```

Build `tomcatHosts = hostAll.filter((host) => host.type === 'tomcat') as TomcatSiteHost[]` and use `tomcatHostName(host)` everywhere a Host name is needed. For each primary hostname, create or update only `appFlag="FlyEnv"` Hosts with:

```ts
{
  name,
  appBase: host.root,
  appFlag: 'FlyEnv',
  unpackWARs: 'true',
  deployOnStartup: 'true',
  autoDeploy: 'true'
}
```

Retain an existing FlyEnv `AccessLogValve`, or add one using the present log-directory/prefix convention. Explicitly delete only the old FlyEnv inline empty Context as the prior regression requires; do not create any inline Context and do not modify a nonempty/manual Context.

For each generated Host use `tomcatSiteConfig(host).rewrite.enabled` to add exactly one marked RewriteValve, and on disabled/remove filter only valves where both `appFlag === 'FlyEnv'` and `className === 'org.apache.catalina.valves.rewrite.RewriteValve'`. Leave every other Valve untouched, including manually configured rewrite valves.

- [ ] **Step 4: Reconcile marked HTTP and HTTPS connectors**

Build desired HTTP ports from every Tomcat host's `port.tomcat ?? 80`. Add a marked HTTP connector only when no connector already uses that port; preserve a user-owned HTTP connector at an already-serving port. Remove marked non-SSL HTTP connectors that have no desired HTTP port.

Build desired TLS groups only from sites with `useSSL === true` and non-empty cert/key paths, grouping by `port.tomcat_ssl ?? 443`. Before mutation, if any desired TLS port has a connector that lacks `appFlag="FlyEnv"`, throw:

```ts
throw new Error(`Tomcat site conflicts with a user-managed HTTPS Connector on port ${port}`)
```

For a new marked connector, use these required attributes:

```ts
{
  appFlag: 'FlyEnv',
  port: String(port),
  protocol: 'org.apache.coyote.http11.Http11NioProtocol',
  maxThreads: '150',
  SSLEnabled: 'true',
  scheme: 'https',
  secure: 'true',
  defaultSSLHostConfigName: '_default_'
}
```

For every TLS group, sort sites by primary `host.name`; select the first as the deterministic default. Reconcile only marked `SSLHostConfig` records to the desired map: `_default_` gets the selected primary cert/key, and every primary name gets a named record with that site's cert/key. Each record has `appFlag: 'FlyEnv'`, `hostName`, `sslProtocol: 'TLS'`, `certificateVerification: 'false'`, and a `Certificate` child with `certificateFile`, `certificateKeyFile`, and `type: 'RSA'`. Update a marked record's certificate values even when it already exists. Remove marked SNI records that are not in the desired map; do not alter unmarked records. Use `asArray()` for both `Connector` and `SSLHostConfig`, so singleton input cannot cause `.find`/`.push` failures.

When no FlyEnv site needs a marked TLS connector, remove it only if every `SSLHostConfig` it contains is marked FlyEnv; otherwise preserve the connector and remove only its marked SNI records. This avoids deleting a user-added SNI configuration from an existing FlyEnv connector.

- [ ] **Step 5: Run the red-green XML suite and adjacent regression**

```bash
yarn tsx scripts/tomcat-server-xml-test.ts
yarn tsx scripts/host-qrcode-url-test.ts
```

Expected: both scripts pass, including the old QR URL behavior.

- [ ] **Step 6: Commit the XML reconciler**

```bash
git add src/fork/module/Tomcat/ServerXML.ts scripts/tomcat-server-xml-test.ts
git commit -m "fix: reconcile Tomcat rewrite and SSL configuration"
```

### Task 4: Unify CATALINA_BASE reconciliation and make Tomcat host saves authoritative

**Files:**

- Modify: `src/fork/module/Tomcat/ServerXML.ts`
- Modify: `src/fork/module/Host/index.ts`
- Modify: `src/fork/module/Tomcat/index.ts`
- Modify: `scripts/tomcat-site-save-test.ts`

- [ ] **Step 1: Add failing save-endpoint and startup source assertions**

Extend `scripts/tomcat-site-save-test.ts` to read source files and assert:

```ts
assert.match(
  tomcatSource,
  /saveSite\(version: SoftInstalled, catalinaBase: string, host: AppHost, flag: 'add' \| 'edit' \| 'del', old\?: AppHost\)/
)
assert.match(tomcatSource, /await this\._initDefaultDir\(version, catalinaBase\)/)
assert.match(tomcatSource, /await reconcileTomcatBase\(catalinaBase, hostList\)/)
assert.match(tomcatSource, /await saveHostList\(before\)/)
assert.match(hostSource, /validateTomcatSite\(host as TomcatSiteHost, hostList\)/)
assert.match(hostSource, /await updateAutoSSL\(host, old \?\? \(\{\} as AppHost\)\)/)
assert.match(tomcatSource, /await reconcileTomcatBase\(baseDir\)/)
```

Add a runtime temporary-base case: write a minimal `conf/server.xml`, call `reconcileTomcatBase(base, [site])`, and assert that the same call writes `server.xml`, descriptor files, and rewrite configuration. This ensures ordinary startup and explicit save use exactly one reconciler.

- [ ] **Step 2: Run the endpoint test and confirm red**

Run: `yarn tsx scripts/tomcat-site-save-test.ts`

Expected: source assertions fail because `saveSite` and `reconcileTomcatBase` do not exist.

- [ ] **Step 3: Make `reconcileTomcatBase` the sole configuration entry point**

In `ServerXML.ts`, export:

```ts
export const reconcileTomcatBase = async (
  catalinaBase: string,
  suppliedHosts?: AppHost[]
): Promise<void> => {
  const hosts = suppliedHosts ?? (await fetchHostList())
  const tomcatHosts = hosts.filter((host) => host.type === 'tomcat') as TomcatSiteHost[]
  const configFile = join(catalinaBase, 'conf', 'server.xml')
  let content = await readFile(configFile, 'utf-8')
  content = content.replaceAll('PhpWebStudy', 'FlyEnv')
  const defaultFile = join(catalinaBase, 'conf', 'server.xml.default')
  if (!existsSync(defaultFile)) await writeFile(defaultFile, content)
  await reconcileTomcatSiteFiles(catalinaBase, tomcatHosts)
  await writeFile(configFile, makeTomcatServerXML(join(catalinaBase, 'conf'), content, tomcatHosts))
}
```

Keep `makeGlobalTomcatServerXML(version)` as a small compatibility wrapper that calls `reconcileTomcatBase(version.path)`. Update `_startServer()` to call `reconcileTomcatBase(baseDir)` directly after `_initDefaultDir`. Remove `makeCustomTomcatServerXML()` because repository search shows no caller and retaining a second config-copy/generation path would allow Context/rewrite behavior to diverge.

- [ ] **Step 4: Validate Tomcat saves and issue automatic certificates before persistence**

In `Host.handleHost()`, before the mutation `switch`, add a Tomcat-only add/edit branch:

```ts
if ((flag === 'add' || flag === 'edit') && host.type === 'tomcat') {
  await validateTomcatSite(host as TomcatSiteHost, hostList)
  await updateAutoSSL(host, old ?? ({} as AppHost))
  if (host.useSSL && (!host.ssl?.cert || !host.ssl?.key)) {
    throw new Error('Tomcat SSL requires a certificate and private key')
  }
}
```

Do not add Tomcat to the normal Nginx/Apache/Caddy/FrankenPHP vhost generator. On a Tomcat edit, do not call `_delVhost(old)`, because that legacy branch removes the prior CA directory after `updateAutoSSL()` has prepared the new certificate. On Tomcat delete, retain only automatic-CA cleanup (when `host.autoSSL` is true) and let the Tomcat reconciler remove Context/rewrite/server.xml records. On an edit from automatic SSL to manual/no SSL, remove the old automatic CA directory after the new record is persisted; do not delete an arbitrary CA directory for a manual certificate.

- [ ] **Step 5: Add the fork save endpoint with rollback**

Import `Host` from `../Host`, `fetchHostList`/`saveHostList`, `AppHost`, and `reconcileTomcatBase` in `Tomcat/index.ts`. Add this public fork method:

```ts
saveSite(
  version: SoftInstalled,
  catalinaBase: string,
  host: AppHost,
  flag: 'add' | 'edit' | 'del',
  old?: AppHost
) {
  return new ForkPromise(async (resolve, reject, on) => {
    const before = await fetchHostList()
    try {
      await this._initDefaultDir(version, catalinaBase).on(on)
      const result: any = await Host.handleHost(host, flag, old)
      const hostList: AppHost[] = result.host
      await reconcileTomcatBase(catalinaBase, hostList)
      resolve({ host: hostList })
    } catch (error) {
      try {
        await saveHostList(before)
        await reconcileTomcatBase(catalinaBase, before)
      } catch (rollbackError) {
        console.error('Tomcat site rollback failed', rollbackError)
      }
      reject(error)
    }
  })
}
```

Use the existing `Host` singleton default export; do not duplicate the license, shared-host, or auto-SSL policy. The rollback is best effort for host list and generated configuration; report the original reconciliation error. The renderer calls this endpoint for all add/edit/delete operations.

- [ ] **Step 6: Run focused fork/configuration suites**

```bash
yarn tsx scripts/tomcat-site-test.ts
yarn tsx scripts/tomcat-site-save-test.ts
yarn tsx scripts/tomcat-server-xml-test.ts
```

Expected: all three pass.

- [ ] **Step 7: Commit the unified save/reconciliation path**

```bash
git add src/fork/module/Tomcat/ServerXML.ts src/fork/module/Tomcat/index.ts src/fork/module/Host/index.ts scripts/tomcat-site-save-test.ts
git commit -m "feat: save Tomcat sites through one reconciler"
```

### Task 5: Make CATALINA_BASE resolution awaitable and shared by start/save

**Files:**

- Modify: `src/render/components/Tomcat/setup.ts`
- Modify: `src/render/components/Tomcat/aside.vue`
- Modify: `src/render/components/Tomcat/Index.vue`
- Create: `scripts/tomcat-renderer-setup-test.ts`

- [ ] **Step 1: Write failing CATALINA_BASE contract checks**

Create `scripts/tomcat-renderer-setup-test.ts` that reads the three files and asserts:

```ts
assert.match(setup, /init: \(\) => Promise<void>/)
assert.match(setup, /export const tomcatCatalinaBase = \(version: SoftInstalled\)/)
assert.match(setup, /export const tomcatDefaultCatalinaBase = \(version: SoftInstalled\)/)
assert.match(aside, /await TomcatSetup\.init\(\)/)
assert.match(aside, /resolve\(\[tomcatCatalinaBase\(version\)\]\)/)
assert.match(index, /tomcatCatalinaBase\(currentVersion\.value\)/)
```

- [ ] **Step 2: Run the setup contract test and confirm red**

Run: `yarn tsx scripts/tomcat-renderer-setup-test.ts`

Expected: FAIL because `TomcatSetup.init()` returns `void` and the two helpers do not exist.

- [ ] **Step 3: Implement an idempotent localForage load and shared resolver**

Change the exported setup type so `init(): Promise<void>`. Keep one module-scoped `let initPromise: Promise<void> | undefined`; the first call reads `flyenv-tomcat-server-root`, replaces `TomcatSetup.CATALINA_BASE` with a reactive copy when data exists, and resolves even when localForage rejects. Subsequent calls return the same promise.

Add:

```ts
export const tomcatDefaultCatalinaBase = (version: SoftInstalled) => {
  const major = version.version?.split('.').shift() ?? ''
  return join(window.Server.BaseDir!, `tomcat/tomcat${major}`)
}

export const tomcatCatalinaBase = (version: SoftInstalled) =>
  TomcatSetup.CATALINA_BASE[version.bin] ?? tomcatDefaultCatalinaBase(version)
```

Import `SoftInstalled` and browser `join` in `setup.ts`. In `aside.vue`, call `TomcatSetup.init().catch()` during setup and make `startExtParam` await `TomcatSetup.init()` before resolving `[tomcatCatalinaBase(version)]`. In `Index.vue`, call `TomcatSetup.init().catch()` and use `tomcatCatalinaBase(currentVersion.value)` in the computed getter; keep its setter storing by `version.bin` and calling `TomcatSetup.save()`.

- [ ] **Step 4: Run the contract test**

Run: `yarn tsx scripts/tomcat-renderer-setup-test.ts`

Expected: `tomcat renderer setup tests passed`.

- [ ] **Step 5: Commit shared CATALINA_BASE resolution**

```bash
git add src/render/components/Tomcat/setup.ts src/render/components/Tomcat/aside.vue src/render/components/Tomcat/Index.vue scripts/tomcat-renderer-setup-test.ts
git commit -m "refactor: share Tomcat CATALINA_BASE resolution"
```

### Task 6: Add a module-local Tomcat save/restart controller with real single-flight tests

**Files:**

- Create: `src/render/components/Host/Tomcat/TomcatSiteController.ts`
- Modify: `scripts/renderer-operation-boundaries-test.ts`
- Create: `scripts/tomcat-site-controller-test.ts`

- [ ] **Step 1: Write the failing controller behavior test**

Create `scripts/tomcat-site-controller-test.ts` and import a not-yet-existing exported `TomcatSiteSaveOperation`. Construct it with injected async `persist`, `applyHosts`, `writeHosts`, and `restart` functions. Verify all operation contract behaviors with the real class:

```ts
let releasePersist!: (value: { host: any[] }) => void
let persistCalls = 0
let restartCalls = 0
const operation = new TomcatSiteSaveOperation({
  persist: () =>
    new Promise((resolve) => {
      persistCalls += 1
      releasePersist = resolve
    }),
  applyHosts: () => {},
  writeHosts: async () => true,
  restart: async () => {
    restartCalls += 1
    return true
  }
})
const first = operation.save({ wasRunning: true } as any)
assert.equal(operation.saving.value, true)
assert.equal(await operation.save({ wasRunning: true } as any), false)
assert.equal(persistCalls, 1)
releasePersist({ host: [] })
assert.equal(await first, true)
assert.equal(restartCalls, 1)
assert.equal(operation.saving.value, false)

const stopped = new TomcatSiteSaveOperation({
  persist: async () => ({ host: [] }),
  applyHosts: () => {},
  writeHosts: async () => true,
  restart: async () => {
    throw new Error('must not restart')
  }
})
assert.equal(await stopped.save({ wasRunning: false } as any), true)
assert.equal(stopped.saving.value, false)

const failing = new TomcatSiteSaveOperation({
  persist: async () => {
    throw new Error('descriptor conflict')
  },
  applyHosts: () => {},
  writeHosts: async () => true,
  restart: async () => true
})
assert.equal(await failing.save({ wasRunning: false } as any), false)
assert.equal(failing.saving.value, false)
assert.equal(await failing.save({ wasRunning: false } as any), false)
```

Also source-assert that the controller's IPC response handler returns immediately on `res?.code === 200`, only calls `IPC.off(key)` for a terminal response, and exports `default reactiveBind(new TomcatSiteController())`.

- [ ] **Step 2: Run the controller test and confirm red**

Run: `yarn tsx scripts/tomcat-site-controller-test.ts`

Expected: FAIL because the controller file and `TomcatSiteSaveOperation` do not exist.

- [ ] **Step 3: Implement the testable operation and the production controller**

In `TomcatSiteController.ts`, define a narrow request type containing an immutable `host`, `old`, `flag`, `version`, `catalinaBase`, and `wasRunning`. Define `TomcatSiteSaveOperation` with:

```ts
readonly saving = ref(false)
readonly phase = ref<'idle' | 'saving' | 'restarting' | 'failed'>('idle')
private flight: Promise<boolean> | undefined
```

Its `save(request)` returns `false` immediately when `saving` is true. Otherwise set `saving`/`phase`, await injected `persist`, call `applyHosts(result.host)`, await `writeHosts()`, and only when `request.wasRunning` is true set `phase` to `restarting` and await injected `restart()`. Treat a string restart result as a failure. In a `finally`, clear `flight` and `saving`; set `phase` to `idle` on success and `failed` on every failure. The promise must be cleared after every terminal path so a failure can be retried.

Have `TomcatSiteController` construct that operation with production dependencies. Resolve the version as the running Tomcat installed item first, otherwise `BrewStore().currentVersion('tomcat')`; if neither exists show `I18nT('base.needSelectVersion')` and return false. Await `TomcatSetup.init()`, compute `tomcatCatalinaBase(version)`, clone `host` and `old` with JSON, and set `wasRunning` from the selected version's `run` flag before sending IPC.

Wrap `IPC.send('app-fork:tomcat', 'saveSite', versionSnapshot, catalinaBase, host, flag, old)` in a terminal-only promise. On `code === 200`, retain the listener and return. On `code === 0`, `IPC.off(key)` and resolve `res.data`; otherwise `IPC.off(key)` and reject `new Error(res?.msg ?? I18nT('base.fail'))`. On success call `AppStore().UPDATE_HOSTS(hosts)`, `HostStore.updateCurrentList()`, and `handleWriteHosts()`—do not call `handleHost()` or `reloadWebServer()`. Show success only after an optional restart finishes; show an error on config, hosts-sync, or restart failure. Export the reactive singleton exactly as:

```ts
export default reactiveBind(new TomcatSiteController())
```

- [ ] **Step 4: Register the operation boundary with a meaningful state field**

In `scripts/renderer-operation-boundaries-test.ts`, replace the hard-coded `opening` expectation in the controller registry with a `stateName` field. Existing entries use `stateName: 'opening'`; add:

```ts
{
  page: 'Host/Tomcat/Edit.vue',
  controller: 'Host/Tomcat/TomcatSiteController.ts',
  instance: 'tomcatSiteController',
  className: 'TomcatSiteController',
  stateName: 'saving'
}
```

Use `new RegExp('readonly ' + registration.stateName + ' = ref\\(false\\)')` for the state assertion. Add source assertions for `code === 200`, terminal `IPC.off`, `restart()`, the stopped-service condition, and `finally` cleanup.

- [ ] **Step 5: Run controller and operation-boundary tests**

```bash
yarn tsx scripts/tomcat-site-controller-test.ts
yarn test:renderer-operation-boundaries
yarn test:module-lifecycle-single-flight
```

Expected: all three pass.

- [ ] **Step 6: Commit the controller**

```bash
git add src/render/components/Host/Tomcat/TomcatSiteController.ts scripts/tomcat-site-controller-test.ts scripts/renderer-operation-boundaries-test.ts
git commit -m "feat: manage Tomcat site saves with one controller"
```

### Task 7: Add the multiple-Context and rewrite drawer form

**Files:**

- Create: `src/render/components/Host/Tomcat/site.ts`
- Create: `src/render/components/Host/Tomcat/RewriteEditor.vue`
- Modify: `src/render/components/Host/Tomcat/Edit.vue`
- Modify: `src/lang/en/host.json`
- Modify: `src/lang/zh/host.json`
- Create: `scripts/tomcat-site-drawer-test.ts`

- [ ] **Step 1: Write failing drawer/static-form coverage**

Create `scripts/tomcat-site-drawer-test.ts` that reads the three component files and both translation files. Assert all user-facing controls and safe routing exist:

```ts
assert.doesNotMatch(edit, /v-model="item\.alias"/)
assert.match(edit, /I18nT\('host\.tomcatContexts'\)/)
assert.match(edit, /v-for="\(context, index\) in tomcat\.contexts"/)
assert.match(edit, /v-model="context\.path"/)
assert.match(edit, /v-model="context\.docBase"/)
assert.match(edit, /chooseDocBase\(context\)/)
assert.match(edit, /<RewriteEditor v-model="tomcat\.rewrite\.content"/)
assert.match(edit, /v-model="tomcat\.rewrite\.enabled"/)
assert.match(edit, /tomcatSiteController\.save\(/)
assert.doesNotMatch(edit, /handleHost\()/)
assert.match(rewriteEditor, /defineModel<string>\(\{ required: true \}\)/)
assert.doesNotMatch(rewriteEditor, /readFile|writeFile|watchFile|IPC/)
for (const source of [en, zh]) assert.match(source, /"tomcatContexts"/)
```

- [ ] **Step 2: Run drawer coverage and confirm red**

Run: `yarn tsx scripts/tomcat-site-drawer-test.ts`

Expected: FAIL because no form helpers/editor/controller call exist.

- [ ] **Step 3: Add renderer-local form types and defaults**

Create `site.ts` with renderer-only counterparts to the fork shapes. Export `TomcatSiteFormHost`, `createTomcatSiteConfig()`, `cloneTomcatSiteHost()`, and `rendererContextPathError(path)`. Keep field names identical to Task 1 but do not import fork code into the renderer bundle. `createTomcatSiteConfig()` returns `{ contexts: [], rewrite: { enabled: false, content: '' } }`; `cloneTomcatSiteHost()` deep-clones and fills this default for older host records. Reuse the same safe context-path rules for immediate feedback, while preserving the fork as the authority for real filesystem validation.

- [ ] **Step 4: Add a view-only Rewrite editor**

Create `RewriteEditor.vue` as a compact controlled component:

```vue
<template>
  <el-input v-model="content" type="textarea" :rows="10" class="rewrite-editor" />
</template>

<script lang="ts" setup>
  const content = defineModel<string>({ required: true })
</script>
```

It owns no file path, watcher, IPC, or persistence logic. The caller decides whether the editor is visible/enabled.

- [ ] **Step 5: Update the drawer to edit all Tomcat site fields**

In `Edit.vue`, replace direct `handleHost()` use with `tomcatSiteController`. Initialize `item` from `cloneTomcatSiteHost(props.edit)` or a new host record that includes `tomcat: createTomcatSiteConfig()`. Keep `running`, if any, derived from `tomcatSiteController.saving`, not a page-owned async request.

Expose only the primary hostname field. Add an **Application mappings** section with an Add button and a row for every `tomcat.contexts` entry: Context path input, docBase input, a picker button, and Remove button. `addContext()` appends `{ id: uuid(), path: '/', docBase: '' }`; use the existing browser-safe UUID helper or a `Date.now()` plus random alphanumeric id that matches the fork marker constraint. `chooseDocBase(context)` invokes Electron dialog with `['openFile', 'openDirectory', 'showHiddenFiles']`; it only assigns the chosen absolute path to the row. Do not copy, unpack, chmod, or otherwise mutate the selected application.

Add a **Tomcat rewrite** switch bound to `tomcat.rewrite.enabled`, showing `<RewriteEditor v-model="tomcat.rewrite.content" />` only while enabled. Do not silently create a root Context when no mappings are present; zero Context mappings remains valid.

Extend `checkItem()` to validate hostname parsing, required existing UI fields, no duplicate primary hostname against any other Tomcat host, each context's renderer path validation, and required docBase. Keep the TLS field validation: a manually selected cert/key is required only when SSL is enabled and automatic SSL is disabled. Convert the primary hostname with `new URL()` as today, clone the payload, and call `await tomcatSiteController.save(payload, flag, props.edit)`. Close the drawer only when it returns `true`.

- [ ] **Step 6: Add English and Chinese labels**

Add the following keys to both `src/lang/en/host.json` and `src/lang/zh/host.json`; use the translated Chinese strings rather than English placeholders:

```json
"tomcatAppBase": "Tomcat appBase",
"tomcatContexts": "Application mappings",
"tomcatContextPath": "Context path",
"tomcatDocBase": "Application path (docBase)",
"tomcatAddContext": "Add mapping",
"tomcatRewrite": "Tomcat rewrite",
"tomcatRewriteContent": "rewrite.config content",
"tomcatContextPathInvalid": "Enter a safe Context path beginning with /",
"tomcatDocBaseRequired": "Select an application directory or WAR file",
"tomcatNameConflict": "This domain is already used by another Tomcat site"
```

English fallback is acceptable for other existing locales; do not bulk-edit every translation file for this feature.

- [ ] **Step 7: Run drawer and controller tests**

```bash
yarn tsx scripts/tomcat-site-drawer-test.ts
yarn tsx scripts/tomcat-site-controller-test.ts
yarn test:renderer-operation-boundaries
```

Expected: all pass.

- [ ] **Step 8: Commit the drawer**

```bash
git add src/render/components/Host/Tomcat/site.ts src/render/components/Host/Tomcat/RewriteEditor.vue src/render/components/Host/Tomcat/Edit.vue src/lang/en/host.json src/lang/zh/host.json scripts/tomcat-site-drawer-test.ts
git commit -m "feat: configure Tomcat context mappings and rewrite"
```

### Task 8: Route every Tomcat list mutation through the controller

**Files:**

- Modify: `src/render/components/Host/Tomcat/ListTable.vue`
- Modify: `scripts/tomcat-site-drawer-test.ts`

- [ ] **Step 1: Add failing list-routing assertions**

Extend `scripts/tomcat-site-drawer-test.ts` to assert:

```ts
assert.match(list, /import tomcatSiteController from '.\/TomcatSiteController'/)
assert.match(list, /await tomcatSiteController\.save\(item, 'del'/)
assert.match(
  list,
  /await tomcatSiteController\.save\(JSON\.parse\(JSON\.stringify\(quickEdit\.value\)\), 'edit', quickEditBack\)/
)
assert.doesNotMatch(list, /import \{ handleHost \} from '@\/util\/Host'/)
assert.doesNotMatch(list, /handleHost\(/)
```

- [ ] **Step 2: Run the drawer/list test and confirm red**

Run: `yarn tsx scripts/tomcat-site-drawer-test.ts`

Expected: FAIL because delete and quick edit still call the generic `handleHost()` helper.

- [ ] **Step 3: Migrate delete and inline edits**

Import `tomcatSiteController` and remove `handleHost` from `ListTable.vue`. In the delete confirmation, set `item.deling = true`, await `tomcatSiteController.save(item, 'del')`, and clear `deling` in `finally`; the controller updates `AppStore` and `HostStore` on success. In `docClick`, after restoring an invalid empty/duplicate quick name, deep-clone both the edited host and `quickEditBack`, await `tomcatSiteController.save(edited, 'edit', old)`, then clear quick-edit state only after the terminal result. Preserve the generic ListTable behavior for open/log/link/sort and all non-Tomcat components unchanged.

- [ ] **Step 4: Run list, controller, and current URL regressions**

```bash
yarn tsx scripts/tomcat-site-drawer-test.ts
yarn tsx scripts/tomcat-site-controller-test.ts
yarn tsx scripts/host-qrcode-url-test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit controller-only Tomcat list mutations**

```bash
git add src/render/components/Host/Tomcat/ListTable.vue scripts/tomcat-site-drawer-test.ts
git commit -m "fix: reconcile all Tomcat site mutations"
```

### Task 9: Register focused commands and revise Tomcat/OpenMRS documentation

**Files:**

- Modify: `package.json`
- Modify: `docs/deepwiki/tomcat.md`
- Modify: `/Users/x/Desktop/www/flyenv-tomcat-test/docs/openmrs-tomcat-demo.md`
- Create: `scripts/tomcat-documentation-test.ts`

- [ ] **Step 1: Write failing documentation and command assertions**

Create `scripts/tomcat-documentation-test.ts` to read `package.json`, the repository DeepWiki page, and the separate OpenMRS guide. Assert:

```ts
assert.equal(packageJson.scripts['test:tomcat-site'], 'tsx scripts/tomcat-site-test.ts')
assert.equal(packageJson.scripts['test:tomcat-site-save'], 'tsx scripts/tomcat-site-save-test.ts')
assert.equal(
  packageJson.scripts['test:tomcat'],
  'yarn test:tomcat-site && yarn test:tomcat-site-save && tsx scripts/tomcat-server-xml-test.ts'
)
assert.match(deepwiki, /conf\/Catalina\/<host>\//)
assert.match(deepwiki, /deployOnStartup="true"/)
assert.match(openmrs, /Application mappings/)
assert.match(openmrs, /\/openmrs.*openmrs\.war/s)
assert.match(openmrs, /RewriteRule \^\/\$ \/openmrs\/ \[R=302,L\]/)
assert.doesNotMatch(openmrs, /<Context path="\/openmrs"/)
assert.doesNotMatch(openmrs, /deployOnStartup="false"/)
```

- [ ] **Step 2: Run documentation coverage and confirm red**

Run: `yarn tsx scripts/tomcat-documentation-test.ts`

Expected: FAIL because package commands and updated descriptions are absent.

- [ ] **Step 3: Add the focused commands**

Add exactly these `package.json` scripts adjacent to existing test scripts:

```json
"test:tomcat-site": "tsx scripts/tomcat-site-test.ts",
"test:tomcat-site-save": "tsx scripts/tomcat-site-save-test.ts",
"test:tomcat": "yarn test:tomcat-site && yarn test:tomcat-site-save && tsx scripts/tomcat-server-xml-test.ts",
"test:tomcat-renderer-setup": "tsx scripts/tomcat-renderer-setup-test.ts",
"test:tomcat-site-controller": "tsx scripts/tomcat-site-controller-test.ts"
```

- [ ] **Step 4: Update FlyEnv’s Tomcat reference**

In `docs/deepwiki/tomcat.md`, replace outdated inline-Context/legacy source-path references with the current files: `Tomcat/ServerXML.ts`, `Tomcat/Site.ts`, Context descriptors under `<CATALINA_BASE>/conf/Catalina/<host>/`, and host-level `rewrite.config`. Document that `appBase` is selected as the Tomcat site root, direct children with their natural Context paths are auto-deployed without descriptors, external directories/WARs and custom paths use descriptors, `deployOnStartup` and `autoDeploy` remain true, each site generates configuration only for its primary hostname, and only FlyEnv-marked files/XML entries are managed. Add the fixed HTTPS connector attributes, SNI/default behavior, and the save-while-running restart behavior.

- [ ] **Step 5: Simplify the OpenMRS guide without making it OpenMRS-specific code**

In `/Users/x/Desktop/www/flyenv-tomcat-test/docs/openmrs-tomcat-demo.md`, replace manual sections 6 and 7 with FlyEnv UI instructions:

1. In **Hosts → Tomcat Projects**, add `flyenv-openmrs-test.test`, set **Tomcat appBase** to the empty `$OPENMRS_APP_BASE`, and add context mapping `/openmrs` to `$OPENMRS_SOURCE/webapp/target/openmrs.war`.
2. Enable **Tomcat rewrite** and set `RewriteRule ^/$ /openmrs/ [R=302,L]`.
3. Save; FlyEnv writes the standard Context descriptor/rewrite file and restarts an already running Tomcat once.

Explain that the descriptor, Host RewriteValve, and `server.xml` must not be edited by hand after this. Retain all project-specific requirements: Tomcat 9 compatibility, OpenMRS JVM option/runtime data directory, MySQL setup, source build, initialization wizard, and optional Elasticsearch guidance. In verification, change the `configtest.sh` command to a pre-start/manual diagnostic rather than a mandatory manual configuration step, and retain the curl checks. Do not alter the OpenMRS WAR or copy it into `webapps`.

- [ ] **Step 6: Run documentation and focused aggregate coverage**

```bash
yarn tsx scripts/tomcat-documentation-test.ts
yarn test:tomcat
yarn test:tomcat-renderer-setup
yarn test:tomcat-site-controller
yarn test:renderer-operation-boundaries
```

Expected: all scripts pass. Commit only the FlyEnv repository files; leave the external guide staged nowhere unless its separate workspace owner explicitly requests a commit.

- [ ] **Step 7: Commit repository documentation and commands**

```bash
git add package.json docs/deepwiki/tomcat.md scripts/tomcat-documentation-test.ts
git commit -m "docs: explain managed Tomcat site deployment"
```

### Task 10: Final verification, source build, and manual smoke checklist

**Files:**

- Verify: all files listed above

- [ ] **Step 1: Run all focused automated verification from a clean test state**

```bash
yarn test:tomcat
yarn test:tomcat-renderer-setup
yarn test:tomcat-site-controller
yarn tsx scripts/tomcat-site-drawer-test.ts
yarn test:renderer-operation-boundaries
yarn test:module-lifecycle-single-flight
yarn tsx scripts/host-qrcode-url-test.ts
```

Expected: every command exits `0` and prints its pass message.

- [ ] **Step 2: Run TypeScript/build-level verification**

Run: `yarn vue-tsc --noEmit`

Expected: exit `0`; if the repository has a pre-existing unrelated failure, record the exact baseline error and confirm there is no error in any changed Tomcat, Host, language, or script file.

Then run: `yarn build`

Expected: production build exits `0`. If packaging is unavailable in the current host environment, stop at the precise packaging prerequisite failure and report it separately from the focused test results.

- [ ] **Step 3: Manually smoke test the user-visible workflow**

Using a disposable Tomcat instance, add one Tomcat site with an empty dedicated appBase, a root directory Context, and an external WAR Context. Enable a root-to-nested rewrite and save while stopped: descriptors and rewrite must appear, while Tomcat remains stopped. Start it, replace the WAR mapping/certificate, and save: it must restart once with the same CATALINA_BASE. Confirm HTTP and HTTPS respond with the selected Host header; disable rewrite/SSL and confirm only FlyEnv-owned Valve/SNI/rewrite files are removed. Finally create a manual Context descriptor, manual rewrite file, manual RewriteValve, and manual SNI record; repeat reconciliation and verify all manual files/XML entries remain unchanged and a rewrite-file conflict is shown instead of overwritten.

- [ ] **Step 4: Inspect final changes before handoff**

```bash
git diff --check
git status --short
git log --oneline --max-count=12
```

Expected: no whitespace errors; each commit has one focused responsibility; any change beneath `/Users/x/Desktop/www/flyenv-tomcat-test` is reported as an uncommitted change in its separate workspace, not as a FlyEnv commit.
