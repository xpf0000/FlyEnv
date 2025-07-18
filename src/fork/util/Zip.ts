import { appendFile, existsSync, copyFile } from '../Fn'
import { join, basename } from 'node:path'
import { createRequire } from 'node:module'
import { pathFixedToUnix } from '@shared/utils'

const require = createRequire(import.meta.url)
const compressing = require('7zip-min-electron')

export function zipUnpack(fp: string, dist: string) {
  console.log('zipUnpack start: ', fp, dist, global.Server.Static!)
  return new Promise(async (resolve, reject) => {
    const info = {
      fp,
      dist,
      static: global.Server.Static,
      isIncludes: fp.includes(global.Server.Static!)
    }
    await appendFile(
      join(global.Server.BaseDir!, 'debug.log'),
      `[zipUnpack][info]: ${JSON.stringify(info, undefined, 4)}\n`
    )
    let file = fp
    if (pathFixedToUnix(fp).includes(pathFixedToUnix(global.Server.Static!))) {
      const cacheFP = join(global.Server.Cache!, basename(fp))
      if (!existsSync(cacheFP)) {
        try {
          await copyFile(fp, cacheFP)
        } catch (e) {
          await appendFile(
            join(global.Server.BaseDir!, 'debug.log'),
            `[zipUnpack][copyFile][error]: ${e}\n`
          )
        }
      }
      file = cacheFP
      console.log('cacheFP: ', fp)
    }
    compressing.unpack(file, dist, async (err: any, res: any) => {
      console.log('zipUnpack end: ', err, res)
      if (err) {
        await appendFile(
          join(global.Server.BaseDir!, 'debug.log'),
          `[zipUnpack][unpack][error]: ${err}\n`
        )
        reject(err)
        return
      }
      resolve(true)
    })
  })
}
