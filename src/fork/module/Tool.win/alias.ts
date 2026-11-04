import { addPath, existsSync, mkdirp, removeByRoot, uuid, writeFile } from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import { join, resolve as PathResolve } from 'path'
import type { AppServiceAliasItem, SoftInstalled } from '@shared/app'
import Helper from '../../Helper'
import EnvSync from '@shared/EnvSync'
import { timeOperation } from '@shared/OperationTiming'
import { notifyWindowsEnvironmentChanged } from '@shared/WindowsEnvironmentBroadcast'

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
  return new ForkPromise(async (resolve, reject) => {
    // 记录单变量提交成功；即使后续 addPath/清理失败，也通知该已发生的变更。
    let environmentWritten = false
    try {
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

      // 系统环境变量写入必须保留拒绝/取消终态；否则会生成 alias 但向用户误报已生效。
      await Helper.send('tools', 'setSystemEnv', 'FLYENV_ALIAS', aliasDir)
      environmentWritten = true
      // 单变量实际写入成功后立即清缓存，覆盖 UAC 与 Helper；通用 RPC/通知不清理。
      // 必须在后续 addPath 的环境读取前登记失效，否则 %FLYENV_ALIAS% 可能展开为旧值。
      // 不等待回执、不主动 sync；后续取数沿用 EnvSync 内部屏障，清理失败不重放写入。
      void timeOperation('path.invalidate-env', () => EnvSync.clean()).catch(() => {})

      await addPath('%FLYENV_ALIAS%')

      const res = await cleanAlias(alias)

      resolve(res)
    } catch (error) {
      reject(error)
    } finally {
      // 已写入但后续失败也先结算；仅结算之后通知，不等待或覆盖业务终态。
      if (environmentWritten) notifyWindowsEnvironmentChanged()
    }
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
