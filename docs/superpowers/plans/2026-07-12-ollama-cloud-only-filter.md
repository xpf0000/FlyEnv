# Ollama Cloud-Only Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent cloud-only Ollama entries from appearing as fabricated local models such as `glm-5.2 / 8MB`.

**Architecture:** Parse only individual mobile tag rows and record every listed tag name. A page is cloud-only when it has listed rows, every row name ends in `:cloud`, and none has an explicit downloadable size; `fetchAll()` skips that model, while a non-cloud zero-tag page remains unresolved and fails validation.

**Tech Stack:** Node.js CommonJS, Axios, Node built-in `node:test`, HTML fixture strings, supplied HTTP proxy.

---

## File Structure

- Modify: `test/ollama.js` — remove cross-element legacy parsing, classify cloud-only tag pages, skip them in the output dictionary.
- Modify: `test/ollama.test.cjs` — reproduce the Tailwind `mt-8 mb-4` false size and verify cloud-only exclusion.

Both files remain intentionally ignored by the repository's `/test` rule and must not be force-added.

### Task 1: Reproduce the False 8MB Entry

**Files:**

- Modify: `test/ollama.test.cjs`
- Test: `test/ollama.js`

- [ ] **Step 1: Update the existing local-tag fixture to current Ollama markup**

Replace the simplified tag response with a mobile row containing an explicit bullet-delimited size:

```js
[
  'https://ollama.com/library/alpha/tags',
  '<a href="/library/alpha:latest" class="md:hidden flex">hash • 1.2GB • 4K context</a>'
]
```

- [ ] **Step 2: Add a failing parser regression test**

```js
test('extractLibTags never treats Tailwind spacing classes as model sizes', () => {
  const { extractLibTags } = loadCrawler()
  const html = `
    <div><a href="/library/glm-5.2">glm-5.2</a></div>
    <section class="w-full mt-8 mb-4">
      <a href="/library/glm-5.2:cloud" class="md:hidden flex">glm-5.2:cloud</a>
    </section>
  `
  assert.deepEqual(extractLibTags(html), [])
})
```

- [ ] **Step 3: Run the test and verify RED**

Run:

```bash
node --test test/ollama.test.cjs
```

Expected: FAIL because the legacy fallback returns `{ name: 'glm-5.2', size: '8MB' }`.

### Task 2: Classify and Exclude Cloud-Only Models

**Files:**

- Modify: `test/ollama.test.cjs`
- Modify: `test/ollama.js`

- [ ] **Step 1: Add a failing output-level cloud exclusion test**

```js
test('fetchAll excludes cloud-only models from the output dictionary', async () => {
  const { fetchAll } = loadCrawler()
  const responses = new Map([
    [
      'https://ollama.com/search?page=1',
      '<a href="/library/alpha">alpha</a><a href="/library/glm-5.2">glm-5.2</a>'
    ],
    ['https://ollama.com/search?page=2', ''],
    [
      'https://ollama.com/library/alpha/tags',
      '<a href="/library/alpha:latest" class="md:hidden flex">hash • 1.2GB • context</a>'
    ],
    [
      'https://ollama.com/library/glm-5.2/tags',
      '<a href="/library/glm-5.2:cloud" class="md:hidden flex">glm-5.2:cloud</a>'
    ]
  ])
  const result = await fetchAll({
    request: async ({ url }) => ({ data: responses.get(url) }),
    wait: async () => {},
    logger: silentLogger
  })
  assert.deepEqual(result, {
    alpha: [{ name: 'alpha:latest', size: '1.2GB' }]
  })
})
```

- [ ] **Step 2: Verify the output test fails**

Run:

```bash
node --test test/ollama.test.cjs
```

Expected: FAIL because `glm-5.2` remains in the result as an empty or fabricated entry.

- [ ] **Step 3: Implement row parsing and cloud-only classification**

Replace the legacy fallback with a single parser returning both local tags and availability:

```js
const extractLibTagPage = (html) => {
  const tags = []
  const listedNames = []
  const seen = new Set()
  const anchorRegex =
    /<a\b(?=[^>]*\bhref="\/library\/([^"]+)")(?=[^>]*\bclass="[^"]*md:hidden[^"]*")[^>]*>([\s\S]*?)<\/a>/gi
  let match

  while ((match = anchorRegex.exec(String(html))) !== null) {
    listedNames.push(match[1])
    const sizeMatch = match[2].match(/•\s*(\d+(?:\.\d+)?\s*(?:KB|MB|GB|TB))\s*•/i)
    if (!sizeMatch) continue
    const size = sizeMatch[1].replace(/\s+/g, '').toUpperCase()
    const key = `${match[1]}\u0000${size}`
    if (!seen.has(key)) {
      seen.add(key)
      tags.push({ name: match[1], size })
    }
  }

  return {
    tags,
    cloudOnly:
      listedNames.length > 0 &&
      tags.length === 0 &&
      listedNames.every((name) => name.endsWith(':cloud'))
  }
}
```

Keep `extractLibTags(html)` as a compatibility wrapper returning `.tags`. Make `fetchLibTags()` return `null` for `cloudOnly`, otherwise return the tag array. In `fetchAll()`, skip assignment when the result is `null`.

- [ ] **Step 4: Run deterministic verification**

Run:

```bash
node --max-old-space-size=128 --test test/ollama.test.cjs
node --check test/ollama.js
./node_modules/.bin/prettier --check test/ollama.js test/ollama.test.cjs
```

Expected: all tests PASS, syntax exits 0, formatting passes.

- [ ] **Step 5: Run live regression verification through the proxy**

Copy the CommonJS script to a temporary `.cjs` file and execute it with a 128MB heap. Validate that `models.json` omits `glm-5.2`, contains no entries at or below 16MB caused by CSS classes, contains no empty arrays, and remains parseable with the unchanged object-of-arrays schema.
