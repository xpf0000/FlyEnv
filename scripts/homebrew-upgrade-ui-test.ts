import assert from 'node:assert/strict'
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import { parse, compileScript } from '@vue/compiler-sfc'
import { createRenderer, defineComponent, h, provide, inject, nextTick, reactive } from 'vue'
import { loadIsolated } from './helpers/load-isolated'
const source = await readFile('src/render/components/VersionManager/brew/index.vue', 'utf8')
const compiled = compileScript(parse(source).descriptor, {
  id: 'brew-upgrade',
  inlineTemplate: true
}).content
const entry = '.superpowers/sdd/2026-11-07-homebrew-language-upgrade/ui-component.ts'
await mkdir('.superpowers/sdd/2026-11-07-homebrew-language-upgrade', { recursive: true })
await writeFile(entry, compiled)
const old = { name: 'php', installed: true, version: '8.5.12' }
let begins = 0
let prepared = 0
const controller: any = reactive({
  busy: false,
  phase: 'idle',
  logs: '',
  catalog: {
    'homebrew/core/php': {
      eligible: true,
      outdated: true,
      installedVersions: ['8.4.1'],
      availableVersion: '8.5.12'
    }
  },
  prepare: async () => {
    prepared++
    return {
      previewId: 'secret',
      module: 'php',
      snapshot: {
        formula: 'homebrew/core/php',
        installedVersions: ['8.4.1'],
        availableVersion: '8.5.12'
      },
      targets: []
    }
  },
  confirm: async () => {
    begins++
  }
})
const { default: component } = await loadIsolated(
  entry,
  {
    '@lang/index': { I18nT: (key: string) => key },
    './Controller': { homebrewUpgrade: controller },
    './setup': {
      BrewSetup: { installing: false },
      Setup: () => ({
        tableData: [old],
        checkBrew: true,
        fetching: false,
        fetchCommand: () => '',
        formulaConflictTips: () => ''
      })
    }
  },
  { window: { Server: { isMacOS: true } } }
)
type Node = { tag: string; text: string; props: any; children: Node[]; parent?: Node }
const node = (tag: string, text = ''): Node => ({ tag, text, props: {}, children: [] })
const renderer = createRenderer<Node, Node>({
  createElement: (tag) => node(tag),
  createText: (text) => node('#text', text),
  createComment: () => node('#comment'),
  setText: (n, text) => {
    n.text = text
  },
  setElementText: (n, text) => {
    n.text = text
  },
  parentNode: (n) => n.parent!,
  nextSibling: (n) => n.parent?.children[n.parent.children.indexOf(n) + 1] ?? null,
  insert: (n, p, anchor) => {
    if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1)
    n.parent = p
    if (anchor) p.children.splice(p.children.indexOf(anchor), 0, n)
    else p.children.push(n)
  },
  remove: (n) => {
    n.parent?.children.splice(n.parent.children.indexOf(n), 1)
  },
  patchProp: (n, key, _old, value) => {
    n.props[key] = value
  }
})
const app = renderer.createApp(component, { typeFlag: 'php' })
app.component(
  'ElTable',
  defineComponent({
    props: ['data'],
    setup(p, { slots }) {
      provide('rows', p.data)
      return () => h('table', slots.default?.())
    }
  })
)
app.component(
  'ElTableColumn',
  defineComponent({
    setup(_p, { slots }) {
      const rows: any = inject('rows')
      return () =>
        h(
          'column',
          rows.map((row: any) => slots.default?.({ row }))
        )
    }
  })
)
app.component(
  'ElButton',
  defineComponent({
    inheritAttrs: false,
    setup(_p, { attrs, slots }) {
      return () => h('button', attrs, slots.default?.())
    }
  })
)
app.component(
  'ElDialog',
  defineComponent({
    props: ['modelValue'],
    setup(p, { slots }) {
      return () => (p.modelValue ? h('dialog', [slots.default?.(), slots.footer?.()]) : null)
    }
  })
)
for (const name of ['ElTooltip', 'ElAlert'])
  app.component(
    name,
    defineComponent({
      setup(_p, { slots }) {
        return () => h('span', slots.default?.())
      }
    })
  )
app.component('YbIcon', { render: () => null })
const root = node('root')
const vm = app.mount(root)
const all = (n: Node): Node[] => [n, ...n.children.flatMap(all)]
const text = (n: Node): string => n.text + n.children.map(text).join('')
const button = (label: string) =>
  all(root).find((n) => n.tag === 'button' && text(n).includes(label))!
assert.match(text(root), /8\.4\.1/)
await button('brewUpgrade').props.onClick()
await nextTick()
assert.equal(prepared, 1)
assert.match(text(root), /brewUpgradeWarning/)
assert.match(text(root), /8\.4\.1.*8\.5\.12/s)
assert(!text(root).includes('secret'))
await button('base.cancel').props.onClick()
await nextTick()
assert.equal(begins, 0)
await button('brewUpgrade').props.onClick()
await nextTick()
assert.match(text(root), /brewUpgradeSeriesChange/)
await button('brewUpgradeConfirm').props.onClick()
await nextTick()
assert.equal(begins, 1)
controller.catalog['homebrew/core/php'].eligible = false
controller.catalog['homebrew/core/php'].reason = 'pinned'
vm.$forceUpdate()
await nextTick()
assert.equal(button('versionmanager.brewUpgrade').props.disabled, true)
assert.match(text(root), /brewUpgradeReason.pinned/)
controller.catalogError = 'php metadata query timed out'
vm.$forceUpdate()
await nextTick()
const catalogAlert = all(root).find(
  (n) => n.props.title === 'versionmanager.brewUpgradeCatalogFailed'
)
assert(catalogAlert)
assert.equal(catalogAlert.props.description, 'php metadata query timed out')
controller.catalog['homebrew/core/php'].outdated = false
vm.$forceUpdate()
await nextTick()
assert.equal(button('versionmanager.brewUpgrade'), undefined)
app.unmount()
const english = JSON.parse(await readFile('src/lang/en/versionmanager.json', 'utf8'))
const keys = Object.keys(english).filter((key) => /^brew(?:Upgrade|Available|Package)/.test(key))
for (const lang of await readdir('src/lang')) {
  try {
    const pack = JSON.parse(await readFile(`src/lang/${lang}/versionmanager.json`, 'utf8'))
    for (const key of keys)
      assert.deepEqual(
        typeof pack[key] === 'object' ? Object.keys(pack[key]).sort() : typeof pack[key],
        typeof english[key] === 'object' ? Object.keys(english[key]).sort() : 'string',
        `${lang}:${key}`
      )
  } catch (error: any) {
    if (error.code !== 'ENOTDIR' && error.code !== 'ENOENT') throw error
  }
}
console.log(
  'PASS UI: real Vue component, installed/available, warning and target, cancel no action, confirm delegates once'
)
