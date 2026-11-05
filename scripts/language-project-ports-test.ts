import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'

// A URL also lets Node's built-in TS stripping run this dependency-free test.
const {
  parseProjectPort,
  validateProjectPorts,
  inspectProjectPorts,
  projectPortUrl
}: typeof import('../src/render/components/LanguageProjects/ports') = await import(
  new URL('../src/render/components/LanguageProjects/ports.ts', import.meta.url).href
)

const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

for (const [input, expected] of [
  [1, 1],
  [65535, 65535],
  ['1', 1],
  ['65535', 65535],
  [' 3000 ', 3000],
  ['03000', 3000]
] as const) {
  assert.equal(parseProjectPort(input), expected)
}
for (const input of [
  undefined,
  null,
  '',
  ' ',
  0,
  -1,
  65536,
  1.5,
  NaN,
  Infinity,
  -Infinity,
  '0',
  '-1',
  '65536',
  '1.5',
  '1e3',
  '0x50',
  '+3000',
  '3000abc',
  '3000,4000',
  true,
  false,
  [],
  [3000],
  {}
]) {
  assert.equal(parseProjectPort(input), undefined, `Invalid port: ${String(input)}`)
}

assert.deepEqual(validateProjectPorts(1, [65535]), {
  valid: true,
  projectPort: 1,
  additionalProjectPorts: [65535],
  invalidPrimary: false,
  invalidAdditional: false
})
assert.equal(validateProjectPorts(65535, [1]).valid, true)
for (const extra of [
  [4000, 4000],
  [3000],
  ['04000', 4000],
  [0],
  [1.5],
  ['1e3'],
  null,
  4000,
  '4000'
]) {
  assert.equal(validateProjectPorts(3000, extra).valid, false)
}
assert.equal(validateProjectPorts('bad', [4000]).invalidPrimary, true)
assert.equal(validateProjectPorts('3000', ['4000', '5000']).valid, true)
assert.deepEqual(
  validateProjectPorts('3000', ['4000', '5000']).additionalProjectPorts,
  [4000, 5000]
)

const legacy = { projectPort: 3000, comment: 'Legacy project' }
assert.deepEqual(inspectProjectPorts(legacy), {
  primaryUrl: 'http://127.0.0.1:3000',
  additionalPorts: [],
  hasInvalidPorts: false
})
assert.equal(validateProjectPorts(legacy.projectPort).valid, true)
assert.equal(Object.hasOwn(legacy, 'additionalProjectPorts'), false)

// Exercise adding, changing, deleting and quick-editing ports as form inputs.
let draft: Array<number | string> = []
draft.push('4000', '5000')
assert.deepEqual(validateProjectPorts(3000, draft).additionalProjectPorts, [4000, 5000])
draft[0] = '4500'
assert.deepEqual(validateProjectPorts(3000, draft).additionalProjectPorts, [4500, 5000])
draft.splice(1, 1)
assert.deepEqual(validateProjectPorts(3000, draft).additionalProjectPorts, [4500])
assert.equal(
  validateProjectPorts('4500', draft).valid,
  false,
  'Quick edit cannot reuse an extra port'
)
assert.equal(validateProjectPorts('65536', draft).valid, false)
assert.equal(validateProjectPorts('1e3', draft).valid, false)
assert.equal(validateProjectPorts('3001', draft).projectPort, 3001)
draft = []
assert.deepEqual(validateProjectPorts(3000, draft).additionalProjectPorts, [])

const project = {
  projectPort: 3000,
  additionalProjectPorts: [5000, 4000, 65535, 1],
  comment: 'Original'
}
const persisted = JSON.stringify(project)
const restored = JSON.parse(persisted)
restored.comment = 'Edited'
const savedAgain = JSON.parse(JSON.stringify(restored))
assert.deepEqual(savedAgain.additionalProjectPorts, [5000, 4000, 65535, 1])
assert.equal(typeof savedAgain.projectPort, 'number')
const presentation = inspectProjectPorts(savedAgain)
assert.deepEqual(
  [savedAgain.projectPort, ...presentation.additionalPorts],
  [3000, 5000, 4000, 65535, 1]
)
assert.deepEqual(presentation.additionalPorts.map(projectPortUrl), [
  'http://127.0.0.1:5000',
  'http://127.0.0.1:4000',
  'http://127.0.0.1:65535',
  'http://127.0.0.1:1'
])

for (const input of ['3000', 0, 65536, 1.5, null, '3000/path']) {
  assert.equal(projectPortUrl(input), undefined)
}
const corrupt = {
  projectPort: 3000,
  additionalProjectPorts: [4000, '5000', 0, 1.5, 4000, 3000, null, 65536, 5000]
}
const corruptSnapshot = JSON.stringify(corrupt)
assert.deepEqual(inspectProjectPorts(corrupt), {
  primaryUrl: 'http://127.0.0.1:3000',
  additionalPorts: [4000, 5000],
  hasInvalidPorts: true
})
assert.equal(
  JSON.stringify(corrupt),
  corruptSnapshot,
  'Inspecting corrupt data must never rewrite it'
)
for (const malformed of [null, '4000', 4000, {}]) {
  assert.deepEqual(inspectProjectPorts({ projectPort: 3000, additionalProjectPorts: malformed }), {
    primaryUrl: 'http://127.0.0.1:3000',
    additionalPorts: [],
    hasInvalidPorts: true
  })
}
assert.deepEqual(inspectProjectPorts({ projectPort: '3000', additionalProjectPorts: [4000] }), {
  primaryUrl: undefined,
  additionalPorts: [4000],
  hasInvalidPorts: true
})

// Reconstruct the real class with only its renderer dependencies stubbed out.
// This executes its constructor instead of duplicating the persistence logic.
const projectItemSource = source('src/render/components/LanguageProjects/ProjectItem.ts')
let transpileTypeScript: (code: string) => string
try {
  const typescript = await import('typescript')
  transpileTypeScript = (code) =>
    typescript.transpileModule(code, {
      compilerOptions: {
        target: typescript.ScriptTarget.ESNext,
        module: typescript.ModuleKind.ESNext
      }
    }).outputText
} catch {
  const nodeModule = await import('node:module')
  if (typeof nodeModule.stripTypeScriptTypes !== 'function') {
    throw new Error(
      'Run with tsx and project dependencies, or Node 22.14+ with --experimental-strip-types'
    )
  }
  transpileTypeScript = nodeModule.stripTypeScriptTypes
}
let classSource = transpileTypeScript(projectItemSource)
classSource = classSource.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
classSource = classSource.replace(/\bexport\s+/g, '') + '\nthis.ProjectItem = ProjectItem;'
const requests: Array<{ command: string; args: unknown[] }> = []
const context = createContext({
  uuid: () => 'test-project',
  reactive: (value: unknown) => value,
  window: { Server: { isWindows: true } },
  I18nT: (key: string) => key,
  beginServiceStatusPending: () => () => {},
  noteServiceStatusRevision: () => {},
  isPositiveHostPid: (value: unknown) => Number.isInteger(Number(value)) && Number(value) > 0,
  forkTerminalRequest: async (command: string, args: unknown[]) => {
    requests.push({ command, args: JSON.parse(JSON.stringify(args)) })
    return { code: 0, data: { 'APP-Service-Start-PID': '12000' } }
  }
})
runInContext(classSource, context)
for (const fixture of [legacy, project, corrupt]) {
  const instance = new context.ProjectItem(JSON.parse(JSON.stringify(fixture)))
  const roundTrip = JSON.parse(JSON.stringify(instance))
  assert.equal(roundTrip.projectPort, fixture.projectPort)
  assert.deepEqual(
    roundTrip.additionalProjectPorts,
    'additionalProjectPorts' in fixture ? fixture.additionalProjectPorts : undefined
  )
  instance.comment = 'Unrelated edit'
  const reconstructed = new context.ProjectItem(JSON.parse(JSON.stringify(instance)))
  assert.deepEqual(
    JSON.parse(JSON.stringify(reconstructed)).additionalProjectPorts,
    roundTrip.additionalProjectPorts
  )
}

// The actual project class still starts one command and stops the returned PID.
const runningProject = new context.ProjectItem({ ...project, isService: true, typeFlag: 'nodejs' })
assert.equal(await runningProject.start(false, false, false), true)
assert.equal(runningProject.state.pid, '12000')
assert.equal(requests.length, 1)
assert.equal(requests[0].command, 'app-fork-background:language-project')
assert.equal(requests[0].args[0], 'startService')
assert.equal((requests[0].args[1] as typeof project).projectPort, 3000)
assert.deepEqual(
  (requests[0].args[1] as typeof project).additionalProjectPorts,
  project.additionalProjectPorts
)
assert.equal(await runningProject.stop(false, false), true)
assert.equal(requests.length, 2)
assert.deepEqual(requests[1].args, ['stopService', '12000', 'nodejs'])
assert.equal(runningProject.state.isRun, false)

// Execute the real form and quick-edit handlers with refs and persistence stubbed.
// These checks cover the guard ordering without claiming to mount Vue/Element Plus.
const editSource = source('src/render/components/LanguageProjects/ProjectEdit.vue')
const listSource = source('src/render/components/LanguageProjects/index.vue')
const handler = (text: string, name: string) => {
  const match = text.match(new RegExp(`  const ${name} = [\\s\\S]*?\\n  }(?=\\n)`))
  assert.ok(match, `Handler ${name} not found`)
  return match[0]
}
const portInputSource = editSource.match(
  / {2}const storedPortsInvalid[\s\S]*? {2}const portsValidation = computed\([\s\S]*?\n {2}\)/
)
assert.ok(portInputSource)
const formHandlers = transpileTypeScript(
  [portInputSource[0], handler(editSource, 'checkItem'), handler(editSource, 'doSave')].join('\n') +
    '\nthis.form = { doSave, projectPortInput, additionalPortInputs, storedPortsInvalid };'
)
const validFormProject = {
  ...project,
  isService: true,
  path: 'C:\\Projects\\sample',
  commandType: 'command',
  runCommand: 'pnpm dev:local',
  runFile: ''
}
const formContext = (fixture: object) => {
  const submitted: Array<Record<string, unknown>> = []
  const item = { value: JSON.parse(JSON.stringify(fixture)) }
  const show = { value: true }
  const context = createContext({
    item,
    props: { isEdit: true },
    show,
    running: { value: false },
    errs: { value: {} },
    ref: (value: unknown) => ({ value }),
    computed: (getter: () => unknown) => ({
      get value() {
        return getter()
      }
    }),
    inspectProjectPorts,
    validateProjectPorts,
    callback: (value: unknown) => submitted.push(JSON.parse(JSON.stringify(value)))
  })
  runInContext(formHandlers, context)
  return { ...context.form, item, show, submitted }
}

const oldForm = formContext({ ...validFormProject, additionalProjectPorts: undefined })
oldForm.doSave()
assert.equal(oldForm.submitted.length, 1)
assert.equal(Object.hasOwn(oldForm.submitted[0], 'additionalProjectPorts'), false)
const editingForm = formContext({ ...validFormProject, additionalProjectPorts: [] })
editingForm.additionalPortInputs.value.push('4000', '5000')
editingForm.additionalPortInputs.value[0] = '4100'
editingForm.additionalPortInputs.value.splice(1, 1)
editingForm.doSave()
assert.deepEqual(editingForm.submitted[0].additionalProjectPorts, [4100])
assert.equal(editingForm.submitted[0].projectPort, 3000)
const clearingForm = formContext(validFormProject)
clearingForm.additionalPortInputs.value.splice(0)
clearingForm.doSave()
assert.deepEqual(clearingForm.submitted[0].additionalProjectPorts, [])
for (const badPort of ['0', '65536', '1.5', '1e3', '4000']) {
  const form = formContext({ ...validFormProject, additionalProjectPorts: [4000] })
  const before = JSON.stringify(form.item.value)
  form.projectPortInput.value = badPort
  form.doSave()
  assert.equal(form.submitted.length, 0)
  assert.equal(form.show.value, true)
  assert.equal(JSON.stringify(form.item.value), before)
}
const duplicateForm = formContext({ ...validFormProject, additionalProjectPorts: [] })
duplicateForm.additionalPortInputs.value.push('4000', '4000')
duplicateForm.doSave()
assert.equal(duplicateForm.submitted.length, 0)
for (const malformed of [null, '4000', ['4000']]) {
  const form = formContext({ ...validFormProject, additionalProjectPorts: malformed })
  const before = JSON.stringify(form.item.value)
  assert.equal(form.storedPortsInvalid, true)
  form.doSave()
  assert.equal(form.submitted.length, 0)
  assert.equal(JSON.stringify(form.item.value), before)
  form.additionalPortInputs.value = []
  form.doSave()
  assert.deepEqual(form.submitted[0].additionalProjectPorts, [])
}

const quickHandler = transpileTypeScript(
  ['tbodyDblClick', 'onQuickEditPortInput', 'cancelQuickEdit', 'docClick']
    .map((name) => handler(listSource, name))
    .join('\n') +
    '\nObject.assign(this, { tbodyDblClick, onQuickEditPortInput, cancelQuickEdit, docClick });'
)
const quickContext = (primary: unknown, extras: unknown, active = false) => {
  const operations: string[] = []
  const saved = {
    ...validFormProject,
    id: 'quick-project',
    projectPort: primary,
    additionalProjectPorts: extras,
    binBin: '',
    state: { isRun: active, running: false },
    stop: () => {
      operations.push('stop')
      return Promise.resolve(true)
    },
    start: () => {
      operations.push('start')
      return Promise.resolve(true)
    }
  }
  const original = JSON.stringify(saved)
  const writes: unknown[] = []
  const messages: string[] = []
  const row = {
    nodeName: 'TR',
    contains: () => false,
    querySelector: () => ({ getAttribute: () => saved.id })
  }
  const context = createContext({
    console: { log: () => {} },
    quickEdit: { value: undefined },
    quickEditBack: undefined,
    quickEditTr: { value: undefined },
    quickEditPortInput: { value: '' },
    quickEditPortEdited: { value: false },
    quickEditPortsInvalid: { value: false },
    parseProjectPort,
    validateProjectPorts,
    inspectProjectPorts,
    MessageError: (message: string) => messages.push(message),
    I18nT: (key: string) => key,
    isEqual: (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b),
    nextTick: () => Promise.resolve(),
    binVersions: { value: [] },
    props: { typeFlag: 'nodejs' },
    project: {
      project: [saved],
      prepareProject: () => {},
      saveProject: () => writes.push(JSON.parse(JSON.stringify(saved))),
      setDirEnv: () => Promise.resolve()
    }
  })
  runInContext(quickHandler, context)
  context.tbodyDblClick({ target: row })
  const editPort = (input: string) => {
    context.quickEditPortInput.value = input
    context.onQuickEditPortInput()
  }
  return { context, saved, original, writes, operations, messages, editPort }
}
const flushQuickEdit = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

// A/B: Entering and leaving either a valid or corrupt active project is a no-op.
for (const primary of [3000, '3000']) {
  const quick = quickContext(primary, [4000], true)
  assert.equal(quick.context.quickEdit.value.projectPort, primary)
  assert.equal(quick.context.quickEditPortEdited.value, false)
  quick.context.docClick()
  await flushQuickEdit()
  assert.equal(quick.writes.length, 0)
  assert.deepEqual(quick.operations, [])
  assert.deepEqual(quick.messages, [])
  assert.equal(JSON.stringify(quick.saved), quick.original)
  assert.equal(quick.context.quickEdit.value, undefined)
}

// C: Editing another field never implicitly repairs a corrupt stored primary.
const corruptQuick = quickContext('3000', [4000], true)
corruptQuick.context.quickEdit.value.comment = 'Only the comment changed'
corruptQuick.context.docClick()
corruptQuick.context.docClick()
await flushQuickEdit()
assert.equal(corruptQuick.writes.length, 0)
assert.deepEqual(corruptQuick.operations, [])
assert.equal(corruptQuick.messages.length, 1, 'Repeated outside clicks must not repeat the error')
assert.equal(corruptQuick.context.quickEditPortsInvalid.value, true)
assert.equal(JSON.stringify(corruptQuick.saved), corruptQuick.original)

// D: An explicit input event can repair the same displayed value, once.
corruptQuick.editPort('3000')
assert.equal(corruptQuick.context.quickEditPortsInvalid.value, false)
corruptQuick.context.docClick()
await flushQuickEdit()
corruptQuick.context.docClick()
await flushQuickEdit()
assert.equal(corruptQuick.saved.projectPort, 3000)
assert.equal(typeof corruptQuick.saved.projectPort, 'number')
assert.deepEqual(corruptQuick.saved.additionalProjectPorts, [4000])
assert.equal(corruptQuick.writes.length, 1)
assert.deepEqual(corruptQuick.operations, ['stop', 'start'])

// E: Valid active edits keep the existing restart behavior, not an extra execution.
const quickValid = quickContext(3000, [4000, 5000], true)
quickValid.editPort('3001')
quickValid.context.docClick()
await flushQuickEdit()
assert.equal(quickValid.saved.projectPort, 3001)
assert.equal(typeof quickValid.saved.projectPort, 'number')
assert.deepEqual(quickValid.saved.additionalProjectPorts, [4000, 5000])
assert.equal(quickValid.writes.length, 1)
assert.deepEqual(quickValid.operations, ['stop', 'start'])
const quickComment = quickContext(3000, [4000, 5000], true)
quickComment.context.quickEdit.value.comment = 'Only the comment changed'
quickComment.context.docClick()
await flushQuickEdit()
assert.deepEqual(quickComment.saved.additionalProjectPorts, [4000, 5000])
assert.equal(quickComment.writes.length, 1)
assert.deepEqual(quickComment.operations, [])
const equivalentPort = quickContext(3000, [4000], true)
equivalentPort.editPort('03000')
equivalentPort.context.docClick()
await flushQuickEdit()
assert.equal(equivalentPort.writes.length, 0)
assert.deepEqual(equivalentPort.operations, [])

// F: Canceling discards the draft, including an explicit primary-port correction.
const canceledQuick = quickContext('3000', [4000, 5000], true)
canceledQuick.context.quickEdit.value.comment = 'Unsaved comment'
canceledQuick.editPort('3001')
canceledQuick.context.cancelQuickEdit()
canceledQuick.context.docClick()
await flushQuickEdit()
assert.equal(JSON.stringify(canceledQuick.saved), canceledQuick.original)
assert.equal(canceledQuick.writes.length, 0)
assert.deepEqual(canceledQuick.operations, [])
assert.equal(canceledQuick.context.quickEdit.value, undefined)
assert.equal(canceledQuick.context.quickEditPortEdited.value, false)
assert.equal(canceledQuick.context.quickEditPortsInvalid.value, false)

for (const [extras, input] of [
  [[4000], '4000'],
  [[4000], '65536'],
  [[4000], '1e3'],
  [['4000'], '3001'],
  [null, '3001']
] as const) {
  const { context, saved, writes, operations, editPort } = quickContext(3000, extras, true)
  editPort(input)
  context.docClick()
  await flushQuickEdit()
  assert.equal(context.quickEditPortsInvalid.value, true)
  assert.ok(context.quickEdit.value, 'Invalid quick edit must remain open')
  assert.equal(saved.projectPort, 3000)
  assert.equal(writes.length, 0)
  assert.deepEqual(operations, [])
}

const opened: string[] = []
const linkContext = createContext({
  inspectProjectPorts,
  projectPortUrl,
  shell: {
    openExternal: (url: string) => {
      opened.push(url)
      return Promise.resolve()
    }
  }
})
runInContext(
  transpileTypeScript(handler(listSource, 'openSite') + '\nthis.openSite = openSite;'),
  linkContext
)
linkContext.openSite(project)
linkContext.openSite(project, 5000)
linkContext.openSite(project, 4000)
for (const invalid of [0, 65536, 1.5, '5000', 4444]) linkContext.openSite(project, invalid)
linkContext.openSite({ projectPort: '3000', additionalProjectPorts: ['5000'] }, 5000)
assert.deepEqual(opened, [
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5000',
  'http://127.0.0.1:4000'
])

// Keep the existing PID lifecycle and main-port-only bulk deduplication contract.
assert.match(projectItemSource, /\['stopService', this\._state\.pid, this\.typeFlag\]/)
assert.match(
  projectItemSource,
  /\['startService', data, this\.typeFlag, password, openInTerminal \|\| runInTerminal\]/
)
assert.match(projectItemSource, /isPositiveHostPid\(pid\)/)
const bulkSource = source('src/render/components/LanguageProjects/ASide.vue')
assert.match(bulkSource, /portNum\.has\(v\.projectPort\)/)
assert.match(bulkSource, /portNum\.add\(v\.projectPort\)/)
assert.doesNotMatch(bulkSource, /additionalProjectPorts/)
const forkSource = source('src/fork/module/LanguageProject/index.ts')
assert.match(forkSource, /stopRegisteredServiceProcesses\(pid, identity\)/)
assert.doesNotMatch(forkSource, /additionalProjectPorts/)

console.log(
  'Language project ports: validation, forms, links, persistence and PID contracts passed.'
)
