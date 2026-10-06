import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse, compileScript } from '@vue/compiler-sfc'
import { createAppHelperChecker, HelperVersion } from '../src/shared/AppHelperCheck'

const selected = process.argv[2]
const cases: Record<string, () => Promise<void>> = {
  async transport() {
    const paths: string[] = []
    let legacyOnly = false
    const check = createAppHelperChecker({
      isWindows: () => false,
      isLinux: () => true,
      getHelperKey: async () => Buffer.alloc(32),
      createConnection: ((path: string) => {
        paths.push(path)
        const socket = new EventEmitter() as any
        socket.destroy = () => socket
        socket.end = () => socket.emit('end')
        socket.write = (text: string) => {
          const request = JSON.parse(text)
          queueMicrotask(() =>
            socket.emit(
              'data',
              Buffer.from(JSON.stringify({ key: request.key, code: 0, data: HelperVersion }))
            )
          )
        }
        queueMicrotask(() => {
          if (legacyOnly && path !== '/tmp/flyenv-helper.sock')
            socket.emit('error', new Error('new helper missing'))
          else socket.emit('connect')
        })
        return socket
      }) as any
    } as any)
    assert.equal(await check(), true)
    assert.equal(paths[0], '/run/flyenv-helper/helper.sock')
    legacyOnly = true
    await assert.rejects(check(), /new helper missing/)
    assert.equal(paths.length, 2, 'checker must never retry the legacy socket')
    for (const [key, code] of [
      [null, 'helper_key_missing'],
      [Buffer.alloc(31), 'helper_key_invalid']
    ] as const) {
      let connects = 0
      const check = createAppHelperChecker({
        isWindows: () => false,
        isLinux: () => true,
        getHelperKey: async () => key,
        createConnection: (() => {
          connects++
          throw new Error('unsigned requests must not reach the helper')
        }) as any
      })
      await assert.rejects(check(), (error: any) => error.code === code)
      assert.equal(connects, 0, 'key failures must be classified before dispatch')
    }
  },
  async installer() {
    const source = await readFile('static/sh/Linux/flyenv-helper-init.sh', 'utf8')
    const stop = source.match(/^stop_existing_helper\(\) \{[\s\S]*?^\}/m)?.[0]
    assert.ok(stop, 'installer needs a tested existing-service stop gate')
    for (const scenario of ['absent', 'stop-failed', 'still-running', 'stopped']) {
      const script: string = `SERVICE_NAME=flyenv-helper
SCENARIO='${scenario}'
systemctl() {
  if [ "$1" = stop ]; then [ "$SCENARIO" != stop-failed ]; return; fi
  case "$*" in
    *LoadState*) if [ "$SCENARIO" = absent ]; then echo not-found; else echo loaded; fi;;
    *ActiveState*) if [ "$SCENARIO" = still-running ]; then echo active; else echo inactive; fi;;
    *MainPID*) if [ "$SCENARIO" = still-running ]; then echo 123; else echo 0; fi;;
    *) return 1;;
  esac
}
${stop}
stop_existing_helper`
      const executable = process.platform === 'win32' ? 'wsl' : '/bin/bash'
      const args =
        process.platform === 'win32'
          ? ['-d', 'Ubuntu-24.04', '--exec', '/bin/bash', '-c', script]
          : ['-c', script]
      const result = spawnSync(executable, args, {
        encoding: 'utf8'
      })
      if (result.error) throw result.error
      assert.equal(
        result.status,
        ['absent', 'stopped'].includes(scenario) ? 0 : 1,
        scenario + ': ' + result.stderr
      )
    }
    // Execute the whole installer with only its privileged/system operations doubled.
    // A failed stop must preserve credentials, not merely avoid replacing the binary.
    for (const scenario of ['stop-failed', 'stopped']) {
      const script = `
scratch=$(mktemp -d)
printf old > "$scratch/key"
(
id() { echo 0; }
stat() { if [ "$2" = %u ]; then echo 0; else echo 755; fi; }
install() { :; }
mktemp() { if [[ "$1" == /usr/local/* ]]; then echo /flyenv-test/helper; else echo "$scratch/unit"; fi; }
/flyenv-test/helper() { printf new > "$scratch/key"; }
mv() { :; }
rm() { :; }
systemctl() {
  if [ "$1" = stop ]; then [ '${scenario}' != stop-failed ]; return; fi
  case "$*" in
    *LoadState*) echo loaded;;
    *ActiveState*) echo inactive;;
    *MainPID*) echo 0;;
  esac
}
set -- /unused/source 1000:1000 /unused/data /unused/root
${source}
)
result=$?
printf '\\nKEY='; cat "$scratch/key"; printf '\\n'
rm -r -- "$scratch"
exit "$result"`
      const result = spawnSync(
        process.platform === 'win32' ? 'wsl' : '/bin/bash',
        process.platform === 'win32'
          ? ['-d', 'Ubuntu-24.04', '--exec', '/bin/bash', '-c', script]
          : ['-c', script],
        { encoding: 'utf8' }
      )
      if (result.error) throw result.error
      assert.equal(result.status, scenario === 'stop-failed' ? 1 : 0, result.stderr)
      assert.match(result.stdout, scenario === 'stop-failed' ? /KEY=old/ : /KEY=new/)
    }
  },
  async renderer() {
    const calls: unknown[][] = []
    const messages: string[] = []
    let readonly = false
    ;(globalThis as any).__linuxMigration = {
      calls,
      messages,
      get readonly() {
        return readonly
      },
      set readonly(value: boolean) {
        readonly = value
      }
    }
    ;(globalThis as any).window = { Server: { isLinux: true, Password: '' } }
    const mock = `const state=globalThis.__linuxMigration;
      export const uuid=()=> 'test-id', reactiveBind=(v)=>v;
      export const I18nT=(key)=>key, MessageError=(text)=>state.messages.push('error:'+text),MessageSuccess=(text)=>state.messages.push('success:'+text);
      export const AppStore=()=>({}), AppCustomerModule={},ElMessageBox={prompt:()=>{throw Error('unexpected password prompt')}};
      export const beginServiceStatusPending=()=>()=>{},noteServiceStatusRevision=()=>{},isPositiveHostPid=(p)=>/^\\d+$/.test(p);
      export const forkTerminalRequest=async(...args)=>{state.calls.push(args);return {code:0,data:{'APP-Service-Start-PID':'12345'}}};
      export const AsyncComponentSetup=()=>({show:true,onClosed:()=>{},onSubmit:()=>{},closedFn:()=>{}});
      export const KeyCode={KeyS:1},KeyMod={CtrlCmd:1};
      export const EditorConfigMake=async(content,readOnly)=>{state.readonly=readOnly;return {readOnly}},EditorCreate=()=>({addAction:()=>{},setValue:()=>{},getValue:()=> 'draft'}),EditorDestroy=()=>{};
      export const fs={existsSync:async()=>true,readFile:async()=> 'profile content',writeFile:async()=>{throw Error('EACCES')}},shell={},FileWatcher=class {};
      export default {ConfirmWarning:async()=>{},send:()=>{state.calls.push(['IPC']);return Promise.resolve()},off:()=>{}};`
    const sfc = parse(
      await readFile('src/render/components/Tools/SystenEnv/edit.vue', 'utf8')
    ).descriptor
    const editorSource = compileScript(sfc, { id: 'linux-migration-editor' }).content
    const directory = await mkdtemp(join(tmpdir(), 'flyenv-linux-migration-'))
    try {
      const result = await build({
        stdin: {
          contents: `export * from './src/render/components/LanguageProjects/ProjectItem'; export * from './src/render/core/ModuleCustomer'; export * from './src/render/components/Host/LinuxHosts'; export {default as SystemEditor} from 'system-editor-fixture'; export * from './src/render/components/Log/setup'; export {ref as testRef} from 'vue'`,
          resolveDir: process.cwd()
        },
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
        plugins: [
          {
            name: 'linux-migration',
            setup(builder) {
              builder.onResolve({ filter: /^system-editor-fixture$/ }, () => ({
                path: 'editor',
                namespace: 'editor'
              }))
              builder.onLoad({ filter: /./, namespace: 'editor' }, () => ({
                contents: editorSource,
                loader: 'ts',
                resolveDir: process.cwd()
              }))
              builder.onResolve(
                { filter: /^(?:@\/|@lang\/|element-plus$|monaco-editor)/ },
                ({ path }) => ({ path, namespace: 'mock' })
              )
              builder.onLoad({ filter: /./, namespace: 'mock' }, () => ({
                contents: mock,
                loader: 'js'
              }))
            }
          }
        ]
      })
      const file = join(directory, 'renderer.mjs')
      await writeFile(file, result.outputFiles[0].text)
      const module = await import(pathToFileURL(file).href)
      if (selected === 'draft') {
        assert.equal(typeof module.reconcileLinuxHostsSave, 'function')
        const snapshot = { content: 'saved', digest: 'new-digest' }
        assert.deepEqual(
          module.reconcileLinuxHostsSave(snapshot, 'saved', 'typed while waiting', 'old-digest'),
          { content: 'typed while waiting', digest: 'new-digest' }
        )
        assert.deepEqual(
          module.reconcileLinuxHostsSave(
            { content: 'external change', digest: 'external' },
            'saved',
            'new draft',
            'old'
          ),
          { content: 'new draft', digest: 'old' },
          'unseen external changes must still cause a save conflict'
        )
      } else if (selected === 'background') {
        const project = new module.ProjectItem({ isService: true, isSudo: true })
        assert.equal(typeof (await project.start(false, false, false)), 'string')
        assert.equal(calls.length, 0, 'background sudo project must not open a terminal')
        assert.equal(project.state.running, false)
        assert.equal(await project.start(false, false, true), true)
        assert.equal((calls[0][1] as unknown[]).at(-1), true, 'interactive project uses XTerm')
        calls.length = 0
        const custom = new module.ModuleCustomerExecItem({ isSudo: true })
        let preparations = 0
        custom.onStart(async () => {
          preparations++
          return { isService: true }
        })
        assert.equal(typeof (await custom.start(false)), 'string')
        assert.equal(
          preparations,
          0,
          'rejected background request cannot stop another service during preparation'
        )
        assert.equal(calls.length, 0, 'background custom sudo service must not open a terminal')
        assert.equal(custom.running, false)
        assert.equal(await custom.start(true), true)
        assert.equal((calls[0][1] as unknown[]).at(-1), true)
      } else if (selected === 'readonly') {
        const context = { expose: () => {} }
        const state = module.SystemEditor.setup({ file: '/etc/profile' }, context)
        state.input.value = { style: {} }
        await new Promise((resolve) => setImmediate(resolve))
        await state.initEditor()
        assert.equal(readonly, true, 'Linux system profile editor must be read-only')
        await state.doSubmit()
        assert.equal(calls.length, 0, 'read-only target cannot submit by shortcut')
        readonly = true
        const userState = module.SystemEditor.setup({ file: '/home/user/.bashrc' }, context)
        userState.input.value = { style: {} }
        await new Promise((resolve) => setImmediate(resolve))
        await userState.initEditor()
        assert.equal(readonly, false, 'user profile remains editable')
      } else if (selected === 'log') {
        // Let asyncComputed observe a present file; failed ordinary writes must show an error only.
        const state = module.LogSetup(module.testRef('/test/root-owned.log'))
        await new Promise((resolve) => setTimeout(resolve, 30))
        state.logDo('clean')
        await new Promise((resolve) => setImmediate(resolve))
        assert.ok(
          messages.some((message) => message.startsWith('error:')),
          'denied cleanup must show an error'
        )
        assert.ok(messages.every((message) => !message.startsWith('success:')))
        assert.equal(calls.length, 0, 'Linux log cleanup has no generic root fallback')
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
      delete (globalThis as any).__linuxMigration
      delete (globalThis as any).window
    }
  },
  async tool() {
    const directory = await mkdtemp(join(tmpdir(), 'flyenv-linux-tool-'))
    try {
      const result = await build({
        entryPoints: ['src/fork/module/Tool/index.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
        plugins: [
          {
            name: 'tool-fixture',
            setup(builder) {
              builder.onResolve({ filter: /./ }, ({ path, importer }) => {
                if (
                  !importer.replaceAll('\\', '/').endsWith('Tool/index.ts') ||
                  path === '@shared/ForkPromise' ||
                  path === 'path'
                )
                  return
                return { path, namespace: 'mock' }
              })
              builder.onLoad({ filter: /./, namespace: 'mock' }, ({ path }) => ({
                contents:
                  path === '../../Fn'
                    ? `export const writeFileByRoot=async()=>{throw Error('EACCES')},readFileByRoot=async()=>{throw Error('EACCES')},getAllFileAsync=()=>{},systemProxyGet=()=>{},existsSync=()=>true;`
                    : `export class Base {}; export const isLinux=()=>true; export const TaskQueue=class {},TaskQueueProgress={},I18nT=()=>'',BomCleanTask=class {},killPorts=()=>{},killPids=()=>{},getPortPids=()=>{},getPidsByKey=()=>{},fetchEnvPath=()=>{},fetchPATH=()=>{},handleUpdatePath=()=>{},updatePATH=()=>{},removePATH=()=>{},setAlias=()=>{},cleanAlias=()=>{},runInTerminal=()=>{},openPathByApp=()=>{},initAllowDir=()=>{},initFlyEnvSH=()=>{};export default class {};`,
                loader: 'js'
              }))
            }
          }
        ]
      })
      const file = join(directory, 'tool.mjs')
      await writeFile(file, result.outputFiles[0].text)
      const { default: tool } = await import(pathToFileURL(file).href)
      await assert.rejects(Promise.resolve(tool.writeFileByRoot('/root/log', '')), /EACCES/)
      await assert.rejects(Promise.resolve(tool.readFileByRoot('/root/log')), /EACCES/)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
}
const run =
  selected && ['draft', 'background', 'readonly', 'log'].includes(selected)
    ? cases.renderer
    : cases[selected ?? '']
assert.ok(run, 'select transport, installer, draft, background, readonly, log, or tool')
await run()
console.log(`Linux migration ${selected}: passed`)
