import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { createRenderer, defineComponent, h, nextTick } from 'vue'
import { loadBundle, pluginRoot } from './harness'
const keyA = '["test/models","main","a.gguf"]',
  keyB = '["test/models","main","b.gguf"]'
const flatten = (n: any): any[] => [n, ...(n.children ?? []).flatMap(flatten)]
const text = (n: any): string => (n.text ?? '') + (n.children ?? []).map(text).join('')
const flush = async () => {
  await new Promise((r) => setImmediate(r))
  await nextTick()
}
test('real mounted model editor keeps draft and service model separate and persists explicit user edits', async () => {
  const files = ['a.gguf', 'b.gguf', 'mmproj-BF16.gguf', 'missing.gguf'].map((path) => ({
    repoId: 'test/models',
    revision: 'main',
    path,
    localPath: '/models/' + path,
    size: 8,
    downloadUrl: '',
    downloadedAt: 1,
    standalone: !path.startsWith('mmproj')
  }))
  const state: any = {
    data: new Map<string, any>([
      ['flyenv-llama-cpp-models', files],
      ['flyenv-llama-cpp-settings', { selectedModel: files[3] }]
    ]),
    errors: [],
    off: [],
    runtime: {
      bin: '/runtime/server',
      path: '/runtime',
      version: 'test',
      flag: 'cpu',
      run: false,
      running: false
    },
    sent: []
  }
  ;(globalThis as any).__llamaUI = state
  const sources = {
    '@/util/Index': `import {reactive} from 'vue';export const reactiveBind=value=>reactive(value)`,
    '@/util/Storage': `export const StorageGetAsync=async k=>globalThis.__llamaUI.data.get(k);export const StorageSetAsync=async(k,v)=>{globalThis.__llamaUI.data.set(k,JSON.parse(JSON.stringify(v)))};export const StorageRemoveAsync=async()=>{}`,
    '@/util/Element': `export const MessageError=e=>globalThis.__llamaUI.errors.push(e);export const MessageSuccess=()=>{}`,
    '@/util/NodeFn': `export const dialog={showOpenDialog:async()=>({canceled:true,filePaths:[]})}`,
    '@/store/brew': `export const BrewStore=()=>({currentVersion:()=>globalThis.__llamaUI.runtime,module:()=>({installed:[globalThis.__llamaUI.runtime]})})`,
    '@lang/index': `export const AppI18n=()=>({global:{locale:'en'}});export const I18nT=k=>k`,
    'element-plus': `export const ElMessageBox={confirm:async()=>true}`,
    '@/util/IPC': `const ipc={send(command,method,...args){const h=globalThis.__llamaUI;h.sent.push(method);return {then(cb){queueMicrotask(()=>cb('key',{code:0,data:method==='inspectLocalModelFiles'?args[0].map(path=>({path,status:path.endsWith('/missing.gguf')?'missing':'available'})):method==='getRuntimeCapabilities'?{status:'known',byAlias:{},help:''}:method==='getLaunchState'?{kind:'stopped'}:{requestKey:'test',issues:[],prepared:{requestKey:'test'}}}))}}},off:k=>globalThis.__llamaUI.off.push(k)};ipc.sendSensitive=ipc.send;export default ipc`
  }
  const component = await loadBundle(
    join(pluginRoot, 'render/settings/ModelSettings.vue'),
    sources,
    true
  )
  const controller = await loadBundle(join(pluginRoot, 'render/controller.ts'), sources)
  // Both bundles use the same durable boundary. The component's actual singleton
  // writes Storage; the independently loaded controller verifies what it persisted.
  const renderer = createRenderer<any, any>({
    createElement: (type) => ({ type, props: {}, children: [] }),
    createText: (text) => ({ type: 'text', text, children: [] }),
    createComment: (text) => ({ type: 'comment', text, children: [] }),
    setText: (n, t) => {
      n.text = t
    },
    setElementText: (n, t) => {
      n.text = t
      n.children = []
    },
    parentNode: (n) => n.parent,
    nextSibling: () => null,
    insert(n, p, anchor) {
      if (n.parent) {
        const i = n.parent.children.indexOf(n)
        if (i >= 0) n.parent.children.splice(i, 1)
      }
      n.parent = p
      const index = anchor ? p.children.indexOf(anchor) : -1
      if (index < 0) p.children.push(n)
      else p.children.splice(index, 0, n)
    },
    remove(n) {
      const i = n.parent?.children.indexOf(n)
      if (i >= 0) n.parent.children.splice(i, 1)
    },
    patchProp: (n, k, _a, b) => {
      n.props[k] = b
    }
  })
  const root = { type: 'root', children: [] }
  const app = renderer.createApp(component.default, {
    initialModelKey: '["test/models","main","missing.gguf"]'
  })
  const warnings: string[] = []
  app.config.warnHandler = (m) => warnings.push(m)
  for (const name of [
    'el-scrollbar',
    'el-form',
    'el-form-item',
    'el-select',
    'el-option',
    'el-divider',
    'el-input-number',
    'el-input',
    'el-radio-group',
    'el-radio-button',
    'el-button',
    'el-collapse',
    'el-collapse-item',
    'el-tooltip',
    'el-alert',
    'el-empty',
    'el-tag'
  ])
    app.component(
      name,
      defineComponent({
        inheritAttrs: false,
        props: {
          modelValue: { type: [String, Number, Boolean, Array, Object], default: undefined }
        },
        setup(p, { attrs, slots }) {
          return () => h(name, { ...attrs, modelValue: p.modelValue }, slots.default?.())
        }
      })
    )
  app.mount(root)
  try {
    await flush()
    const selector = flatten(root).find(
      (n) => n.type === 'el-select' && n.props.modelValue === keyA
    )
    assert.ok(selector)
    assert.ok(
      !flatten(selector).some(
        (n) => n.type === 'el-option' && String(n.props.value).includes('missing.gguf')
      )
    )
    const setService = flatten(root).find(
      (n) => n.type === 'el-button' && text(n) === 'Set as service model'
    )
    assert.ok(setService)
    await setService.props.onClick()
    await flush()
    assert.equal(state.data.get('flyenv-llama-cpp-settings-v2').selectedModelKey, keyA)
    assert.ok(
      state.data.get('flyenv-llama-cpp-settings-v2').modelProfiles[
        '["test/models","main","missing.gguf"]'
      ]
    )
    await selector.props.onChange(keyB)
    await flush()
    const number = flatten(root).find(
      (n) => n.type === 'el-input-number' && n.props.modelValue === 8192
    )
    assert.ok(number)
    number.props['onUpdate:modelValue'](16384)
    await flush()
    const radio = flatten(root).find(
      (n) => n.type === 'el-radio-group' && n.props.modelValue === 'unset'
    )
    assert.ok(radio)
    radio.props['onUpdate:modelValue']('projector')
    await flush()
    const projectorKey = '["test/models","main","mmproj-BF16.gguf"]'
    const projectorSelect = flatten(root).find(
      (n) =>
        n.type === 'el-select' &&
        flatten(n).some((o) => o.type === 'el-option' && o.props.value === projectorKey)
    )
    assert.ok(projectorSelect)
    projectorSelect.props.onChange(projectorKey)
    await flush()
    const save = flatten(root).find((n) => n.type === 'el-button' && text(n) === 'Save settings')
    assert.ok(save)
    await save.props.onClick()
    await flush()
    await controller.LlamaCppManager.init()
    assert.equal(controller.LlamaCppManager.settings.selectedModelKey, keyA)
    assert.equal(controller.LlamaCppManager.settings.modelProfiles[keyB].base.contextSize, 16384)
    assert.equal(
      controller.LlamaCppManager.settings.modelProfiles[keyB].multimodal.projector.fileKey,
      projectorKey
    )
    const defaults = flatten(root).find(
      (n) => n.type === 'el-button' && text(n) === 'Restore model defaults'
    )
    assert.ok(defaults)
    defaults.props.onClick()
    await flush()
    await save.props.onClick()
    await flush()
    assert.equal(
      state.data.get('flyenv-llama-cpp-settings-v2').modelProfiles[keyB].base.contextSize,
      8192
    )
    assert.deepEqual(state.errors, [])
    assert.deepEqual(warnings, [])
  } finally {
    app.unmount()
    await flush()
  }
})
