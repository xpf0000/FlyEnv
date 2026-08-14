# Tomcat Application Mapping UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Tomcat application-mapping editor match ordinary Host reverse-proxy interactions and automatically add direct appBase directory/WAR mappings after the appBase picker succeeds.

**Architecture:** Keep all new state in the mounted Tomcat site drawer. A small pure helper in the existing Tomcat form module converts direct deployment candidates and merges them without replacing an existing mapping; the drawer only obtains names from existing filesystem IPC APIs and calls that helper. Save, generated descriptors, rewrite, SSL, process state, and restart remain owned by the existing `TomcatSiteController` and fork modules.

**Tech Stack:** Vue 3 Composition API, TypeScript, Element Plus, Electron filesystem IPC, `pathe`, Node `assert/strict`, `tsx`.

---

## File structure and ownership

| Path | Responsibility |
| --- | --- |
| `src/render/components/Host/Tomcat/site.ts` | Tomcat drawer form types plus pure, renderer-only direct appBase candidate/merge helpers. |
| `src/render/components/Host/Tomcat/Edit.vue` | Mounted drawer view state, reverse-proxy-style mapping markup, selected-appBase scan request, and form validation. |
| `scripts/tomcat-site-drawer-test.ts` | Source-level drawer layout/scanning wiring regression coverage and pure candidate/merge behavior. |
| `docs/superpowers/specs/2026-08-13-tomcat-application-mapping-ui-design.md` | Approved UI/scan behavior specification; amend only if implementation discovers a material behavior conflict. |

### State and operation contract

| State or operation | Owner | Lifetime and behavior |
| --- | --- | --- |
| `item.root`, `tomcat.contexts`, validation errors, picker result, scan result | `Host/Tomcat/Edit.vue` | Mounted drawer view state; may reset on close. |
| Candidate derivation and non-destructive merge | `Host/Tomcat/site.ts` | Pure synchronous form helper; no IPC, persistence, or process state. |
| Host persistence, descriptor/rewrite/SSL reconciliation, restart, messages, re-entry guard | Existing `TomcatSiteController` | Module-local singleton; unchanged by this plan. |

No exception to the FlyEnv module-boundary rules is required. This change adds no Pinia store, no `config.setup` state, no new controller, and no service lifecycle API. The scan is a local filesystem-assisted form action, not a long-running service operation.

### Required behavior

- The application-mapping heading uses the same `plant-title flex items-center justify-between` pattern as reverse proxy, with a link-style `Plus` icon button.
- The section renders `common.value.none` when `tomcat.contexts` is empty.
- Every mapping is one compact `flex` row: link-style `Delete` icon button, context-path input, docBase input, and its existing folder/file picker icon. The `docBase` picker must still allow directories and files.
- On successful appBase selection, request `fs.subdir(appBase)` for direct directories and `fs.readdir(appBase, false)` for file paths. Because the latter is recursive, retain only names with neither `/` nor `\\`; then retain case-insensitive `.war` files.
- `ROOT` and `ROOT.war` create `/`; other direct names create `/name` after removing only a final `.war`. Invalid generated Context paths are discarded. Candidates are sorted by path, duplicate paths collapse with an exploded directory preferred, and currently entered mappings always win.
- If scanning fails or produces no candidate, leave the selected root and current mappings intact.

### Commits

Commit after each green task. Do not stage unrelated Tomcat site configuration changes already in the working tree.

---

### Task 1: Add testable direct-appBase mapping candidate and merge helpers

**Files:**

- Modify: `src/render/components/Host/Tomcat/site.ts`
- Modify: `scripts/tomcat-site-drawer-test.ts`

- [ ] **Step 1: Write the failing pure-helper assertions**

Append this import and behavior to `scripts/tomcat-site-drawer-test.ts` before the existing source assertions. The unique IDs make exact merge results deterministic.

```ts
import {
  appBaseContextCandidates,
  mergeAppBaseContextCandidates,
  type TomcatContextForm
} from '../src/render/components/Host/Tomcat/site'

const appBase = '/workspace/tomcat-webapps'
const candidates = appBaseContextCandidates(appBase, [
  { name: 'portal', kind: 'directory' },
  { name: 'ROOT', kind: 'directory' },
  { name: 'openmrs.WAR', kind: 'war' },
  { name: 'ROOT.war', kind: 'war' },
  { name: 'nested/api.war', kind: 'war' },
  { name: 'bad name.war', kind: 'war' },
  { name: 'README.txt', kind: 'war' }
])

assert.deepEqual(candidates, [
  { path: '/', docBase: '/workspace/tomcat-webapps/ROOT', kind: 'directory' },
  { path: '/openmrs', docBase: '/workspace/tomcat-webapps/openmrs.WAR', kind: 'war' },
  { path: '/portal', docBase: '/workspace/tomcat-webapps/portal', kind: 'directory' }
])

const existing: TomcatContextForm[] = [
  { id: 'manual-root', path: '/', docBase: '/manual/root' },
  { id: 'manual-api', path: '/api', docBase: '/manual/api' }
]
const merged = mergeAppBaseContextCandidates(existing, candidates, (path) => `scan-${path}`)

assert.deepEqual(merged, [
  ...existing,
  { id: 'scan-/openmrs', path: '/openmrs', docBase: '/workspace/tomcat-webapps/openmrs.WAR' },
  { id: 'scan-/portal', path: '/portal', docBase: '/workspace/tomcat-webapps/portal' }
])
assert.deepEqual(
  mergeAppBaseContextCandidates(existing, [], (path) => path),
  existing
)
```

- [ ] **Step 2: Run the drawer regression script to verify the red failure**

Run: `yarn tsx scripts/tomcat-site-drawer-test.ts`

Expected: FAIL because `appBaseContextCandidates` and `mergeAppBaseContextCandidates` are not exported from `site.ts`.

- [ ] **Step 3: Implement the minimal pure candidate and merge helpers**

In `src/render/components/Host/Tomcat/site.ts`, import `join` from `@/util/path-browserify` and add these types and functions after `TomcatContextForm`. Do not call Electron APIs or mutate either input array.

```ts
export type AppBaseEntry = {
  name: string
  kind: 'directory' | 'war'
}

export type AppBaseContextCandidate = {
  path: string
  docBase: string
  kind: AppBaseEntry['kind']
}

const appBaseContextPath = (entry: AppBaseEntry) => {
  const name = entry.kind === 'war' ? entry.name.replace(/\.war$/i, '') : entry.name
  return name.toLowerCase() === 'root' ? '/' : `/${name}`
}

export const appBaseContextCandidates = (
  appBase: string,
  entries: AppBaseEntry[]
): AppBaseContextCandidate[] => {
  const candidates = new Map<string, AppBaseContextCandidate>()
  for (const entry of entries) {
    if (!entry.name || entry.name.includes('/') || entry.name.includes('\\')) continue
    if (entry.kind === 'war' && !/\.war$/i.test(entry.name)) continue
    const path = appBaseContextPath(entry)
    if (rendererContextPathError(path)) continue
    const candidate = { path, docBase: join(appBase, entry.name), kind: entry.kind } as const
    const current = candidates.get(path)
    if (!current || (current.kind === 'war' && candidate.kind === 'directory')) {
      candidates.set(path, candidate)
    }
  }
  return [...candidates.values()].sort((left, right) => left.path.localeCompare(right.path))
}

export const mergeAppBaseContextCandidates = (
  contexts: TomcatContextForm[],
  candidates: AppBaseContextCandidate[],
  createId: (path: string) => string
): TomcatContextForm[] => {
  const paths = new Set(contexts.map((context) => context.path))
  return [
    ...contexts,
    ...candidates
      .filter((candidate) => !paths.has(candidate.path))
      .map(({ path, docBase }) => ({ id: createId(path), path, docBase }))
  ]
}
```

- [ ] **Step 4: Re-run the drawer regression script to verify green**

Run: `yarn tsx scripts/tomcat-site-drawer-test.ts`

Expected: `tomcat site drawer tests passed`.

- [ ] **Step 5: Commit the pure helper coverage and implementation**

```bash
git add src/render/components/Host/Tomcat/site.ts scripts/tomcat-site-drawer-test.ts
git commit -m "feat: discover Tomcat appBase context candidates"
```

### Task 2: Make the mapping editor mirror reverse proxy and scan after appBase selection

**Files:**

- Modify: `src/render/components/Host/Tomcat/Edit.vue`
- Modify: `scripts/tomcat-site-drawer-test.ts`

- [ ] **Step 1: Add failing source-level layout and scan wiring assertions**

Append the following checks to `scripts/tomcat-site-drawer-test.ts` after the current Context assertions. They intentionally inspect source rather than mount Electron/Vue components.

```ts
assert.match(
  edit,
  /<div class="plant-title flex items-center justify-between">\s*<span>\{\{ I18nT\('host\.tomcatContexts'\) \}\}<\/span>\s*<el-button link :icon="Plus" @click\.stop="addContext"\s*\/?>/
)
assert.match(edit, /v-if="tomcat\.contexts\.length === 0"/)
assert.match(edit, /I18nT\('common\.value\.none'\)/)
assert.match(edit, /<el-button link :icon="Delete" @click\.stop="removeContext\(index\)"\s*\/?>/)
assert.match(edit, /class="context-mapping-row flex items-center gap-2"/)
assert.match(edit, /await fs\.subdir\(appBase\)/)
assert.match(edit, /await fs\.readdir\(appBase, false\)/)
assert.match(edit, /scanAppBaseContexts\(path\)/)
assert.match(edit, /mergeAppBaseContextCandidates\(/)
assert.doesNotMatch(edit, /tomcatSiteController\.(?:scan|saveScan|discover)/)
```

- [ ] **Step 2: Run the drawer regression script to verify the red failure**

Run: `yarn tsx scripts/tomcat-site-drawer-test.ts`

Expected: FAIL because `Edit.vue` still has a text add button, multiline mapping layout, no empty state, and no scan function.

- [ ] **Step 3: Change the template to the compact reverse-proxy pattern**

In `src/render/components/Host/Tomcat/Edit.vue`, replace only the Application mappings title/content block with this markup. Preserve the surrounding rewrite, port, SSL, and save sections.

```vue
<div class="plant-title flex items-center justify-between">
  <span>{{ I18nT('host.tomcatContexts') }}</span>
  <el-button link :icon="Plus" @click.stop="addContext" />
</div>
<div class="main p-5 flex flex-col gap-3">
  <template v-if="tomcat.contexts.length === 0">
    <div class="flex justify-center">{{ I18nT('common.value.none') }}</div>
  </template>
  <template v-else>
    <div v-for="(context, index) in tomcat.contexts" :key="context.id" class="context-mapping-row flex items-center gap-2">
      <el-button link :icon="Delete" @click.stop="removeContext(index)" />
      <input v-model="context.path" type="text" :class="'input context-path' + (contextErrors[index]?.path ? ' error' : '')" :placeholder="I18nT('host.tomcatContextPath')" />
      <div class="path-choose context-doc-base">
        <input v-model="context.docBase" type="text" :class="'input' + (contextErrors[index]?.docBase ? ' error' : '')" :placeholder="I18nT('host.tomcatDocBase')" />
        <div class="icon-block" @click="chooseDocBase(context)">
          <yb-icon :svg="import('@/svg/folder.svg?raw')" class="choose" width="18" height="18" />
        </div>
      </div>
    </div>
  </template>
</div>
```

Add scoped styles after the `<script>` block, keeping the 500px drawer compact and preventing the path and docBase controls from changing row width:

```vue
<style lang="scss" scoped>
  .context-mapping-row {
    min-width: 0;

    .context-path {
      flex: 0 1 112px;
      min-width: 80px;
    }

    .context-doc-base {
      flex: 1 1 0;
      min-width: 0;

      .icon-block {
        margin-left: 12px;
      }
    }
  }
</style>
```

- [ ] **Step 4: Wire selected appBase discovery to the existing filesystem IPC APIs**

Update the `NodeFn` import to include `fs`, add `Plus` and `Delete` from `@element-plus/icons-vue`, and import the pure helpers:

```ts
import { Plus, Delete } from '@element-plus/icons-vue'
import { dialog, fs } from '@/util/NodeFn'
import {
  appBaseContextCandidates,
  cloneTomcatSiteHost,
  createTomcatSiteConfig,
  mergeAppBaseContextCandidates,
  rendererContextPathError,
  rendererTomcatNameError,
  rendererTomcatNames,
  type AppBaseEntry,
  type TomcatContextForm
} from './site'
```

Add this local scan helper before `choosePath`. It uses `subdir` because `readdir` is recursive in the main-process implementation. The only retained files are direct children, identified by having no slash or backslash in their relative path.

```ts
const scanAppBaseContexts = async (appBase: string) => {
  try {
    const [directories, files] = await Promise.all([fs.subdir(appBase), fs.readdir(appBase, false)])
    const entries: AppBaseEntry[] = [
      ...directories.map((name) => ({ name, kind: 'directory' as const })),
      ...files
        .filter((name) => !name.includes('/') && !name.includes('\\') && /\.war$/i.test(name))
        .map((name) => ({ name, kind: 'war' as const }))
    ]
    tomcat.value.contexts = mergeAppBaseContextCandidates(
      tomcat.value.contexts,
      appBaseContextCandidates(appBase, entries),
      () => uuid(12)
    )
  } catch {
    // AppBase discovery is optional; the selected root and existing form state remain usable.
  }
}
```

Change the successful root branch of `choosePath` from a direct assignment to an awaitable scan:

```ts
const choosePath = async (field: 'root' | 'cert' | 'key') => {
  const file = field !== 'root'
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: file
      ? ['openFile', 'showHiddenFiles']
      : ['openDirectory', 'createDirectory', 'showHiddenFiles']
  })
  if (canceled || filePaths.length === 0) return
  const [path] = filePaths
  if (field === 'root') {
    item.value.root = path
    await scanAppBaseContexts(path)
  } else {
    item.value.ssl[field] = path
  }
}
```

Keep `chooseDocBase` as the existing directory/file selection action and keep `addContext` creating one blank `{ id: uuid(12), path: '/', docBase: '' }` mapping. Do not call the controller except from the existing `doSave` function.

- [ ] **Step 5: Run focused regressions and validate types**

Run:

```bash
yarn tsx scripts/tomcat-site-drawer-test.ts
yarn test:tomcat
yarn test:tomcat-renderer-setup
yarn test:tomcat-site-controller
yarn test:renderer-operation-boundaries
yarn vue-tsc --noEmit
git diff --check
```

Expected: the drawer script and focused Tomcat/controller/boundary scripts pass. `vue-tsc` may continue to report pre-existing unrelated errors; it must report no errors from `Host/Tomcat/Edit.vue` or `Host/Tomcat/site.ts`. `git diff --check` is clean.

- [ ] **Step 6: Commit the compact editor and appBase discovery wiring**

```bash
git add src/render/components/Host/Tomcat/Edit.vue scripts/tomcat-site-drawer-test.ts
git commit -m "feat: scan Tomcat appBase mappings"
```

### Task 3: Final behavior review

**Files:**

- Verify: `src/render/components/Host/Edit.vue`
- Verify: `src/render/components/Host/Tomcat/Edit.vue`
- Verify: `docs/superpowers/specs/2026-08-13-tomcat-application-mapping-ui-design.md`

- [ ] **Step 1: Compare the final mapping interaction against reverse proxy**

Confirm manually that both sections use a `plant-title` row with a right-side `Plus` icon, an empty state, link-style delete icons, and compact horizontal mappings. Confirm Tomcat retains the extra docBase picker because its right-side input is a filesystem location rather than a URL.

- [ ] **Step 2: Exercise a scan manually in the running app**

Run `yarn dev`, add a Tomcat site, select an appBase containing `ROOT/`, `portal/`, and `openmrs.war`, then verify `/`, `/portal`, and `/openmrs` appear with their full paths. Enter a manual `/portal` mapping before selecting appBase and verify its path and docBase are unchanged. Close without saving and reopen to verify scanning was drawer-local; save a valid mapping only when you intend to reconcile Tomcat configuration.

- [ ] **Step 3: Commit only task-scoped documentation adjustments, if any**

```bash
git add docs/superpowers/specs/2026-08-13-tomcat-application-mapping-ui-design.md
git commit -m "docs: clarify Tomcat appBase scan behavior"
```

Skip this command when no documentation changed during implementation.
