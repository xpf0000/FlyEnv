import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'

for (const kind of ['PortKill', 'ProcessKill']) {
  const file = `src/render/components/Tools/${kind}/Index.vue`
  const source = readFileSync(file, 'utf8')
  const { descriptor } = parse(source)
  const compiled = compileScript(descriptor, { id: kind })
  assert.deepEqual(
    compileTemplate({
      id: kind,
      filename: file,
      source: descriptor.template!.content,
      compilerOptions: { bindingMetadata: compiled.bindings }
    }).errors,
    []
  )
  let confirm: (() => void) | undefined
  const stopped: any[] = []
  const controller = {
    lastPort: '80',
    lastKey: 'example',
    rows: [{ PID: '123', children: [{ PID: '456' }] }],
    processes: [{ PID: '123' }, { PID: '456' }],
    kill: (...args: any[]) => stopped.push(args),
    search() {}
  }
  const dependencies: Record<string, any> = {
    vue: {
      defineComponent: (value: any) => value,
      ref: (value: any) => ({ value }),
      computed: (read: () => any) => ({
        get value() {
          return read()
        }
      })
    },
    '@element-plus/icons-vue': { Search: {} },
    './Controller': controller,
    '@/core/Base': { _Confirm: () => new Promise<void>((resolve) => (confirm = resolve)) },
    '@lang/index': { I18nT: (key: string) => key },
    '@/store/searchHistory': { SearchHistory: { init() {}, add() {}, search: {} } }
  }
  const bundled = await build({
    stdin: { contents: compiled.content, loader: 'ts' },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
    plugins: [
      {
        name: 'view-boundaries',
        setup(builder) {
          builder.onResolve({ filter: /./ }, ({ path }) => ({ path, external: true }))
        }
      }
    ]
  })
  const module = { exports: {} as any }
  runInNewContext(bundled.outputFiles[0].text, {
    module,
    exports: module.exports,
    require: (path: string) => {
      assert.ok(path in dependencies, path)
      return dependencies[path]
    },
    window: { Server: { isWindows: false } }
  })
  const view = module.exports.default.setup({}, { expose() {} })
  assert.equal(view.useSudo.value, false)
  view.select.value = [{ PID: '123' }]
  view.useSudo.value = true
  view.cleanSelect()
  view.select.value = [{ PID: '789' }]
  view.useSudo.value = false
  confirm!()
  await Promise.resolve()
  assert.deepEqual(JSON.parse(JSON.stringify(stopped)), [[['123'], true]])
  view.cleanAll()
  controller.processes = [{ PID: '999' }]
  view.useSudo.value = true
  confirm!()
  await Promise.resolve()
  assert.deepEqual(
    JSON.parse(JSON.stringify(stopped[1])),
    [['123', '456'], false],
    'all includes nested processes and snapshots the original request'
  )
  assert.match(descriptor.template!.content, /<el-checkbox\s+v-if="!isWindows"\s+v-model="useSudo"/)
  console.log(`${kind}: Vue compilation, default sudo off and confirmation snapshots passed`)
}
assert.doesNotMatch(readFileSync('src/render/util/XTerm.ts', 'utf8'), /console\.log\('xterm onData/)
