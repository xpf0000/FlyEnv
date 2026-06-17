import type { AppHost } from '@shared/app'
import { join } from 'path'
import { hostAlias, mkdirp, readFile, writeFile, removeByRoot } from '../../Fn'
import { vhostTmpl } from '../Host/Host'
import { vhostName } from '../Host/vhostName'
import { existsSync } from 'fs'
import { isEqual } from 'lodash-es'
import { isWindows, pathFixedToUnix } from '@shared/utils'

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
      arr.push(`<IfModule mod_proxy.c>
    ProxyRequests Off
    SSLProxyEngine on
    ProxyPass ${path} ${url}
    ProxyPassReverse ${path} ${url}
    RequestHeader set Host "%{Host}e"
    RequestHeader set X-Real-IP "%{REMOTE_ADDR}e"
    RequestHeader set X-Forwarded-For "%{X-Forwarded-For}e"
    RequestHeader setifempty X-Forwarded-For "%{REMOTE_ADDR}e"
    </IfModule>`)
    })
    arr.push('#PWS-REVERSE-PROXY-END#')
    arr.unshift('</FilesMatch>')
    const replace = arr.join('\n')
    content = content.replace('</FilesMatch>', `${replace}\n`)
  }
  return content
}

export const makeApacheConf = async (host: AppHost) => {
  const apachevpath = join(global.Server.BaseDir!, 'vhost/apache')
  const rewritepath = join(global.Server.BaseDir!, 'vhost/rewrite')
  const logpath = join(global.Server.BaseDir!, 'vhost/logs')

  await mkdirp(apachevpath)
  await mkdirp(rewritepath)
  await mkdirp(logpath)

  const tmpl = await vhostTmpl()

  let atmpl = tmpl.apache

  if (host.useSSL && host.ssl.cert && host.ssl.key) {
    atmpl = tmpl.apacheSSL
  }

  const hostname = host.name
  // conf / log files named by host.id; ServerName keeps the real domain. (#700)
  const fileBase = vhostName(host)
  const avhost = join(apachevpath, `${fileBase}.conf`)
  const hostalias = hostAlias(host).join(' ')

  atmpl = atmpl
    .replace(/#Server_Alias#/g, hostalias)
    .replace(/#Server_Root#/g, pathFixedToUnix(host.root))
    .replace(/#Server_ID#/g, fileBase)
    .replace(/#Server_Name#/g, hostname)
    .replace(/#Log_Path#/g, pathFixedToUnix(logpath))
    .replace(/#Server_Cert#/g, pathFixedToUnix(host.ssl.cert))
    .replace(/#Server_CertKey#/g, pathFixedToUnix(host.ssl.key))
    .replace(/#Port_Apache#/g, `${host.port.apache}`)
    .replace(/#Port_Apache_SSL#/g, `${host.port.apache_ssl}`)
  if (host.phpVersion) {
    if (isWindows()) {
      atmpl = atmpl.replace(
        /SetHandler "proxy:fcgi:\/\/127\.0\.0\.1:9000"/g,
        `SetHandler "proxy:fcgi://127.0.0.1:90${host.phpVersion}/"`
      )
    } else {
      atmpl = atmpl.replace(
        /SetHandler "proxy:fcgi:\/\/127\.0\.0\.1:9000"/g,
        `SetHandler "proxy:unix:/tmp/phpwebstudy-php-cgi-${host.phpVersion}.sock|fcgi://localhost"`
      )
    }
  } else {
    atmpl = atmpl.replace(
      /SetHandler "proxy:fcgi:\/\/127\.0\.0\.1:9000"/g,
      '##Static Site Apache##'
    )
  }

  atmpl = handleReverseProxy(host, atmpl)

  await writeFile(avhost, atmpl)
}

export const updateApacheConf = async (host: AppHost, old: AppHost) => {
  const apachevpath = join(global.Server.BaseDir!, 'vhost/apache')
  const logpath = join(global.Server.BaseDir!, 'vhost/logs')

  await mkdirp(apachevpath)
  await mkdirp(logpath)

  // conf / log files named by host.id (rename-stable) — no move on rename. (#700)
  const fileBase = vhostName(host)
  const apacheConfPath = join(apachevpath, `${fileBase}.conf`)
  let hasChanged = false

  if (!existsSync(apacheConfPath)) {
    await makeApacheConf(host)
  }

  let contentApacheConf = await readFile(apacheConfPath, 'utf-8')

  const find: Array<string> = []
  const replace: Array<string> = []
  if (host.name !== old.name) {
    hasChanged = true
    find.push(
      ...[
        `ServerName(.*?)SSL\\.(.*?)\\r\\n`,
        `ServerName(.*?)SSL\\.(.*?)\\n`,
        `ServerName(?!\\s+SSL\\.).*?\\r\\n`,
        `ServerName(?!\\s+SSL\\.).*?\\n`
      ]
    )
    replace.push(
      ...[
        `ServerName SSL.${host.name}\r\n`,
        `ServerName SSL.${host.name}\n`,
        `ServerName ${host.name}\r\n`,
        `ServerName ${host.name}\n`
      ]
    )
  }
  const oldAliasArr = hostAlias(old)
  const newAliasArr = hostAlias(host)
  if (!isEqual(oldAliasArr, newAliasArr)) {
    hasChanged = true
    const newAlias = newAliasArr.join(' ')
    find.push(`ServerAlias (.*?)\\r\\n`)
    replace.push(`ServerAlias ${newAlias}\r\n`)
    find.push(`ServerAlias (.*?)\\n`)
    replace.push(`ServerAlias ${newAlias}\n`)
  }

  if (host.ssl.cert !== old.ssl.cert) {
    hasChanged = true
    const cert = host.ssl.cert ? pathFixedToUnix(host.ssl.cert) : ''
    find.push(`SSLCertificateFile (.*?)\\r\\n`)
    replace.push(`SSLCertificateFile "${cert}"\r\n`)
    find.push(`SSLCertificateFile (.*?)\\n`)
    replace.push(`SSLCertificateFile "${cert}"\n`)
  }
  if (host.ssl.key !== old.ssl.key) {
    hasChanged = true
    const key = host.ssl.key ? pathFixedToUnix(host.ssl.key) : ''
    find.push(`SSLCertificateKeyFile (.*?)\\r\\n`)
    replace.push(`SSLCertificateKeyFile "${key}"\r\n`)
    find.push(`SSLCertificateKeyFile (.*?)\\n`)
    replace.push(`SSLCertificateKeyFile "${key}"\n`)
  }

  if (host.port.apache !== old.port.apache) {
    hasChanged = true
    find.push(...[`Listen ${old.port.apache}\nNameVirtualHost *:${old.port.apache}\n`])
    replace.push('')
    find.push(...[`<VirtualHost \\*:${old.port.apache}>`])
    replace.push(...[`<VirtualHost *:${host.port.apache}>`])
  }
  if (host.port.apache_ssl !== old.port.apache_ssl) {
    hasChanged = true
    find.push(...[`Listen ${old.port.apache_ssl}\nNameVirtualHost *:${old.port.apache_ssl}\n`])
    replace.push('')
    find.push(...[`<VirtualHost \\*:${old.port.apache_ssl}>`])
    replace.push(...[`<VirtualHost *:${host.port.apache_ssl}>`])
  }
  if (host.root !== old.root) {
    hasChanged = true
    const root = pathFixedToUnix(host.root)
    find.push(`DocumentRoot (.*?)\\r\\n`)
    replace.push(`DocumentRoot "${root}"\r\n`)
    find.push(`DocumentRoot (.*?)\\n`)
    replace.push(`DocumentRoot "${root}"\n`)
    find.push(`<Directory (.*?)\\r\\n`)
    replace.push(`<Directory "${root}">\r\n`)
    find.push(`<Directory (.*?)\\n`)
    replace.push(`<Directory "${root}">\n`)
  }
  if (host.phpVersion !== old.phpVersion) {
    hasChanged = true
    if (old.phpVersion) {
      if (isWindows()) {
        find.push(...[`SetHandler(\\s+)"proxy:fcgi://127\.0\.0\.1:90(.*?)"`])
      } else {
        find.push(...[`SetHandler(\\s+)"proxy:unix:(.*?)"`])
      }
    } else {
      find.push(...['##Static Site Apache##'])
    }
    if (host.phpVersion) {
      if (isWindows()) {
        replace.push(...[`SetHandler "proxy:fcgi://127.0.0.1:90${host.phpVersion}/"`])
      } else {
        replace.push(
          ...[
            `SetHandler "proxy:unix:/tmp/phpwebstudy-php-cgi-${host.phpVersion}.sock|fcgi://localhost"`
          ]
        )
      }
    } else {
      replace.push(...['##Static Site Apache##'])
    }
  }
  if (!isEqual(host?.reverseProxy, old?.reverseProxy)) {
    hasChanged = true
  }
  if (hasChanged) {
    find.forEach((s, i) => {
      contentApacheConf = contentApacheConf.replace(new RegExp(s, 'g'), replace[i])
      contentApacheConf = contentApacheConf.replace(s, replace[i])
    })
    contentApacheConf = handleReverseProxy(host, contentApacheConf)
    await writeFile(apacheConfPath, contentApacheConf)
  }
}

export const delVhost = async (host: AppHost) => {
  const apachevpath = join(global.Server.BaseDir!, 'vhost/apache')
  const logpath = join(global.Server.BaseDir!, 'vhost/logs')
  const fileBase = vhostName(host)
  const avhost = join(apachevpath, `${fileBase}.conf`)
  const accesslogap = join(logpath, `${fileBase}-access_log`)
  const errorlogap = join(logpath, `${fileBase}-error_log`)
  // Also remove legacy name-based files for sites created before #700.
  const legacy = [
    join(apachevpath, `${host.name}.conf`),
    join(logpath, `${host.name}-access_log`),
    join(logpath, `${host.name}-error_log`)
  ]
  const arr = [avhost, accesslogap, errorlogap, ...legacy]
  for (const f of arr) {
    if (existsSync(f)) {
      try {
        await removeByRoot(f)
      } catch {}
    }
  }
}
