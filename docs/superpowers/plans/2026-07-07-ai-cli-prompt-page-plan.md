# AI CLI Prompt Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone single-file HTML prompt console that the user can open locally as the intro and step-by-step control surface for the FlyEnv AI CLI + MCP demo recording.

**Architecture:** Keep the deliverable as one self-contained HTML file under `docs/task/`, with inline CSS and JavaScript plus a hard-coded seven-step data array. Add one lightweight `tsx` verification script that checks the HTML for the required structure, prompts, copy logic, and localStorage support; combine that with a short manual browser verification step for the interaction flow.

**Tech Stack:** HTML, CSS, vanilla JavaScript, TypeScript `tsx` verification script, macOS browser

---

### Task 1: Add a failing verification script for the standalone prompt page

**Files:**
- Create: `scripts/ai-cli-prompt-console-check.ts`
- Verify target: `docs/task/ai-cli-mcp-demo-prompt-console.html`
- Read: `docs/superpowers/specs/2026-07-07-ai-cli-prompt-page-design.md`

- [ ] **Step 1: Write the failing verification script**

```ts
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const htmlPath = resolve('docs/task/ai-cli-mcp-demo-prompt-console.html')

assert.equal(
  existsSync(htmlPath),
  true,
  `expected prompt console HTML to exist at ${htmlPath}, but it does not exist yet`
)

const html = readFileSync(htmlPath, 'utf8')

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
  'Mark Done',
  'Reset to Step 1',
  'navigator.clipboard.writeText',
  'localStorage',
  'Use FlyEnv MCP to inspect the local MySQL service.',
  'Create a minimal plain PHP CRUD demo app under /Users/x/Sites/ai-mysql-demo.',
  'Give me a short browser test checklist for this CRUD demo so I can demonstrate it on screen.'
]

for (const entry of requiredStrings) {
  assert.match(html, new RegExp(entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

assert.match(html, /const steps = \[/)
assert.match(html, /function render\(/)
assert.match(html, /function copyPrompt\(/)
assert.match(html, /function saveState\(/)
assert.match(html, /function loadState\(/)

console.log('ai-cli-prompt-console-check: ok')
```

- [ ] **Step 2: Run the verification script to confirm it fails**

Run: `npx tsx scripts/ai-cli-prompt-console-check.ts`

Expected: FAIL with the assertion saying `docs/task/ai-cli-mcp-demo-prompt-console.html` does not exist yet.

- [ ] **Step 3: Commit the failing verification script**

```bash
git add scripts/ai-cli-prompt-console-check.ts
git commit -m "test: add prompt console verification script"
```

### Task 2: Create the standalone prompt console HTML shell and layout

**Files:**
- Create: `docs/task/ai-cli-mcp-demo-prompt-console.html`
- Test: `scripts/ai-cli-prompt-console-check.ts`

- [ ] **Step 1: Create the full HTML shell with theme, header, rail, main card, and utility strip**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FlyEnv AI CLI MCP Prompt Console</title>
    <style>
      :root {
        --bg: #111417;
        --panel: #181d21;
        --panel-2: #21272d;
        --border: rgba(255, 255, 255, 0.08);
        --text: #f5efe4;
        --muted: #a79f94;
        --accent: #d9a441;
        --accent-2: #7ec7b8;
        --done: #5d7b73;
        --danger: #c86f6f;
        --shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
        --radius: 22px;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        min-height: 100%;
      }

      body {
        font-family:
          'Avenir Next', 'Segoe UI', sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(217, 164, 65, 0.12), transparent 32%),
          radial-gradient(circle at bottom right, rgba(126, 199, 184, 0.1), transparent 28%),
          linear-gradient(180deg, #0e1114 0%, #14191d 100%);
      }

      .app {
        max-width: 1440px;
        margin: 0 auto;
        min-height: 100vh;
        padding: 28px;
        display: grid;
        grid-template-columns: 320px minmax(0, 1fr);
        grid-template-rows: auto minmax(0, 1fr) auto;
        gap: 22px;
      }

      .header,
      .rail,
      .stage,
      .utility {
        background: rgba(24, 29, 33, 0.9);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        backdrop-filter: blur(14px);
      }

      .header {
        grid-column: 1 / -1;
        padding: 26px 30px;
        display: flex;
        justify-content: space-between;
        gap: 24px;
        align-items: flex-start;
        animation: float-in 260ms ease-out;
      }

      .eyebrow {
        color: var(--accent);
        text-transform: uppercase;
        letter-spacing: 0.14em;
        font-size: 12px;
        margin: 0 0 10px;
      }

      h1 {
        font-family: 'Georgia', 'Times New Roman', serif;
        font-size: clamp(32px, 4vw, 54px);
        line-height: 0.95;
        margin: 0 0 12px;
      }

      .goal {
        max-width: 760px;
        color: var(--muted);
        font-size: 17px;
        line-height: 1.6;
        margin: 0;
      }

      .progress-box {
        min-width: 180px;
        padding: 16px 18px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid var(--border);
      }

      .progress-label {
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.14em;
      }

      .progress-value {
        margin-top: 6px;
        font-size: 28px;
        font-weight: 700;
      }

      .rail {
        padding: 18px;
      }

      .rail-title {
        margin: 0 0 14px;
        font-size: 13px;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }

      .step-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .step-item {
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 14px 14px 14px 16px;
        background: rgba(255, 255, 255, 0.02);
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 12px;
        align-items: center;
        cursor: pointer;
        transition:
          transform 140ms ease,
          border-color 140ms ease,
          background 140ms ease;
      }

      .step-item:hover {
        transform: translateX(4px);
        border-color: rgba(217, 164, 65, 0.3);
      }

      .step-item.active {
        background: linear-gradient(90deg, rgba(217, 164, 65, 0.12), rgba(217, 164, 65, 0.04));
        border-color: rgba(217, 164, 65, 0.42);
      }

      .step-item.done {
        border-color: rgba(126, 199, 184, 0.28);
        color: #d9d3ca;
      }

      .step-index {
        width: 34px;
        height: 34px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: rgba(255, 255, 255, 0.05);
        font-size: 13px;
        font-weight: 700;
      }

      .step-item.active .step-index {
        background: var(--accent);
        color: #241b0c;
      }

      .step-item.done .step-index {
        background: var(--done);
        color: #eef4f2;
      }

      .step-name {
        font-size: 15px;
        line-height: 1.3;
      }

      .step-dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.16);
      }

      .step-item.active .step-dot {
        background: var(--accent);
      }

      .step-item.done .step-dot {
        background: var(--accent-2);
      }

      .stage {
        padding: 24px;
        animation: float-in 220ms ease-out;
      }

      .stage-top {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        align-items: start;
      }

      .stage-tag {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(217, 164, 65, 0.12);
        color: var(--accent);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }

      .stage h2 {
        margin: 16px 0 10px;
        font-size: clamp(26px, 3vw, 40px);
        line-height: 1.02;
      }

      .stage-why {
        margin: 0;
        color: var(--muted);
        font-size: 17px;
        line-height: 1.6;
        max-width: 900px;
      }

      .note {
        margin-top: 18px;
        padding: 14px 16px;
        border-radius: 18px;
        background: rgba(126, 199, 184, 0.08);
        border: 1px solid rgba(126, 199, 184, 0.2);
        color: #dfecea;
        display: none;
      }

      .note.visible {
        display: block;
      }

      .prompt-wrap {
        margin-top: 22px;
      }

      .prompt-label {
        margin: 0 0 10px;
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }

      pre {
        margin: 0;
        padding: 22px;
        border-radius: 22px;
        overflow: auto;
        background: linear-gradient(180deg, rgba(10, 12, 14, 0.98), rgba(16, 19, 22, 0.98));
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: #f8f4ec;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        font-family:
          'SF Mono', 'JetBrains Mono', 'Menlo', monospace;
        font-size: 15px;
        line-height: 1.7;
        white-space: pre-wrap;
      }

      .actions,
      .secondary-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }

      .actions {
        margin-top: 20px;
      }

      .secondary-actions {
        margin-top: 14px;
      }

      button {
        appearance: none;
        border: 0;
        border-radius: 16px;
        padding: 12px 16px;
        font: inherit;
        cursor: pointer;
        transition:
          transform 140ms ease,
          opacity 140ms ease,
          background 140ms ease;
      }

      button:hover:not(:disabled) {
        transform: translateY(-1px);
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.45;
      }

      .btn-primary {
        background: var(--accent);
        color: #22180a;
        font-weight: 700;
      }

      .btn-secondary {
        background: rgba(255, 255, 255, 0.07);
        color: var(--text);
      }

      .btn-done {
        background: rgba(126, 199, 184, 0.18);
        color: #e7f4f1;
      }

      .utility {
        grid-column: 1 / -1;
        padding: 14px 18px;
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: center;
        color: var(--muted);
      }

      .toast {
        color: var(--accent-2);
      }

      @keyframes float-in {
        from {
          opacity: 0;
          transform: translateY(12px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @media (max-width: 1040px) {
        .app {
          grid-template-columns: 1fr;
        }

        .rail {
          order: 2;
        }

        .stage {
          order: 1;
        }

        .utility {
          order: 3;
        }
      }
    </style>
  </head>
  <body>
    <div class="app">
      <header class="header">
        <div>
          <p class="eyebrow">FlyEnv Demo Console</p>
          <h1>AI CLI + MCP Prompt Console</h1>
          <p class="goal">
            Use FlyEnv MCP and Codex to turn a local MySQL environment into a working PHP CRUD
            demo site.
          </p>
        </div>
        <div class="progress-box">
          <div class="progress-label">Current Progress</div>
          <div class="progress-value" id="progressValue">Step 1 / 7</div>
        </div>
      </header>

      <aside class="rail">
        <p class="rail-title">Flow</p>
        <ul class="step-list" id="stepList"></ul>
      </aside>

      <main class="stage">
        <div class="stage-top">
          <div>
            <span class="stage-tag" id="stageType"></span>
            <h2 id="stageTitle"></h2>
            <p class="stage-why" id="stageWhy"></p>
          </div>
        </div>

        <div class="note" id="stageNote"></div>

        <div class="prompt-wrap">
          <p class="prompt-label">Current Prompt</p>
          <pre id="stagePrompt"></pre>
        </div>

        <div class="actions">
          <button class="btn-primary" id="copyButton">Copy Prompt</button>
          <button class="btn-secondary" id="prevButton">Previous</button>
          <button class="btn-secondary" id="nextButton">Next</button>
          <button class="btn-done" id="doneButton">Mark Done</button>
        </div>

        <div class="secondary-actions">
          <button class="btn-secondary" id="resetButton">Reset to Step 1</button>
          <button class="btn-secondary" id="notesButton">Hide Notes</button>
        </div>
      </main>

      <footer class="utility">
        <div id="utilityType">MCP control step</div>
        <div class="toast" id="toast">Ready</div>
      </footer>
    </div>

    <script>
      const storageKey = 'flyenv-ai-cli-prompt-console'
      const steps = [
        {
          id: 1,
          shortTitle: 'Start MySQL',
          title: 'Start MySQL Through FlyEnv MCP',
          stageType: 'MCP control step',
          why: 'Start with environment control so the viewer sees FlyEnv MCP in action immediately.',
          prompt:
            'Use FlyEnv MCP to inspect the local MySQL service. If MySQL is not running, start the enabled MySQL service through FlyEnv MCP. Then confirm that MySQL is running and tell me which version is active.',
          note: ''
        },
        {
          id: 2,
          shortTitle: 'Create DB and table',
          title: 'Create the Demo Database and Table',
          stageType: 'local shell step',
          why: 'Use FlyEnv-provided context to bootstrap the database structure for the rest of the demo.',
          prompt:
            'Use FlyEnv MCP to get the local MySQL connection details and execution hints. Then use the local mysql client on this machine to create a database named flyenv_ai_demo if it does not already exist, and create a table named demo_items with these columns:\\n\\n- id INT PRIMARY KEY AUTO_INCREMENT\\n- title VARCHAR(255) NOT NULL\\n- status VARCHAR(50) NOT NULL DEFAULT \\'new\\'\\n- created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\\n\\nAfter that, show me the exact SQL you ran and confirm the table exists.',
          note: ''
        },
        {
          id: 3,
          shortTitle: 'Seed rows',
          title: 'Seed Three Demo Rows',
          stageType: 'local shell step',
          why: 'Prepare visible initial data for the later browser CRUD flow.',
          prompt:
            'Using the same local MySQL connection, insert three rows into flyenv_ai_demo.demo_items with these titles:\\n\\n- First demo item\\n- Second demo item\\n- Third demo item\\n\\nSet the status to \\'new\\' for all of them. Then query all rows from flyenv_ai_demo.demo_items ordered by id ascending and show the full result.',
          note: ''
        },
        {
          id: 4,
          shortTitle: 'Generate PHP app',
          title: 'Generate a Minimal PHP CRUD App',
          stageType: 'local file generation step',
          why: 'Generate a small framework-free app so the demo stays fast and easy to understand.',
          prompt:
            'Create a minimal plain PHP CRUD demo app under /Users/x/Sites/ai-mysql-demo.\\n\\nRequirements:\\n- use plain PHP, not a framework\\n- use PDO to connect to the local MySQL database flyenv_ai_demo\\n- keep the web root at /Users/x/Sites/ai-mysql-demo/public\\n- support listing all rows from demo_items\\n- support creating a new row\\n- support updating an existing row\\n- support deleting an existing row\\n- keep the UI simple and readable\\n- do not add authentication\\n- do not add external dependencies unless absolutely necessary\\n\\nCreate the required directories and files, and briefly summarize the file structure when done.',
          note: 'This is intentionally framework-free for recording speed and clarity.'
        },
        {
          id: 5,
          shortTitle: 'Create site and start services',
          title: 'Create the FlyEnv Site and Start PHP / Nginx',
          stageType: 'MCP provisioning step',
          why: 'Turn the generated local files into an actual FlyEnv-managed site and launch the web stack.',
          prompt:
            'Use FlyEnv MCP to create a FlyEnv site for this app with these settings:\\n\\n- site name: ai-mysql-demo.test\\n- root: /Users/x/Sites/ai-mysql-demo/public\\n- phpVersion: 83\\n- useSSL: false\\n- autoSSL: false\\n\\nThen use FlyEnv MCP to start PHP and Nginx if they are not already running. After that, use FlyEnv MCP to resolve the site URLs and tell me the best local URL to open in the browser.',
          note: ''
        },
        {
          id: 6,
          shortTitle: 'Pre-browser summary',
          title: 'Summarize the Local Setup',
          stageType: 'capture summary step',
          why: 'Create one clean on-screen checkpoint before switching to the browser.',
          prompt:
            'Before I open the site in the browser, summarize the current local setup in one short checklist:\\n\\n- MySQL status\\n- database name\\n- table name\\n- app root\\n- site URL\\n- whether PHP is running\\n- whether Nginx is running\\n\\nKeep it concise and ready for on-screen capture.',
          note: ''
        },
        {
          id: 7,
          shortTitle: 'Browser test checklist',
          title: 'Prepare the Browser Test Checklist',
          stageType: 'browser action step',
          why: 'Prepare a clean script for the browser segment rather than another environment step.',
          prompt:
            'Give me a short browser test checklist for this CRUD demo so I can demonstrate it on screen. Include one create action, one update action, one delete action, and one quick visual verification for each.',
          note: ''
        }
      ]

      const state = loadState()

      const stepList = document.getElementById('stepList')
      const stageType = document.getElementById('stageType')
      const stageTitle = document.getElementById('stageTitle')
      const stageWhy = document.getElementById('stageWhy')
      const stagePrompt = document.getElementById('stagePrompt')
      const stageNote = document.getElementById('stageNote')
      const progressValue = document.getElementById('progressValue')
      const utilityType = document.getElementById('utilityType')
      const toast = document.getElementById('toast')
      const copyButton = document.getElementById('copyButton')
      const prevButton = document.getElementById('prevButton')
      const nextButton = document.getElementById('nextButton')
      const doneButton = document.getElementById('doneButton')
      const resetButton = document.getElementById('resetButton')
      const notesButton = document.getElementById('notesButton')

      function loadState() {
        try {
          const saved = JSON.parse(localStorage.getItem(storageKey) || '{}')
          return {
            currentIndex: Number.isInteger(saved.currentIndex) ? saved.currentIndex : 0,
            done: Array.isArray(saved.done) ? saved.done : [],
            showNotes: saved.showNotes !== false
          }
        } catch {
          return { currentIndex: 0, done: [], showNotes: true }
        }
      }

      function saveState() {
        try {
          localStorage.setItem(storageKey, JSON.stringify(state))
        } catch {
          showToast('State not persisted')
        }
      }

      function showToast(message) {
        toast.textContent = message
      }

      function render() {
        const current = steps[state.currentIndex]
        progressValue.textContent = `Step ${current.id} / ${steps.length}`
        stageType.textContent = current.stageType
        stageTitle.textContent = current.title
        stageWhy.textContent = current.why
        stagePrompt.textContent = current.prompt
        utilityType.textContent = current.stageType
        stageNote.textContent = current.note || ''
        stageNote.classList.toggle('visible', !!current.note && state.showNotes)
        notesButton.textContent = state.showNotes ? 'Hide Notes' : 'Show Notes'
        prevButton.disabled = state.currentIndex === 0
        nextButton.disabled = state.currentIndex === steps.length - 1
        doneButton.textContent = state.done.includes(current.id) ? 'Marked Done' : 'Mark Done'
        renderList()
        saveState()
      }

      function renderList() {
        stepList.innerHTML = ''
        steps.forEach((step, index) => {
          const item = document.createElement('li')
          item.className = 'step-item'
          if (index === state.currentIndex) item.classList.add('active')
          if (state.done.includes(step.id)) item.classList.add('done')
          item.innerHTML = `
            <span class="step-index">${step.id}</span>
            <span class="step-name">${step.shortTitle}</span>
            <span class="step-dot"></span>
          `
          item.addEventListener('click', () => {
            state.currentIndex = index
            showToast(`Viewing step ${step.id}`)
            render()
          })
          stepList.appendChild(item)
        })
      }

      async function copyPrompt() {
        const current = steps[state.currentIndex]
        try {
          await navigator.clipboard.writeText(current.prompt)
          copyButton.textContent = 'Copied'
          showToast(`Prompt copied for step ${current.id}`)
          window.setTimeout(() => {
            copyButton.textContent = 'Copy Prompt'
          }, 1200)
        } catch {
          const selection = window.getSelection()
          const range = document.createRange()
          range.selectNodeContents(stagePrompt)
          selection.removeAllRanges()
          selection.addRange(range)
          showToast('Clipboard failed. Prompt selected for manual copy.')
        }
      }

      function move(delta) {
        const next = state.currentIndex + delta
        if (next < 0 || next >= steps.length) return
        state.currentIndex = next
        showToast(`Moved to step ${steps[state.currentIndex].id}`)
        render()
      }

      function toggleDone() {
        const currentId = steps[state.currentIndex].id
        if (state.done.includes(currentId)) {
          state.done = state.done.filter((id) => id !== currentId)
          showToast(`Step ${currentId} marked active`)
        } else {
          state.done = [...state.done, currentId]
          showToast(`Step ${currentId} marked done`)
        }
        render()
      }

      function resetFlow() {
        const confirmed = window.confirm('Reset to Step 1 and clear all completed markers?')
        if (!confirmed) return
        state.currentIndex = 0
        state.done = []
        showToast('Progress reset')
        render()
      }

      function toggleNotes() {
        state.showNotes = !state.showNotes
        showToast(state.showNotes ? 'Notes shown' : 'Notes hidden')
        render()
      }

      copyButton.addEventListener('click', copyPrompt)
      prevButton.addEventListener('click', () => move(-1))
      nextButton.addEventListener('click', () => move(1))
      doneButton.addEventListener('click', toggleDone)
      resetButton.addEventListener('click', resetFlow)
      notesButton.addEventListener('click', toggleNotes)

      render()
    </script>
  </body>
</html>
```

- [ ] **Step 2: Run the verification script again and confirm it now passes**

Run: `npx tsx scripts/ai-cli-prompt-console-check.ts`

Expected: PASS with `ai-cli-prompt-console-check: ok`

- [ ] **Step 3: Commit the standalone HTML implementation**

```bash
git add docs/task/ai-cli-mcp-demo-prompt-console.html scripts/ai-cli-prompt-console-check.ts
git commit -m "feat: add AI CLI prompt console page"
```

### Task 3: Tighten the copy flow, persistence, and recording polish

**Files:**
- Modify: `docs/task/ai-cli-mcp-demo-prompt-console.html`
- Test: `scripts/ai-cli-prompt-console-check.ts`

- [ ] **Step 1: Replace the placeholder `phpVersion: 83` string with the real verified PHP version if the machine differs**

Update this exact line in the `steps` array if Task 1 from the demo-video plan proved that `83` is not the safe installed PHP version:

```js
- phpVersion: 83
```

Expected:
- The prompt page reflects the real machine state before recording.

- [ ] **Step 2: Add one small quality-of-life improvement for single-step recording flow**

Use this exact addition inside the `copyPrompt()` success path:

```js
window.setTimeout(() => {
  copyButton.textContent = 'Copy Prompt'
}, 1200)

if (!state.done.includes(current.id)) {
  state.done = [...state.done, current.id]
  saveState()
  renderList()
}
```

This keeps `Copy Prompt` from auto-advancing, but it still marks the copied step as completed so the rail reflects progress naturally during recording.

- [ ] **Step 3: Re-run the verification script**

Run: `npx tsx scripts/ai-cli-prompt-console-check.ts`

Expected: PASS with `ai-cli-prompt-console-check: ok`

- [ ] **Step 4: Check formatting**

Run: `npx prettier --check docs/task/ai-cli-mcp-demo-prompt-console.html scripts/ai-cli-prompt-console-check.ts`

Expected: PASS with both files reported as correctly formatted.

- [ ] **Step 5: Commit the polish pass**

```bash
git add docs/task/ai-cli-mcp-demo-prompt-console.html scripts/ai-cli-prompt-console-check.ts
git commit -m "refactor: polish prompt console recording flow"
```

### Task 4: Manually verify the browser behavior on macOS

**Files:**
- Verify: `docs/task/ai-cli-mcp-demo-prompt-console.html`

- [ ] **Step 1: Open the page locally in the browser**

Run: `open docs/task/ai-cli-mcp-demo-prompt-console.html`

Expected:
- The page opens directly in the default macOS browser.
- It lands on Step 1 by default.

- [ ] **Step 2: Verify the single-step recording flow**

Manual checklist:

```text
- Header shows the page title and the one-line video goal
- Left rail shows all 7 steps
- Step 1 is active on first load
- Copy Prompt copies the current prompt
- Previous is disabled on Step 1
- Next moves to Step 2
- Mark Done changes the current step state in the rail
- Reset to Step 1 prompts for confirmation
- Hide Notes hides the optional note on Step 4
```

Expected:
- Every checklist item is visibly true in the browser.

- [ ] **Step 3: Verify persistence**

Manual sequence:

```text
1. Move to Step 4
2. Mark it done
3. Hide notes
4. Refresh the page
```

Expected:
- The page reopens on Step 4.
- Step 4 remains marked done.
- Notes remain hidden after refresh.

- [ ] **Step 4: Verify copy fallback is acceptable**

Manual acceptance:

```text
If clipboard access works, Copy Prompt should show Copied.
If clipboard access is blocked, the prompt text should become selected and a fallback toast should appear.
```

Expected:
- At least one of the two paths gives the user a reliable way to copy the prompt during recording.

### Task 5: Final recording readiness verification

**Files:**
- Verify: `docs/task/ai-cli-mcp-demo-prompt-console.html`
- Verify: `docs/superpowers/specs/2026-07-07-ai-cli-prompt-page-design.md`
- Verify: `docs/superpowers/specs/2026-07-05-ai-cli-mcp-demo-video-design.md`

- [ ] **Step 1: Re-run the automated check before claiming completion**

Run: `npx tsx scripts/ai-cli-prompt-console-check.ts`

Expected: PASS with `ai-cli-prompt-console-check: ok`

- [ ] **Step 2: Re-check formatting before claiming completion**

Run: `npx prettier --check docs/task/ai-cli-mcp-demo-prompt-console.html scripts/ai-cli-prompt-console-check.ts`

Expected: PASS with no formatting issues.

- [ ] **Step 3: Use this final recording-readiness checklist**

Confirm all lines below:

```text
- the page opens directly as a local standalone HTML file
- the opening screen is strong enough to use as the first video shot
- every stage prompt is present and readable
- copy, previous, next, and mark-done all work
- step progress is visible in the left rail and header
- localStorage restores progress after refresh
- the page feels like an operator console rather than a document page
- no network access, build step, or FlyEnv app runtime is required to use the page
```

Expected:
- If every line is true, the page is ready for recording use.
- If any line is false, fix that issue before calling the page complete.
