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
