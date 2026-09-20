import { h } from 'vue'
import type { AppModuleItem } from '@/core/type'

const View = {
  name: 'FlyEnvExamplePlugin',
  setup() {
    return () =>
      h('div', { style: 'padding: 24px' }, [
        h('h2', { style: 'font-size: 20px; font-weight: 600; margin-bottom: 12px' }, 'Example Plugin'),
        h('p', 'This page is loaded from a FlyEnv plugin bundle.')
      ])
  }
}

const Aside = {
  name: 'FlyEnvExamplePluginAside',
  setup() {
    return () => h('span', 'Example')
  }
}

const module = {
  moduleType: 'other',
  typeFlag: 'example-plugin',
  label: 'Example Plugin',
  asideIndex: 999,
  aside: Aside,
  index: View,
  isService: false,
  isTray: false
} as unknown as AppModuleItem

export default module
