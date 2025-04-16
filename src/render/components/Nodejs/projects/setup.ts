import { reactive } from 'vue'
import { I18nT } from '@lang/index'
import localForage from 'localforage'
import Base from '@/core/Base'
import { uuid } from '@shared/utils'
import IPC from '@/util/IPC'
import { MessageError } from '@/util/Element'

const { dialog } = require('@electron/remote')
const { join } = require('path')
const { writeFile, existsSync } = require('fs-extra')

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
  setDirEnv: (item: NodeProjectItem) => Promise<any>
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
  },
  async setDirEnv(item: NodeProjectItem) {
    IPC.send('app-fork:tools', 'initFlyEnvSH').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 1) {
        MessageError(res?.msg ?? '')
      }
    })
    try {
      const envFile = join(item.path, '.flyenv')
      if (!item.nodeVersion) {
        await writeFile(envFile, '')
      } else {
        const arr = [item.nodePath, join(item.nodePath, 'bin'), join(item.nodePath, 'sbin')].filter(
          (s) => existsSync(s)
        )
        await writeFile(
          envFile,
          `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n$env:PATH = "${arr.join(';')};" + $env:PATH`
        )
      }
    } catch (e: any) {
      MessageError(e.toString())
    }
  }
})
