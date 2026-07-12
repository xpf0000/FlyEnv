# Ollama Crawler Memory Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `test/ollama.js` terminate reliably and produce the existing `models.json` schema without exhausting a 1GB server.

**Architecture:** Keep the deployable script as CommonJS, but separate pure parsing, bounded pagination, retryable HTTP access, tag collection, validation, and atomic output into exported functions. Production execution remains sequential; tests inject request, delay, logger, and filesystem paths so all failure and termination paths are deterministic.

**Tech Stack:** Node.js CommonJS, Axios, Node built-in `node:test`, `node:assert/strict`, `fs`, and the supplied HTTP proxy for the final live smoke test.

---

## File Structure

- Modify: `test/ollama.js` — memory-safe crawler, retry logic, progress logging, atomic output, CLI exit behavior, CommonJS exports.
- Create: `test/ollama.test.cjs` — deterministic unit/integration tests loaded as CommonJS despite the repository-level `"type": "module"`.
- Modify: `docs/superpowers/plans/2026-07-12-ollama-crawler-memory.md` — mark completed implementation steps if execution tracking is needed.

Both implementation files are intentionally under the repository's ignored `/test` directory. Do not force-add them to Git.

### Task 1: Add Deterministic Pagination and Retry Tests

**Files:**

- Create: `test/ollama.test.cjs`
- Test: `test/ollama.js`

- [ ] **Step 1: Write a CommonJS loader and the first failing pagination test**

Use `Module._compile()` so the CommonJS deployment script can be loaded inside this repository, whose package type is ESM:

```js
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

function loadCrawler() {
  const filename = path.join(__dirname, 'ollama.js')
  const loaded = new Module(filename)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  loaded._compile(readFileSync(filename, 'utf8'), filename)
  return loaded.exports
}

test('fetchAllModels sends the HTMX header and stops on an empty page', async () => {
  const { fetchAllModels } = loadCrawler()
  const calls = []
  const pages = [
    '<a href="/library/alpha">alpha</a><a href="/library/beta">beta</a>',
    '     '
  ]
  const request = async (config) => {
    calls.push(config)
    return { data: pages[calls.length - 1] }
  }

  const result = await fetchAllModels({
    request,
    wait: async () => {},
    logger: { log() {}, warn() {}, error() {} }
  })

  assert.deepEqual(result, ['alpha', 'beta'])
  assert.equal(calls.length, 2)
  assert.equal(calls[0].headers['HX-Request'], 'true')
  assert.equal(calls[0].timeout, 30_000)
  assert.equal(calls[0].maxRedirects, 0)
})
```

- [ ] **Step 2: Add repeated-page and maximum-page tests**

```js
test('fetchAllModels stops when a page adds no new models', async () => {
  const { fetchAllModels } = loadCrawler()
  let calls = 0
  const request = async () => {
    calls += 1
    return { data: '<a href="/library/alpha">alpha</a>' }
  }
  const result = await fetchAllModels({
    request,
    wait: async () => {},
    logger: { log() {}, warn() {}, error() {} }
  })
  assert.deepEqual(result, ['alpha'])
  assert.equal(calls, 2)
})

test('fetchAllModels fails instead of silently truncating at the page ceiling', async () => {
  const { fetchAllModels } = loadCrawler()
  let page = 0
  const request = async () => {
    page += 1
    return { data: `<a href="/library/model-${page}">model</a>` }
  }
  await assert.rejects(
    fetchAllModels({
      request,
      wait: async () => {},
      maxPages: 2,
      logger: { log() {}, warn() {}, error() {} }
    }),
    /maximum page limit/i
  )
})
```

- [ ] **Step 3: Add retry tests**

```js
test('requestWithRetry retries transient failures and returns the successful response', async () => {
  const { requestWithRetry } = loadCrawler()
  let attempts = 0
  const request = async () => {
    attempts += 1
    if (attempts < 3) {
      const error = new Error('temporary')
      error.code = 'ECONNRESET'
      throw error
    }
    return { data: 'ok' }
  }
  const response = await requestWithRetry(
    { url: 'https://example.test' },
    { request, wait: async () => {}, logger: { warn() {} } }
  )
  assert.equal(response.data, 'ok')
  assert.equal(attempts, 3)
})

test('requestWithRetry throws after three failed attempts', async () => {
  const { requestWithRetry } = loadCrawler()
  let attempts = 0
  await assert.rejects(
    requestWithRetry(
      { url: 'https://example.test' },
      {
        request: async () => {
          attempts += 1
          throw new Error('still broken')
        },
        wait: async () => {},
        logger: { warn() {} }
      }
    ),
    /still broken/
  )
  assert.equal(attempts, 3)
})
```

- [ ] **Step 4: Run tests and verify RED**

Run:

```bash
node --test test/ollama.test.cjs
```

Expected: FAIL because `fetchAllModels` and `requestWithRetry` are not exported and the current module starts a live crawl during import.

### Task 2: Implement Bounded Search Pagination

**Files:**

- Modify: `test/ollama.js`
- Test: `test/ollama.test.cjs`

- [ ] **Step 1: Add constants, dependency defaults, and retry logic**

Define:

```js
const REQUEST_TIMEOUT = 30_000
const MAX_RETRIES = 3
const MAX_SEARCH_PAGES = 500
const SEARCH_HEADERS = { 'HX-Request': 'true' }

async function requestWithRetry(config, options = {}) {
  const request = options.request || axios
  const wait = options.wait || waitTimeRange
  const logger = options.logger || console
  let lastError
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await request({ timeout: REQUEST_TIMEOUT, ...config })
    } catch (error) {
      lastError = error
      if (attempt < MAX_RETRIES) {
        logger.warn(`request failed (${attempt}/${MAX_RETRIES}): ${config.url}`)
        await wait(attempt * 500, attempt * 1000)
      }
    }
  }
  throw lastError
}
```

- [ ] **Step 2: Replace the unbounded search loop**

Implement `extractModelNames(html)` and `fetchAllModels(options = {})`. For each page, request with `headers: SEARCH_HEADERS`, `maxRedirects: 0`, and the shared timeout/retry wrapper. Add only unique model names. Return on an empty page or a page that adds zero names. After `maxPages` pages containing new models, throw `Reached maximum page limit (...)`.

- [ ] **Step 3: Export functions and guard CLI execution**

End the module with explicit exports and execution guard:

```js
module.exports = {
  atomicWriteJson,
  check,
  extractModelNames,
  fetchAll,
  fetchAllModels,
  fetchLibTags,
  fixAll,
  main,
  requestWithRetry
}

if (require.main === module) {
  main().catch((error) => {
    console.error('FAILED:', error)
    process.exitCode = 1
  })
}
```

- [ ] **Step 4: Run pagination/retry tests and verify GREEN**

Run:

```bash
node --test test/ollama.test.cjs
```

Expected: pagination and retry tests PASS without making live HTTP requests.

### Task 3: Preserve Schema and Add Atomic Output Tests

**Files:**

- Modify: `test/ollama.test.cjs`
- Modify: `test/ollama.js`

- [ ] **Step 1: Write failing tag parsing and output tests**

```js
test('fetchAll preserves the model-to-tag-array output schema', async () => {
  const { fetchAll } = loadCrawler()
  const responses = new Map([
    ['https://ollama.com/search?page=1', '<a href="/library/alpha">alpha</a>'],
    ['https://ollama.com/search?page=2', ''],
    [
      'https://ollama.com/library/alpha/tags',
      '<div><a href="/library/alpha:latest">latest</a><span>1.2GB</span></div>'
    ]
  ])
  const result = await fetchAll({
    request: async ({ url }) => ({ data: responses.get(url) }),
    wait: async () => {},
    logger: { log() {}, warn() {}, error() {} }
  })
  assert.deepEqual(result, {
    alpha: [{ name: 'alpha:latest', size: '1.2GB' }]
  })
})

test('atomicWriteJson replaces the destination with parseable JSON and removes the temp file', () => {
  const { atomicWriteJson } = loadCrawler()
  const directory = mkdtempSync(path.join(tmpdir(), 'ollama-crawler-'))
  const destination = path.join(directory, 'models.json')
  atomicWriteJson(destination, { alpha: [{ name: 'alpha:latest', size: '1.2GB' }] })
  assert.deepEqual(JSON.parse(readFileSync(destination, 'utf8')), {
    alpha: [{ name: 'alpha:latest', size: '1.2GB' }]
  })
  assert.equal(existsSync(`${destination}.tmp`), false)
})
```

Import `existsSync`, `mkdtempSync`, `tmpdir`, and the required path helpers at the top of the test.

- [ ] **Step 2: Verify the new tests fail**

Run:

```bash
node --test test/ollama.test.cjs
```

Expected: FAIL because `fetchAll(options)` does not yet share injected dependencies and `atomicWriteJson` does not exist.

- [ ] **Step 3: Implement sequential tag collection and repair**

Pass the same injected `request`, `wait`, and `logger` dependencies through `fetchAllModels`, `fetchLibTags`, `fetchAll`, and `fixAll`. Keep tag fetching sequential. If a tag request fails during the first pass, log a bounded message and store `[]`; `fixAll` makes one more retry-wrapper call for empty entries.

- [ ] **Step 4: Implement atomic JSON replacement**

```js
function atomicWriteJson(destination, value) {
  const temporary = `${destination}.tmp`
  try {
    writeFileSync(temporary, JSON.stringify(value))
    renameSync(temporary, destination)
  } catch (error) {
    rmSync(temporary, { force: true })
    throw error
  }
}
```

- [ ] **Step 5: Run all deterministic tests and verify GREEN**

Run:

```bash
node --test test/ollama.test.cjs
```

Expected: all tests PASS with no live network access.

### Task 4: Validate Failure Handling and Live Behavior

**Files:**

- Modify: `test/ollama.test.cjs`
- Modify: `test/ollama.js`

- [ ] **Step 1: Add a failing unresolved-model test**

```js
test('main rejects instead of writing success when tag lists remain unresolved', async () => {
  const { main } = loadCrawler()
  const directory = mkdtempSync(path.join(tmpdir(), 'ollama-crawler-'))
  await assert.rejects(
    main({
      output: path.join(directory, 'models.json'),
      request: async ({ url }) => {
        if (url.includes('/search?page=1')) {
          return { data: '<a href="/library/alpha">alpha</a>' }
        }
        if (url.includes('/search?page=2')) return { data: '' }
        throw new Error('tag endpoint unavailable')
      },
      wait: async () => {},
      logger: { log() {}, warn() {}, error() {} }
    }),
    /unresolved models: alpha/i
  )
})
```

- [ ] **Step 2: Implement validation, bounded logging, and CLI errors**

Make `check()` return the unresolved model names rather than only a boolean. `main()` must throw with those names before output is replaced. Remove full-array/result logging. Log per-page counts and every tenth page include `Math.round(process.memoryUsage().heapUsed / 1024 / 1024)` MB.

- [ ] **Step 3: Run syntax and deterministic verification**

Run:

```bash
node --check test/ollama.js
node --test test/ollama.test.cjs
```

Expected: syntax check exits 0 and all tests PASS.

- [ ] **Step 4: Run the live smoke test through the supplied proxy**

Run from a temporary directory so the repository is not given a generated `models.json`:

```bash
cd /tmp
http_proxy=http://127.0.0.1:17891 \
https_proxy=http://127.0.0.1:17891 \
all_proxy=http://127.0.0.1:17891 \
node /Users/x/Desktop/WorkSpace/GitHub/FlyEnv/test/ollama.js
```

Expected: page numbers advance, the search phase terminates well below 500 pages, tag collection finishes, and the process prints `SUCCESS` with exit code 0.

- [ ] **Step 5: Validate the live artifact and resource bounds**

Run:

```bash
node -e "const fs=require('fs'); const p='/tmp/models.json'; const d=JSON.parse(fs.readFileSync(p,'utf8')); const keys=Object.keys(d); if (!keys.length || keys.some((k)=>!Array.isArray(d[k]))) process.exit(1); console.log({models:keys.length, bytes:fs.statSync(p).size})"
```

Expected: exit 0, a nonzero model count, and a bounded JSON file size. Review progress logs to confirm heap use remains far below the previous approximately 469MB failure point.

- [ ] **Step 6: Inspect the final diff without force-adding ignored files**

Run:

```bash
git diff --check
git status --short -- docs/superpowers test/ollama.js test/ollama.test.cjs
```

Expected: no whitespace errors; `/test` files remain ignored and therefore absent from normal Git status.
