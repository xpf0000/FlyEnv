import type { AppHost } from '@shared/app'
import { join } from 'path'
import {
  copyFile,
  mkdirp,
  readFile,
  remove,
  writeFile,
  hostAlias,
  pathFixedToUnix,
  existsSync
} from '../../Fn'
import { vhostTmpl } from './Host'
import { isEqual } from 'lodash-es'

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
    arr.push('    file_server')
    const replace = arr.join('\n')
    content = content.replace('file_server', `\n${replace}`)
  }
  return content
}

export const makeCaddyConf = async (host: AppHost) => {
  const caddyvpath = join(global.Server.BaseDir!, 'vhost/caddy')
  await mkdirp(caddyvpath)
  const httpNames: string[] = []
  const httpsNames: string[] = []
  hostAlias(host).forEach((h) => {
    if (!host?.port?.caddy || host.port.caddy === 80) {
      httpNames.push(`http://${h}`)
    } else {
      httpNames.push(`http://${h}:${host.port.caddy}`)
    }
    if (host.useSSL) {
      httpsNames.push(`https://${h}:${host?.port?.caddy_ssl ?? 443}`)
    }
  })

  const tmpl = await vhostTmpl()

  const contentList: string[] = []

  const hostName = host.name
  const root = host.root
  const phpv = host?.phpVersion
  const logFile = join(global.Server.BaseDir!, `vhost/logs/${hostName}.caddy.log`)

  const httpHostNameAll = httpNames.join(',\n')
  let content = tmpl.caddy
    .replace('##HOST-ALL##', httpHostNameAll)
    .replace('##LOG-PATH##', logFile.split('\\').join('/'))
    .replace('##ROOT##', root.split('\\').join('/'))
  if (phpv) {
    content = content.replace('##PHP-VERSION##', `${phpv}`)
  } else {
    content = content.replace('import enable-php-select ##PHP-VERSION##', `##Static Site Caddy##`)
  }

  content = handleReverseProxy(host, content)
  contentList.push(content)

  if (host.useSSL) {
    let tls = 'internal'
    if (host.ssl.cert && host.ssl.key) {
      tls = `"${host.ssl.cert.split('\\').join('/')}" "${host.ssl.key.split('\\').join('/')}"`
    }
    const httpHostNameAll = httpsNames.join(',\n')
    let content = tmpl.caddySSL
      .replace('##HOST-ALL##', httpHostNameAll)
      .replace('##LOG-PATH##', logFile.split('\\').join('/'))
      .replace('##SSL##', tls)
      .replace('##ROOT##', root.split('\\').join('/'))
    if (phpv) {
      content = content.replace('##PHP-VERSION##', `${phpv}`)
    } else {
      content = content.replace('import enable-php-select ##PHP-VERSION##', `##Static Site Caddy##`)
    }
    content = handleReverseProxy(host, content)
    contentList.push(content)
  }

  const confFile = join(caddyvpath, `${host.name}.conf`)
  await writeFile(confFile, contentList.join('\n'))
}

export const updateCaddyConf = async (host: AppHost, old: AppHost) => {
  const logpath = join(global.Server.BaseDir!, 'vhost/logs').split('\\').join('/')
  const caddyvpath = join(global.Server.BaseDir!, 'vhost/caddy').split('\\').join('/')
  await mkdirp(caddyvpath)
  await mkdirp(logpath)

  if (host.name !== old.name) {
    const cvhost = {
      oldFile: join(caddyvpath, `${old.name}.conf`),
      newFile: join(caddyvpath, `${host.name}.conf`)
    }
    const arr = [cvhost]
    for (const f of arr) {
      if (existsSync(f.oldFile)) {
        await copyFile(f.oldFile, f.newFile)
        await remove(f.oldFile)
      }
    }
  }
  const caddyConfPath = join(caddyvpath, `${host.name}.conf`)
  let hasChanged = false

  if (!existsSync(caddyConfPath)) {
    await makeCaddyConf(host)
    return
  }

  let contentCaddyConf = await readFile(caddyConfPath, 'utf-8')

  const find: Array<string> = []
  const replace: Array<string> = []
  if (host.name !== old.name) {
    hasChanged = true
    const logFile = join(global.Server.BaseDir!, `vhost/logs/${host.name}.caddy.log`)
      .split('\\')
      .join('/')
    find.push(`import set-log (.*?)\\r\\n`)
    replace.push(`import set-log "${logFile}"\r\n`)
    find.push(`import set-log (.*?)\\n`)
    replace.push(`import set-log "${logFile}"\n`)
  }
  const oldAliasArr = hostAlias(old)
  const newAliasArr = hostAlias(host)

  if (
    !isEqual(oldAliasArr, newAliasArr) ||
    old.port.caddy !== host.port.caddy ||
    old.port.caddy_ssl !== host.port.caddy_ssl
  ) {
    hasChanged = true
    const oldHttpNames: string[] = []
    const oldHttpsNames: string[] = []
    const hostHttpNames: string[] = []
    const hostHttpsNames: string[] = []

    oldAliasArr.forEach((h) => {
      if (!old?.port?.caddy || old.port.caddy === 80) {
        oldHttpNames.push(`http://${h}`)
      } else {
        oldHttpNames.push(`http://${h}:${old.port.caddy}`)
      }
      if (old.useSSL) {
        oldHttpsNames.push(`https://${h}:${old?.port?.caddy_ssl ?? 443}`)
      }
    })

    newAliasArr.forEach((h) => {
      if (!host?.port?.caddy || host.port.caddy === 80) {
        hostHttpNames.push(`http://${h}`)
      } else {
        hostHttpNames.push(`http://${h}:${host.port.caddy}`)
      }
      if (host.useSSL) {
        hostHttpsNames.push(`https://${h}:${host?.port?.caddy_ssl ?? 443}`)
      }
    })

    find.push(...[oldHttpNames.join(',\n'), oldHttpsNames.join(',\n')])
    replace.push(...[hostHttpNames.join(',\n'), hostHttpsNames.join(',\n')])
  }

  if (host.ssl.cert !== old.ssl.cert || host.ssl.key !== old.ssl.key) {
    hasChanged = true
    const cert = pathFixedToUnix(host.ssl.cert)
    const key = pathFixedToUnix(host.ssl.key)
    find.push(`tls (.*?)\\r\\n`)
    replace.push(`tls "${cert}" "${key}"\r\n`)
    find.push(`tls (.*?)\\n`)
    replace.push(`tls "${cert}" "${key}"\n`)
  }
  if (host.root !== old.root) {
    hasChanged = true
    const root = pathFixedToUnix(host.root)
    find.push(`root * (.*?)\\r\\n`)
    replace.push(`root * "${root}"\r\n`)
    find.push(`root * (.*?)\\n`)
    replace.push(`root * "${root}"\n`)
  }
  if (host.phpVersion !== old.phpVersion) {
    hasChanged = true
    if (old.phpVersion) {
      find.push(...[`import(\\s+)enable-php-select(.*?)\\r\\n`])
      find.push(...[`import(\\s+)enable-php-select(.*?)\\n`])
    } else {
      find.push(...[`import(\\s+)enable-php-select(.*?)\\r\\n`])
      find.push(...[`import(\\s+)enable-php-select(.*?)\\n`])
      find.push(...['##Static Site Caddy##'])
    }
    if (host.phpVersion) {
      if (old.phpVersion) {
        replace.push(...[`import enable-php-select ${host.phpVersion}\r\n`])
        replace.push(...[`import enable-php-select ${host.phpVersion}\n`])
      } else {
        replace.push(...[`import enable-php-select ${host.phpVersion}\r\n`])
        replace.push(...[`import enable-php-select ${host.phpVersion}\n`])
        replace.push(...[`import enable-php-select ${host.phpVersion}`])
      }
    } else {
      if (old.phpVersion) {
        replace.push(...['##Static Site Caddy##\r\n'])
        replace.push(...['##Static Site Caddy##\n'])
      } else {
        replace.push(...['##Static Site Caddy##\r\n'])
        replace.push(...['##Static Site Caddy##\n'])
        replace.push(...['##Static Site Caddy##'])
      }
    }
  }
  if (!isEqual(host?.reverseProxy, old?.reverseProxy)) {
    hasChanged = true
  }
  if (hasChanged) {
    find.forEach((s, i) => {
      contentCaddyConf = contentCaddyConf.replace(new RegExp(s, 'g'), replace[i])
      contentCaddyConf = contentCaddyConf.replace(s, replace[i])
    })
    contentCaddyConf = handleReverseProxy(host, contentCaddyConf)
    await writeFile(caddyConfPath, contentCaddyConf)
  }
}
