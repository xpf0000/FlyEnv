import { appendFile, existsSync, copyFile, execPromise } from '../Fn'
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

export async function unpack(zipFile: string, dist: string) {
  const zip: string = zipFile.trim()
  const maxBuffer = 1024 * 1024 * 50
  const opt = { maxBuffer }
  if (zip.includes('.tar.xz')) {
    await execPromise(`tar -xJf "${zip}" -C "${dist}" > /dev/null`, opt)
  } else if (zip.includes('.tar.gz') || zip.includes('.tgz')) {
    await execPromise(`tar -xzf "${zip}" -C "${dist}" > /dev/null`, opt)
  } else if (zip.includes('.tar.bz2') || zip.includes('.tbz2')) {
    await execPromise(`tar -xjf "${zip}" -C "${dist}" > /dev/null`, opt)
  } else if (zip.includes('.tar')) {
    await execPromise(`tar -xf "${zip}" -C "${dist}" > /dev/null`, opt)
  } else if (zip.includes('.zip')) {
    await execPromise(`unzip -q "${zip}" -d "${dist}" > /dev/null`, opt)
  } else if (zip.includes('.gz') && !zip.includes('.tar.gz')) {
    await execPromise(`gzip -d "${zip}" -c > "${dist}/${zip.replace('.gz', '')}"`, opt)
  } else if (zip.includes('.bz2') && !zip.includes('.tar.bz2')) {
    await execPromise(`bzip2 -d "${zip}" -c > "${dist}/${zip.replace('.bz2', '')}"`, opt)
  } else if (zip.includes('.xz') && !zip.includes('.tar.xz')) {
    await execPromise(`xz -d "${zip}" -c > "${dist}/${zip.replace('.xz', '')}"`, opt)
  } else {
    throw new Error(`Unsupported file format: ${zip}`)
  }
}
