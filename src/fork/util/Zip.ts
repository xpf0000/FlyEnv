import { appendFile, existsSync, copyFile } from '../Fn'
import { join, basename } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const compressing = require('7zip-min-electron')

export function zipUnPack(fp: string, dist: string) {
  console.log('zipUnPack start: ', fp, dist, global.Server.Static!)
  return new Promise(async (resolve, reject) => {
    const info = {
      fp,
      dist,
      static: global.Server.Static,
      isIncludes: fp.includes(global.Server.Static!)
    }
    await appendFile(
      join(global.Server.BaseDir!, 'debug.log'),
      `[zipUnPack][info]: ${JSON.stringify(info, undefined, 4)}\n`
    )
    if (fp.includes(global.Server.Static!)) {
      const cacheFP = join(global.Server.Cache!, basename(fp))
      if (!existsSync(cacheFP)) {
        try {
          await copyFile(fp, cacheFP)
        } catch (e) {
          await appendFile(
            join(global.Server.BaseDir!, 'debug.log'),
            `[zipUnPack][copyFile][error]: ${e}\n`
          )
        }
      }
      fp = cacheFP
      console.log('cacheFP: ', fp)
    }
    compressing.unpack(fp, dist, async (err: any, res: any) => {
      console.log('zipUnPack end: ', err, res)
      if (err) {
        await appendFile(
          join(global.Server.BaseDir!, 'debug.log'),
          `[zipUnPack][unpack][error]: ${err}\n`
        )
        reject(err)
        return
      }
      resolve(true)
    })
  })
}
