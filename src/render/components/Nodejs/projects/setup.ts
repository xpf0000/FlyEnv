import { reactive } from 'vue'
import { I18nT } from '@lang/index'
import localForage from 'localforage'
import Base from '@/core/Base'
import { uuid } from '@shared/utils'

const { dialog } = require('@electron/remote')

export type NodeProjectItem = {
  id: string
  path: string
  comment: string
  nodeVersion: string
  nodePath: string
  nodeBin: string
  isSorting?: boolean
}

export const NodeProjectSetup = reactive<{
  fetching: boolean
  project: Array<NodeProjectItem>
  search: string
  saveProject: () => void
  fetchProject: () => void
  addProject: () => void
  delProject: (index: number) => void
}>({
  fetching: false,
  project: [],
  search: '',
  saveProject() {
    localForage
      .setItem('flyenv-node-projects', JSON.parse(JSON.stringify(NodeProjectSetup.project)))
      .then()
      .catch()
  },
  fetchProject() {
    if (NodeProjectSetup.fetching) {
      return
    }
    NodeProjectSetup.fetching = true
    localForage
      .getItem('flyenv-node-projects')
      .then((res: NodeProjectItem[]) => {
        NodeProjectSetup.project.splice(0)
        NodeProjectSetup.project.push(...res)
      })
      .catch()
      .finally(() => {
        NodeProjectSetup.fetching = false
      })
  },
  addProject() {
    dialog
      .showOpenDialog({
        properties: ['openDirectory', 'createDirectory', 'showHiddenFiles']
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const [path] = filePaths
        const find = NodeProjectSetup.project.find((p) => p.path === path)
        if (find) {
          return
        }
        const item: NodeProjectItem = {
          id: uuid(),
          path,
          comment: '',
          nodeVersion: '',
          nodePath: '',
          nodeBin: ''
        }
        NodeProjectSetup.project.unshift(item)
        NodeProjectSetup.saveProject()
      })
  },
  delProject(index: number) {
    Base._Confirm(I18nT('base.delAlertContent'), undefined, {
      customClass: 'confirm-del',
      type: 'warning'
    })
      .then(() => {
        NodeProjectSetup.project.splice(index, 1)
        NodeProjectSetup.saveProject()
      })
      .catch(() => {})
  }
})
