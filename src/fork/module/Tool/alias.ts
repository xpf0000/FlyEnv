import { chmod, existsSync, mkdirp, remove, uuid, writeFile } from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { dirname, join, resolve as PathResolve } from 'node:path'
import type { AppServiceAliasItem, SoftInstalled } from '@shared/app'
import { defaultShell } from '@shared/utils'
import { parseExportPathEntries } from './pathExport'
import { updateShellProfiles } from './shellProfiles'

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

    const appDir = dirname(global.Server.AppDir!)
    await updateShellProfiles((content) => {
      const regex = new RegExp(
        `^(?!\\s*#)\\s*export\\s*PATH\\s*=\\s*"(.*?)(${appDir})(.*?)\\$PATH"`,
        'gmu'
      )
      const arr: string[] = []
      for (const match of content.match(regex) ?? []) {
        content = content.replace(`\n${match}`, '').replace(match, '')
        arr.push(...parseExportPathEntries(match))
      }
      arr.unshift(aliasDir)
      arr.push('$PATH')
      const path = Array.from(new Set(arr)).join(':')
      return content.trim() + `\nexport PATH="${path}"\n`
    })
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
