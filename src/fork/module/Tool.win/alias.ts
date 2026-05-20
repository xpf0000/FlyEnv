import { addPath, existsSync, mkdirp, removeByRoot, uuid, writeFile } from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { join, resolve as PathResolve } from 'path'
import type { AppServiceAliasItem, SoftInstalled } from '@shared/app'
import Helper from '../../Helper'

async function removeFixed(dir: string) {
  try {
    await removeByRoot(dir)
  } catch {}
}

export function setAlias(
  service: SoftInstalled,
  item: AppServiceAliasItem | undefined,
  old: AppServiceAliasItem | undefined,
  alias: Record<string, AppServiceAliasItem[]>
) {
  return new ForkPromise(async (resolve) => {
    const aliasDir = PathResolve(global.Server.BaseDir!, '../alias')
    await mkdirp(aliasDir)
    if (old?.id) {
      const oldFile = join(aliasDir, `${old.name}.bat`)
      if (existsSync(oldFile)) {
        await removeFixed(oldFile)
      }
      const index = alias?.[service.bin]?.findIndex((a) => a.id === old.id)
      if (index >= 0) {
        alias[service.bin].splice(index, 1)
      }
    }

    if (item) {
      const file = join(aliasDir, `${item.name}.bat`)
      if (item?.php?.bin) {
        const bin = item?.php?.bin?.replace('php-cgi.exe', 'php.exe')
        const content = `@echo off
chcp 65001>nul
"${bin}" "${service.bin}" %*`
        await writeFile(file, content)
      } else {
        const bin = service.bin.replace('php-cgi.exe', 'php.exe')
        const content = `@echo off
chcp 65001>nul
"${bin}" %*`
        await writeFile(file, content)
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

    try {
      await Helper.send('tools', 'setSystemEnv', 'FLYENV_ALIAS', aliasDir)
    } catch {}

    await addPath('%FLYENV_ALIAS%')

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
          const file = join(aliasDir, `${i.name}.bat`)
          if (existsSync(file)) {
            await removeFixed(file)
          }
        }
        delete alias[bin]
      } else {
        const arr: AppServiceAliasItem[] = []
        for (const i of item) {
          if (i?.php?.bin && !existsSync(i?.php?.bin)) {
            const file = join(aliasDir, `${i.name}.bat`)
            if (existsSync(file)) {
              await removeFixed(file)
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
