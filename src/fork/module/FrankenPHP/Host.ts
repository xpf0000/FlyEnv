import type { AppHost } from '@shared/app'
import { join } from 'path'
import { hostAlias, mkdirp, readFile, writeFile, removeByRoot } from '../../Fn'
import { existsSync } from 'fs'
import { isEqual } from 'lodash-es'
import { pathFixedToUnix } from '@shared/utils'
import { vhostTmpl } from '../Host/Host'
import { vhostName } from '../Host/vhostName'
import { fetchHostList } from '../Host/HostFile'

// #700: FrankenPHP has its own listening ports. For sites created before this
// field existed, fall back to the Caddy port to preserve behavior.
const fpPort = (host: AppHost) => host?.port?.frankenphp ?? host?.port?.caddy
const fpPortSSL = (host: AppHost) => host?.port?.frankenphp_ssl ?? host?.port?.caddy_ssl ?? 443

const handleReverseProxy = (host: AppHost, content: string) => {
  let x: any = content.match(/(#PWS-REVERSE-PROXY-BEGIN#)([\s\S]*?)(#PWS-REVERSE-PROXY-END#)/g)
  if (x && x[0]) {
    x = x[0]
    content = content.replace(`\n${x}`, '').replace(`${x}`, '')
  }
  if (host?.reverseProxy && host?.reverseProxy?.length > 0) {
    const arr = ['#PWS-REVERSE-PROXY-BEGIN#']
    host.reverseProxy.forEach((item) => {
      const path = item.path
      const url = item.url
      arr.push(`    reverse_proxy ${path} {
        to ${url}
        header_up X-Real-IP {remote}
        header_up X-Forwarded-For {remote}
        header_up X-Forwarded-Proto {scheme}
    }`)
    })
    arr.push('#PWS-REVERSE-PROXY-END#')
    arr.push('    php_server')
    const replace = arr.join('\n')
    content = content.replace('php_server', `\n${replace}`)
  }
  return content
}

export const makeFrankenPHPConf = async (host: AppHost) => {
  const frankenphpvpath = join(global.Server.BaseDir!, 'vhost/frankenphp')
  await mkdirp(frankenphpvpath)
  const httpNames: string[] = []
  const httpsNames: string[] = []
  hostAlias(host).forEach((h) => {
    if (!fpPort(host) || fpPort(host) === 80) {
      httpNames.push(`http://${h}`)
    } else {
      httpNames.push(`http://${h}:${fpPort(host)}`)
    }
    if (host.useSSL) {
      httpsNames.push(`https://${h}:${fpPortSSL(host)}`)
    }
  })

  const contentList: string[] = []

  // Log / conf files named by host.id to avoid same-name collisions. (#700)
  const fileBase = vhostName(host)
  const root = host.root
  const logFile = join(global.Server.BaseDir!, `vhost/logs/${fileBase}.frankenphp.log`)

  const tmpl = await vhostTmpl()

  const httpHostNameAll = httpNames.join(',\n')
  const logPath = pathFixedToUnix(logFile)
  let content = tmpl.frankenphp
    .replace('##HOST-ALL##', httpHostNameAll)
    .replace('##LOG-PATH##', logPath)
    .replace('##ROOT##', pathFixedToUnix(root))
  content = handleReverseProxy(host, content)
  contentList.push(content)

  if (host.useSSL) {
    let tls = 'internal'
    if (host.ssl.cert && host.ssl.key) {
      tls = `"${pathFixedToUnix(host.ssl.cert)}" "${pathFixedToUnix(host.ssl.key)}"`
    }
    const httpHostNameAll = httpsNames.join(',\n')
    let content = tmpl.frankenphpSSL
      .replace('##HOST-ALL##', httpHostNameAll)
      .replace('##LOG-PATH##', logPath)
      .replace('##SSL##', tls)
      .replace('##ROOT##', pathFixedToUnix(root))
    content = handleReverseProxy(host, content)
    contentList.push(content)
  }

  const confFile = join(frankenphpvpath, `${fileBase}.conf`)
  await writeFile(confFile, contentList.join('\n'))
}

export const updateFrankenPHPConf = async (host: AppHost, old: AppHost) => {
  const logpath = join(global.Server.BaseDir!, 'vhost/logs')
  const frankenphpvpath = join(global.Server.BaseDir!, 'vhost/frankenphp')
  await mkdirp(frankenphpvpath)
  await mkdirp(logpath)

  // conf / log files named by host.id (rename-stable) — no move on rename. (#700)
  const fileBase = vhostName(host)
  const frankenphpConfPath = join(frankenphpvpath, `${fileBase}.conf`)
  let hasChanged = false

  if (!existsSync(frankenphpConfPath)) {
    await makeFrankenPHPConf(host)
  }

  let contentFrankenPHPConf = await readFile(frankenphpConfPath, 'utf-8')

  const find: Array<string> = []
  const replace: Array<string> = []
  const oldAliasArr = hostAlias(old)
  const newAliasArr = hostAlias(host)

  if (
    !isEqual(oldAliasArr, newAliasArr) ||
    fpPort(old) !== fpPort(host) ||
    fpPortSSL(old) !== fpPortSSL(host)
  ) {
    hasChanged = true
    const oldHttpNames: string[] = []
    const oldHttpsNames: string[] = []
    const hostHttpNames: string[] = []
    const hostHttpsNames: string[] = []

    oldAliasArr.forEach((h) => {
      if (!fpPort(old) || fpPort(old) === 80) {
        oldHttpNames.push(`http://${h}`)
      } else {
        oldHttpNames.push(`http://${h}:${fpPort(old)}`)
      }
      if (old.useSSL) {
        oldHttpsNames.push(`https://${h}:${fpPortSSL(old)}`)
      }
    })

    newAliasArr.forEach((h) => {
      if (!fpPort(host) || fpPort(host) === 80) {
        hostHttpNames.push(`http://${h}`)
      } else {
        hostHttpNames.push(`http://${h}:${fpPort(host)}`)
      }
      if (host.useSSL) {
        hostHttpsNames.push(`https://${h}:${fpPortSSL(host)}`)
      }
    })

    find.push(...[oldHttpNames.join(',\n'), oldHttpsNames.join(',\n')])
    replace.push(...[hostHttpNames.join(',\n'), hostHttpsNames.join(',\n')])
  }

  if (host.ssl.cert !== old.ssl.cert || host.ssl.key !== old.ssl.key) {
    hasChanged = true
    find.push(`tls (.*?)\\n`)
    replace.push(`tls "${pathFixedToUnix(host.ssl.cert)}" "${pathFixedToUnix(host.ssl.key)}"\n`)
  }
  if (host.root !== old.root) {
    hasChanged = true
    find.push(`root \* (.*?)\\n`)
    replace.push(`root * "${pathFixedToUnix(host.root)}"\n`)
  }
  if (!isEqual(host?.reverseProxy, old?.reverseProxy)) {
    hasChanged = true
  }
  if (hasChanged) {
    find.forEach((s, i) => {
      contentFrankenPHPConf = contentFrankenPHPConf.replace(new RegExp(s, 'g'), replace[i])
      contentFrankenPHPConf = contentFrankenPHPConf.replace(s, replace[i])
    })
    contentFrankenPHPConf = handleReverseProxy(host, contentFrankenPHPConf)
    await writeFile(frankenphpConfPath, contentFrankenPHPConf)
  }
}

export const delVhost = async (host: AppHost) => {
  const frankenphpvpath = join(global.Server.BaseDir!, 'vhost/frankenphp')
  const logpath = join(global.Server.BaseDir!, 'vhost/logs')
  const fileBase = vhostName(host)
  const fvhost = join(frankenphpvpath, `${fileBase}.conf`)
  const frankenphplog = join(logpath, `${fileBase}.frankenphp.log`)
  // Also remove legacy name-based files for sites created before #700.
  const legacy = [
    join(frankenphpvpath, `${host.name}.conf`),
    join(logpath, `${host.name}.frankenphp.log`)
  ]
  const arr = [fvhost, frankenphplog, ...legacy]
  for (const f of arr) {
    if (existsSync(f)) {
      try {
        await removeByRoot(f)
      } catch {}
    }
  }
}

export const fixVHost = async () => {
  let hostAll: Array<AppHost> = []
  const vhostDir = join(global.Server.BaseDir!, 'vhost/frankenphp')
  try {
    hostAll = await fetchHostList()
  } catch {}
  hostAll = hostAll.filter((h) => !h.type || h.type === 'php')
  await mkdirp(vhostDir)
  const tmpl = await vhostTmpl()
  for (const host of hostAll) {
    const fileBase = vhostName(host)
    const confFile = join(vhostDir, `${fileBase}.conf`)
    if (existsSync(confFile)) {
      continue
    }
    const httpNames: string[] = []
    const httpsNames: string[] = []
    hostAlias(host).forEach((h) => {
      if (!fpPort(host) || fpPort(host) === 80) {
        httpNames.push(`http://${h}`)
      } else {
        httpNames.push(`http://${h}:${fpPort(host)}`)
      }
      if (host.useSSL) {
        httpsNames.push(`https://${h}:${fpPortSSL(host)}`)
      }
    })

    const contentList: string[] = []

    const root = host.root
    const logFile = join(global.Server.BaseDir!, `vhost/logs/${fileBase}.frankenphp.log`)

    const httpHostNameAll = httpNames.join(',\n')
    const content = tmpl.frankenphp
      .replace('##HOST-ALL##', httpHostNameAll)
      .replace('##LOG-PATH##', pathFixedToUnix(logFile))
      .replace('##ROOT##', pathFixedToUnix(root))
    contentList.push(content)

    if (host.useSSL) {
      let tls = 'internal'
      if (host.ssl.cert && host.ssl.key) {
        tls = `"${pathFixedToUnix(host.ssl.cert)}" "${pathFixedToUnix(host.ssl.key)}"`
      }
      const httpHostNameAll = httpsNames.join(',\n')
      const content = tmpl.frankenphpSSL
        .replace('##HOST-ALL##', httpHostNameAll)
        .replace('##LOG-PATH##', pathFixedToUnix(logFile))
        .replace('##SSL##', tls)
        .replace('##ROOT##', pathFixedToUnix(root))
      contentList.push(content)
    }
    await writeFile(confFile, contentList.join('\n'))
  }
}
