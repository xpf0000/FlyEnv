import type { AppHost } from '@shared/app'
import { join } from 'path'
import { hostAlias, chmod, copyFile, mkdirp, readFile, remove, writeFile } from '../../Fn'
import { vhostTmpl } from './Host'
import { existsSync } from 'fs'
import { isEqual } from 'lodash-es'
import Helper from '../../Helper'
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

  if (host.useSSL) {
    atmpl = tmpl.apacheSSL
  }

  const hostname = host.name
  const avhost = join(apachevpath, `${hostname}.conf`)
  const hostalias = hostAlias(host).join(' ')

  atmpl = atmpl
    .replace(/#Server_Alias#/g, hostalias)
    .replace(/#Server_Root#/g, pathFixedToUnix(host.root))
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

  if (host.name !== old.name) {
    const avhost = {
      oldFile: join(apachevpath, `${old.name}.conf`),
      newFile: join(apachevpath, `${host.name}.conf`)
    }
    const accesslogap = {
      oldFile: join(logpath, `${old.name}-access_log`),
      newFile: join(logpath, `${host.name}-access_log`)
    }
    const errorlogap = {
      oldFile: join(logpath, `${old.name}-error_log`),
      newFile: join(logpath, `${host.name}-error_log`)
    }
    const arr = [avhost, accesslogap, errorlogap]
    for (const f of arr) {
      if (existsSync(f.oldFile)) {
        let hasErr = false
        try {
          await copyFile(f.oldFile, f.newFile)
        } catch {
          hasErr = true
        }
        if (hasErr) {
          try {
            const content: string = (await Helper.send('tools', 'readFileByRoot', f.oldFile)) as any
            await writeFile(f.newFile, content)
          } catch {}
        }
        hasErr = false
        try {
          await remove(f.oldFile)
        } catch {
          hasErr = true
        }
        if (hasErr) {
          try {
            await Helper.send('tools', 'rm', f.oldFile)
          } catch {}
        }
      }
      if (existsSync(f.newFile)) {
        await chmod(f.newFile, '0777')
      }
    }
  }
  const apacheConfPath = join(apachevpath, `${host.name}.conf`)
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
        `ServerName(?!\\s+SSL\\.).*?\\n`,
        `ErrorLog(.*?)${logpath}/(.*?)\\r\\n`,
        `ErrorLog(.*?)${logpath}/(.*?)\\n`,
        `CustomLog(.*?)${logpath}/(.*?)\\r\\n`,
        `CustomLog(.*?)${logpath}/(.*?)\\n`
      ]
    )
    replace.push(
      ...[
        `ServerName SSL.${host.name}\r\n`,
        `ServerName SSL.${host.name}\n`,
        `ServerName ${host.name}\r\n`,
        `ServerName ${host.name}\n`,
        `ErrorLog "${logpath}/${host.name}-error_log"\r\n`,
        `ErrorLog "${logpath}/${host.name}-error_log"\n`,
        `CustomLog "${logpath}/${host.name}-access_log" combined\r\n`,
        `CustomLog "${logpath}/${host.name}-access_log" combined\n`
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
    const cert = pathFixedToUnix(host.ssl.cert)
    find.push(`SSLCertificateFile (.*?)\\r\\n`)
    replace.push(`SSLCertificateFile "${cert}"\r\n`)
    find.push(`SSLCertificateFile (.*?)\\n`)
    replace.push(`SSLCertificateFile "${cert}"\n`)
  }
  if (host.ssl.key !== old.ssl.key) {
    hasChanged = true
    const key = pathFixedToUnix(host.ssl.key)
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
