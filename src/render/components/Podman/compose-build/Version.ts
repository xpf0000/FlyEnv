import { reactive } from 'vue'
import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'
import IPC from '@/util/IPC'
import { reactiveBindObject } from '@/util/Index'

type VersionsType = Record<string, string[]>
type FetchingType = Record<string, boolean>

type VersionManagerType = {
  versions: VersionsType
  fetching: FetchingType
  init: (image: string) => Promise<void>
  save: (image: string) => Promise<void>
}

const VersionManager: VersionManagerType = reactiveBindObject({
  versions: {},
  fetching: {},
  async init(image: string) {
    this.fetching[image] = true
    try {
      const arr: string[] = await StorageGetAsync(`flyenv-podman-image-${image}-versions`)
      this.versions[image] = reactive(arr)
      delete this.fetching[image]
      return
    } catch {}
    IPC.send('app-fork:podman', 'composeImageVersion', image).then((key, res) => {
      IPC.off(key)
      const list = res?.data ?? []
      if (list.length) {
        this.versions[image] = reactive(list)
        this.save(image).catch()
      }
      delete this.fetching[image]
    })
  },
  async save(image: string) {
    const arr = this.versions?.[image]
    console.log('save: ', image, arr, arr.length, this.versions)
    if (arr && arr.length) {
      const key = `flyenv-podman-image-${image}-versions`
      try {
        await StorageSetAsync(key, arr, 3 * 24 * 60 * 60)
      } catch {}
    }
  }
} as VersionManagerType)

export { VersionManager }
