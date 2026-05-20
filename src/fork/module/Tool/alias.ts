import {
  chmod,
  existsSync,
  mkdirp,
  readFileByRoot,
  remove,
  uuid,
  writeFile,
  writeFileByRoot
} from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { dirname, join, resolve as PathResolve } from 'node:path'
import type { AppServiceAliasItem, SoftInstalled } from '@shared/app'
import { defaultShell, isMacOS } from '@shared/utils'
import { fetchPATH } from './path'

export function setAlias(
  service: SoftInstalled,
  item: AppServiceAliasItem | undefined,
  old: AppServiceAliasItem | undefined,
  alias: Record<string, AppServiceAliasItem[]>
) {
  return new ForkPromise(async (resolve, reject) => {
    const aliasDir = PathResolve(global.Server.BaseDir!, '../alias')
    await mkdirp(aliasDir)
    if (old?.id) {
      const oldFile = join(aliasDir, `${old.name}`)
      if (existsSync(oldFile)) {
        await remove(oldFile)
      }
      const index = alias?.[service.bin]?.findIndex((a) => a.id === old.id)
      if (index >= 0) {
        alias[service.bin].splice(index, 1)
      }
    }

    if (item) {
      const shell = defaultShell()
      const file = join(aliasDir, `${item.name}`)
      if (item?.php?.bin) {
        const content = `${shell}
"${item?.php?.bin}" "${service.bin}" $@`
        await writeFile(file, content)
        await chmod(file, '0777')
      } else {
        let bin = service.bin
        if (service.typeFlag === 'php') {
          bin = service?.phpBin ?? join(service.path, 'bin/php')
        }
        const content = `${shell}
"${bin}" $@`
        await writeFile(file, content)
        await chmod(file, '0777')
      }
      if (!item.id) {
        item.id = uuid(8)
        if (!alias[service.bin]) {
          alias[service.bin] = []
        }
        alias[service.bin].unshift(item)
      } else {
        const index = alias?.[service.bin]?.findIndex((a) => a.id === item.id)
        if (index >= 0) {
          alias[service.bin].splice(index, 1, item)
        } else {
          alias[service.bin].unshift(item)
        }
      }
    }

    const allPath = (await fetchPATH()).allPath
    if (allPath.includes(aliasDir)) {
      const res = await cleanAlias(alias)
      resolve(res)
      return
    }

    const zshrc = join(global.Server.UserHome!, isMacOS() ? '.zshrc' : '.bashrc')
    if (!existsSync(zshrc)) {
      try {
        await writeFile(zshrc, '')
      } catch {}
    }
    if (!existsSync(zshrc)) {
      reject(new Error(`No found ${zshrc} and create file failed`))
      return
    }

    let content = ''
    try {
      content = await readFileByRoot(zshrc)
    } catch (e) {
      reject(e)
      return
    }

    const appDir = dirname(global.Server.AppDir!)
    const regex = new RegExp(
      `^(?!\\s*#)\\s*export\\s*PATH\\s*=\\s*"(.*?)(${appDir})(.*?)\\$PATH"`,
      'gmu'
    )

    const matchs = content.match(regex) ?? []
    const arr: string[] = []
    matchs.forEach((x: string) => {
      content = content.replace(`\n${x}`, '').replace(`${x}`, '')
      const list = x
        .trim()
        .replace('export', '')
        .replace('PATH', '')
        .replace('=', '')
        .replace(new RegExp('"'), '')
        .replace(new RegExp('\\$PATH'), '')
        .split(':')
        .filter((s) => !!s.trim())
      arr.push(...list)
    })
    arr.unshift(aliasDir)
    arr.push(`$PATH`)
    const path = Array.from(new Set(arr)).join(':')
    content = content.trim() + `\nexport PATH="${path}"\n`
    try {
      await writeFileByRoot(zshrc, content)
    } catch {}
    const res = await cleanAlias(alias)
    resolve(res)
  })
}

export function cleanAlias(alias: Record<string, AppServiceAliasItem[]>) {
  return new ForkPromise(async (resolve) => {
    const aliasDir = PathResolve(global.Server.BaseDir!, '../alias')
    for (const bin in alias) {
      const item = alias[bin]
      if (!existsSync(bin)) {
        for (const i of item) {
          const file = join(aliasDir, `${i.name}`)
          if (existsSync(file)) {
            await remove(file)
          }
        }
        delete alias[bin]
      } else {
        const arr: AppServiceAliasItem[] = []
        for (const i of item) {
          if (i?.php?.bin && !existsSync(i?.php?.bin)) {
            const file = join(aliasDir, `${i.name}`)
            if (existsSync(file)) {
              await remove(file)
            }
            continue
          }
          arr.push(i)
        }
        alias[bin] = arr
      }
    }
    resolve(alias)
  })
}
