import { dialog } from '@/util/NodeFn'

export function chooseFolder(): Promise<string> {
  return new Promise((resolve, reject) => {
    dialog
      .showOpenDialog({
        properties: ['openDirectory', 'createDirectory', 'showHiddenFiles']
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const [path] = filePaths
        resolve(path)
      })
      .catch(reject)
  })
}

export function chooseFile(): Promise<string> {
  return new Promise((resolve, reject) => {
    dialog
      .showOpenDialog({
        properties: ['openFile', 'showHiddenFiles']
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const [path] = filePaths
        resolve(path)
      })
      .catch(reject)
  })
}

export function initFileDroper(
  selecter: HTMLElement,
  callback?: (res: { files: string[]; ondrag: boolean }) => void
) {
  selecter.addEventListener('drop', async (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Get the collection of dragged files
    const files = Array.from(e.dataTransfer?.files ?? [])
    const dirs: File[] = []
    if (e.dataTransfer?.items?.length) {
      const items = Array.from(e.dataTransfer!.items)
      items.forEach((item: DataTransferItem, index) => {
        const entry = item.webkitGetAsEntry()
        if (entry?.isDirectory) {
          dirs.push(files[index])
        }
      })
    }

    const paths = dirs.map((f) => window.FlyEnvNodeAPI.showFilePath(f))
    console.log('paths: ', paths)

    callback?.({ files: paths, ondrag: false })
  })
  selecter.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })

  let dropNode: HTMLElement | undefined | null
  selecter.addEventListener(
    'dragenter',
    (e) => {
      dropNode = e.target as HTMLElement
      callback?.({ files: [], ondrag: true })
    },
    false
  )
  selecter.addEventListener(
    'dragleave',
    (e) => {
      if (e.target === dropNode) {
        callback?.({ files: [], ondrag: false })
      }
    },
    false
  )
}
