import { reactive, watch } from 'vue'
import localForage from 'localforage'
import { md } from '@/util/NodeFn'

export class MarkdownPreviewTab {
  md = ''
  html = ''

  initFN?: () => void

  watcher: any = null

  constructor(obj?: any) {
    Object.assign(this, obj)
  }

  initWatch() {
    this.watcher = watch(
      () => this.md,
      (v) => {
        if (!v) {
          this.html = ''
          return
        }
        md.render(v).then((html: string) => {
          this.html = html
        })
      }
    )
  }

  destroy() {
    if (this.watcher) {
      this.watcher()
      this.watcher = null
    }
  }
}

export type MarkdownPreviewType = {
  index: number
  currentTab: string
  style: any
  tabs: { [k: string]: MarkdownPreviewTab }
  init: () => void
  save: () => void
}

let style: any = localStorage.getItem('FlyEnv-MarkdownPreview-LeftStyle')
if (style) {
  style = JSON.parse(style)
}

const MarkdownPreview: MarkdownPreviewType = reactive({
  index: 1,
  currentTab: 'tab-1',
  style: style,
  tabs: {
    'tab-1': reactive(new MarkdownPreviewTab())
  },
  init() {
    localForage
      .getItem('flyenv-markdown-preview')
      .then((res: any) => {
        if (res && res?.tabs) {
          let index = 0
          for (const k in res.tabs) {
            const i = Number(k.split('-').pop())
            index = Math.max(index, i)
            MarkdownPreview.tabs?.[k]?.destroy?.()
            MarkdownPreview.tabs[k] = reactive(new MarkdownPreviewTab(res.tabs[k]))
            MarkdownPreview.tabs[k].initWatch()
          }
          MarkdownPreview.index = index
        }
      })
      .catch()
  },
  save() {
    const tabs: any = {}
    for (const k in MarkdownPreview.tabs) {
      const v = MarkdownPreview.tabs[k]
      tabs[k] = JSON.parse(JSON.stringify(v))
    }
    localForage.setItem('flyenv-markdown-preview', {
      tabs
    })
  }
})

const tab = MarkdownPreview.tabs['tab-1']
tab.destroy = tab.destroy.bind(tab)
tab.initWatch = tab.initWatch.bind(tab)
tab.initWatch()

export default MarkdownPreview
