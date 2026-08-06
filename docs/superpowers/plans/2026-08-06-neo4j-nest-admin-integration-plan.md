# Neo4j nest-admin Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `nest-admin` expose all stable Neo4j Community versions from `5.23.0` onward as installable FlyEnv versions, without storing or managing local installation state.

**Architecture:** Add a dedicated Neo4j online-version provider that reads official GitHub tags, filters GA semantic versions, builds official distribution URLs, and preserves every available patch release. Wire it into the existing `/api/version/fetch` dynamic dispatch and the existing admin version-management UI; keep the response shape compatible with `VersionItem` and do not add local-runtime fields.

**Tech Stack:** NestJS, TypeScript, TypeORM version entity, Redis cache, Axios, Jest, Vue 3, Element Plus.

---

## File map

- Create `servers/src/api/version/module/neo4j.ts`: official Neo4j tag filtering and URL generation.
- Create `servers/src/api/version/module/neo4j.spec.ts`: provider tests with mocked HTTP requests.
- Modify `servers/src/api/version/version.req.dto.ts`: accept `neo4j` in request validation and TypeScript union.
- Modify `servers/src/api/version/version.service.ts`: lazy-load and dispatch the provider.
- Modify `servers/src/api/version/dto/version.dto.ts`: allow manual Neo4j version records in the existing admin CRUD.
- Modify `client/src/api/version.ts`: add `neo4j` to `AppServiceVersion`.
- Modify `client/src/views/version/manage/index.vue`: add the Neo4j management tab.
- Modify `client/src/views/version/manage/list.vue` and `version.vue`: extend the app prop unions so CRUD and online lookup accept Neo4j.

## Task 1: Define the failing provider tests

**Files:**
- Create: `servers/src/api/version/module/neo4j.spec.ts`

- [ ] **Step 1: Add filtering and URL tests**

Mock `request` with `5.22.0`, `5.23.0`, `5.26.1`, `2025.09.0`, `2025.10.0`, `2026.07.0`, `5.26.0-beta1`, `browser-0.1.24`, and a duplicate patch tag. Assert only stable numeric versions `>= 5.23.0` remain, all patch versions remain, and `mVersion` uses the first two numeric components.

```ts
expect(await Neo4j.mac('arm')).toEqual([
  expect.objectContaining({
    version: '2026.07.0',
    mVersion: '2026.07',
    url: 'https://dist.neo4j.org/neo4j-community-2026.07.0-unix.tar.gz',
  }),
  expect.objectContaining({
    version: '5.26.1',
    mVersion: '5.26',
    url: 'https://dist.neo4j.org/neo4j-community-5.26.1-unix.tar.gz',
  }),
  expect.objectContaining({ version: '5.23.0' }),
])
```

- [ ] **Step 2: Assert platform URL behavior**

Call `Neo4j.win()`, `Neo4j.mac('x86')`, `Neo4j.mac('arm')`, `Neo4j.linux('x86')`, and `Neo4j.linux('arm')`. Assert Windows always uses the zip URL and both Unix methods use the tar URL; assert `arch` does not alter the Neo4j distribution URL.

- [ ] **Step 3: Run the focused test and confirm it fails**

Run from `/Users/x/Desktop/WorkSpace/GitHub/nest-admin/servers`:

```bash
npm test -- --runInBand src/api/version/module/neo4j.spec.ts
```

Expected: FAIL because `neo4j.ts` does not exist.

- [ ] **Step 4: Commit the failing test**

```bash
cd /Users/x/Desktop/WorkSpace/GitHub/nest-admin
git add servers/src/api/version/module/neo4j.spec.ts
git commit -m "test: define Neo4j online version contract"
```

## Task 2: Implement the Neo4j online-version provider

**Files:**
- Create: `servers/src/api/version/module/neo4j.ts`
- Test: `servers/src/api/version/module/neo4j.spec.ts`

- [ ] **Step 1: Implement stable tag filtering**

Create a `Base` subclass with a shared `fetch(os)` method. Read `https://api.github.com/repos/neo4j/neo4j/tags?page=1&per_page=1000` using the existing `request` helper. Keep tags matching `/^\d+\.\d+\.\d+$/` and `compareVersions(tag, '5.23.0') >= 0`; reject prerelease, Enterprise, Browser, and non-semver tags.

- [ ] **Step 2: Preserve every patch release**

Do not call `Base.fetchFromGitHub`, because it intentionally returns one item per `mVersion`. Build each `VersionItem` directly:

```ts
const item = {
  version,
  versionSort: version,
  mVersion: version.split('.').slice(0, 2).join('.'),
  url: os === 'win'
    ? `https://dist.neo4j.org/neo4j-community-${version}-windows.zip`
    : `https://dist.neo4j.org/neo4j-community-${version}-unix.tar.gz`,
}
```

For each candidate issue an Axios HEAD request with redirects accepted (`200 <= status < 400`); discard only unavailable package URLs. Sort the final list descending with `compareVersions`.

- [ ] **Step 3: Expose all platform methods**

Implement `win()`, `mac(_arch)`, and `linux(_arch)` as wrappers around `fetch('win' | 'unix')`. Keep the existing `VersionClass` signature.

- [ ] **Step 4: Run the focused test and confirm it passes**

```bash
cd /Users/x/Desktop/WorkSpace/GitHub/nest-admin/servers
npm test -- --runInBand src/api/version/module/neo4j.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the provider**

```bash
cd /Users/x/Desktop/WorkSpace/GitHub/nest-admin
git add servers/src/api/version/module/neo4j.ts servers/src/api/version/module/neo4j.spec.ts
git commit -m "feat: add Neo4j online version provider"
```

## Task 3: Wire the API contract and dynamic dispatch

**Files:**
- Modify: `servers/src/api/version/version.req.dto.ts`
- Modify: `servers/src/api/version/version.service.ts`
- Modify: `servers/src/api/version/dto/version.dto.ts`

- [ ] **Step 1: Extend request and manual-version unions**

Add the literal `'neo4j'` to the `@IsIn([...])` list and the `VersionReqDto.app` union. Add it to `VersionDto.app` so `/version/save` and `/version/list` continue to support the admin tab.

- [ ] **Step 2: Add lazy service loading**

Add a `private Neo4jModule: VersionClass` field and method:

```ts
async neo4j(dto: VersionReqDto) {
  if (!this.Neo4jModule) {
    this.Neo4jModule = (await import('./module/neo4j')).default
  }
  return this.fetch(dto, this.Neo4jModule)
}
```

Do not add local Java or installation fields to the API response.

- [ ] **Step 3: Add request-level regression coverage**

Validate `app: 'neo4j'` and reject `app: 'neo4j-enterprise'`; retain current validation for all other modules.

- [ ] **Step 4: Run server tests and build**

```bash
cd /Users/x/Desktop/WorkSpace/GitHub/nest-admin/servers
npm test -- --runInBand src/api/version/module/neo4j.spec.ts src/api/version/module/release-modules.spec.ts
npm run build
```

Expected: tests pass and `dist` builds without TypeScript errors.

- [ ] **Step 5: Commit the API wiring**

```bash
cd /Users/x/Desktop/WorkSpace/GitHub/nest-admin
git add servers/src/api/version/version.req.dto.ts servers/src/api/version/version.service.ts servers/src/api/version/dto/version.dto.ts
git commit -m "feat: expose Neo4j version fetch API"
```

## Task 4: Add Neo4j to the admin UI

**Files:**
- Modify: `client/src/api/version.ts`
- Modify: `client/src/views/version/manage/index.vue`
- Modify: `client/src/views/version/manage/list.vue`
- Modify: `client/src/views/version/manage/version.vue`

- [ ] **Step 1: Extend the client service-version type**

Add `'neo4j'` to `AppServiceVersion.app`. Do not add `javaHome`, `javaMajor`, or local-installed fields to this type.

- [ ] **Step 2: Add the Neo4j management tab**

Append `'neo4j'` to the `all` array in `views/version/manage/index.vue`. The existing `List` component then exposes add/edit/delete and online lookup.

- [ ] **Step 3: Extend component prop unions**

Add `'neo4j'` to the `app` prop unions in `list.vue` and `version.vue`. Keep OS and architecture selectors unchanged.

- [ ] **Step 4: Run client checks**

```bash
cd /Users/x/Desktop/WorkSpace/GitHub/nest-admin/client
npm run type-check
npm run build
```

Expected: type-check and Vite build pass.

- [ ] **Step 5: Commit the admin UI**

```bash
cd /Users/x/Desktop/WorkSpace/GitHub/nest-admin
git add client/src/api/version.ts client/src/views/version/manage/index.vue client/src/views/version/manage/list.vue client/src/views/version/manage/version.vue
git commit -m "feat: add Neo4j version management tab"
```

## Task 5: Verify the deployed online contract

**Files:**
- No source changes; verify the deployed `nest-admin` environment.

- [ ] **Step 1: Query supported platform combinations**

```bash
for os_arch in "mac arm" "mac x86" "win x86" "linux x86" "linux arm"; do
  set -- $os_arch
  curl --fail --silent --show-error \
    -H 'content-type: application/json' \
    -d "{\"app\":\"neo4j\",\"os\":\"$1\",\"arch\":\"$2\"}" \
    https://api.one-env.com/api/version/fetch
done
```

Expected: HTTP 200 with non-empty `data`, minimum version `5.23.0` or newer, and platform-correct archive suffixes.

- [ ] **Step 2: Verify rejected values**

Send `neo4j-enterprise`, a prerelease tag, and an unsupported OS. Expected: validation failure or an empty filtered result; no Enterprise URL is returned.

- [ ] **Step 3: Record the API verification result**

Record endpoint, timestamp, minimum returned version, and platform matrix in the implementation PR description. Do not commit private response payloads.

