import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'

const htmlPath = resolve('docs/task/ai-cli-mcp-demo-prompt-console.html')

assert.equal(
  existsSync(htmlPath),
  true,
  `expected prompt console HTML to exist at ${htmlPath}, but it does not exist yet`
)

const html = readFileSync(htmlPath, 'utf8')
const normalizedHtml = html.replace(/\s+/g, ' ').trim()
const embeddedScript = html.match(/<script>([\s\S]*)<\/script>/)?.[1]

assert.ok(embeddedScript, 'expected an inline <script> block in the prompt console HTML')

try {
  new Function(embeddedScript)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  assert.fail(`expected inline prompt console script to parse, but got: ${message}`)
}

class FakeClassList {
  values = new Set<string>()

  add(...tokens: string[]) {
    tokens.forEach((token) => this.values.add(token))
  }

  toggle(token: string, force?: boolean) {
    if (force === undefined) {
      if (this.values.has(token)) {
        this.values.delete(token)
        return false
      }
      this.values.add(token)
      return true
    }

    if (force) {
      this.values.add(token)
      return true
    }

    this.values.delete(token)
    return false
  }
}

class FakeElement {
  id = ''
  textContent = ''
  disabled = false
  innerHTML = ''
  children: FakeElement[] = []
  listeners = new Map<string, () => void>()
  classList = new FakeClassList()

  addEventListener(event: string, listener: () => void) {
    this.listeners.set(event, listener)
  }

  appendChild(child: FakeElement) {
    this.children.push(child)
  }

  click() {
    this.listeners.get('click')?.()
  }
}

const elementIds = [
  'stepList',
  'stageType',
  'stageTitle',
  'stageWhy',
  'stagePrompt',
  'stageNote',
  'progressValue',
  'utilityType',
  'toast',
  'copyButton',
  'prevButton',
  'nextButton',
  'resetButton',
  'notesButton'
]

const elements = new Map<string, FakeElement>()

for (const id of elementIds) {
  const element = new FakeElement()
  element.id = id
  elements.set(id, element)
}

const selection = {
  removeAllRanges() {},
  addRange() {}
}

const context = vm.createContext({
  console,
  JSON,
  Number,
  Boolean,
  Array,
  RegExp,
  navigator: {
    clipboard: {
      writeText: async (_text: string) => {}
    }
  },
  localStorage: {
    store: new Map<string, string>(),
    getItem(key: string) {
      return this.store.get(key) ?? null
    },
    setItem(key: string, value: string) {
      this.store.set(key, value)
    }
  },
  document: {
    getElementById(id: string) {
      return elements.get(id) ?? null
    },
    createElement() {
      return new FakeElement()
    },
    createRange() {
      return {
        selectNodeContents(_node: unknown) {}
      }
    }
  },
  window: {
    getSelection() {
      return selection
    },
    setTimeout(fn: () => void) {
      fn()
      return 0
    },
    confirm() {
      return true
    }
  }
})

new vm.Script(embeddedScript).runInContext(context)

assert.match(
  elements.get('stagePrompt')?.textContent ?? '',
  /Use FlyEnv MCP to inspect the local MySQL service/
)
assert.equal(elements.get('progressValue')?.textContent, 'Step 1 / 7')

elements.get('nextButton')?.click()

assert.equal(elements.get('progressValue')?.textContent, 'Step 2 / 7')
assert.match(elements.get('stageTitle')?.textContent ?? '', /Create the Demo Database and Table/)
assert.match(
  elements.get('stagePrompt')?.textContent ?? '',
  /create a database named flyenv_ai_demo/
)

const requiredStrings = [
  'Use FlyEnv MCP and Codex to turn a local MySQL environment into a working PHP CRUD demo site.',
  'Start MySQL Through FlyEnv MCP',
  'Create the Demo Database and Table',
  'Seed Three Demo Rows',
  'Generate a Minimal PHP CRUD App',
  'Create the FlyEnv Site and Start PHP / Nginx',
  'Summarize the Local Setup',
  'Prepare the Browser Test Checklist',
  'Copy Prompt',
  'Previous',
  'Next',
  'Reset to Step 1',
  'navigator.clipboard.writeText',
  'localStorage',
  'Use FlyEnv MCP to inspect the local MySQL service.',
  'Create a minimal plain PHP CRUD demo app under /Users/x/Sites/ai-mysql-demo.',
  'Give me a short browser test checklist for this CRUD demo so I can demonstrate it on screen.'
]

for (const entry of requiredStrings) {
  const normalizedEntry = entry.replace(/\s+/g, ' ').trim()
  assert.match(normalizedHtml, new RegExp(normalizedEntry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

assert.match(html, /const steps = \[/)
assert.match(html, /function render\(/)
assert.match(html, /function copyPrompt\(/)
assert.match(html, /function saveState\(/)
assert.match(html, /function loadState\(/)
assert.doesNotMatch(html, /doneButton/)
assert.doesNotMatch(normalizedHtml, /Mark Done/)
assert.doesNotMatch(html, /function toggleDone\(/)

console.log('ai-cli-prompt-console-check: ok')
