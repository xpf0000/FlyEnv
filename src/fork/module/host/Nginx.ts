import type { AppHost } from '@shared/app'
import { dirname, join, basename } from 'path'
import { chmod, copyFile, mkdirp, readFile, remove, writeFile } from 'fs-extra'
import { hostAlias } from '../../Fn'
import { vhostTmpl } from './Host'
import { existsSync } from 'fs'
import { isEqual } from 'lodash'
import Helper from '../../Helper'

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
      arr.push(`location ^~ ${path} {
      proxy_pass ${url};
      proxy_set_header Host $http_host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Real-Port $remote_port;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_set_header X-Forwarded-Host $host;
      proxy_set_header X-Forwarded-Port $server_port;
      proxy_set_header REMOTE-HOST $remote_addr;
      proxy_connect_timeout 60s;
      proxy_send_timeout 600s;
      proxy_read_timeout 600s;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
    }`)
    })
    arr.push('#PWS-REVERSE-PROXY-END#')
    arr.unshift('#REWRITE-END')
    const replace = arr.join('\n')
    content = content.replace('#REWRITE-END', `${replace}\n`)
  }
  return content
}

export const autoFillNginxRewrite = (host: AppHost, chmod: boolean) => {
  if (host.nginx.rewrite && host.nginx.rewrite.trim()) {
    return
  }
  const root = host.root
  if (
    existsSync(join(root, 'wp-admin')) &&
    existsSync(join(root, 'wp-content')) &&
    existsSync(join(root, 'wp-includes'))
  ) {
    host.nginx.rewrite = `location /
{
\t try_files $uri $uri/ /index.php?$args;
}

rewrite /wp-admin$ $scheme://$host$uri/ permanent;`
    return
  }
  if (existsSync(join(root, 'vendor/laravel'))) {
    host.nginx.rewrite = `location / {
\ttry_files $uri $uri/ /index.php$is_args$query_string;
}`
    if (!chmod && basename(host.root) !== 'public') {
      host.root = join(host.root, 'public')
    }
    return
  }
  if (existsSync(join(root, 'vendor/yiisoft'))) {
    host.nginx.rewrite = `location / {
    try_files $uri $uri/ /index.php?$args;
  }`
    if (!chmod && basename(host.root) !== 'web') {
      host.root = join(host.root, 'web')
    }
    return
  }
  if (existsSync(join(root, 'thinkphp')) || existsSync(join(root, 'vendor/topthink'))) {
    host.nginx.rewrite = `location / {
\tif (!-e $request_filename){
\t\trewrite  ^(.*)$  /index.php?s=$1  last;   break;
\t}
}`
    if (!chmod && basename(host.root) !== 'public') {
      host.root = join(host.root, 'public')
    }
    return
  }
}

export const makeNginxConf = async (host: AppHost) => {
  if (host?.phpVersion) {
    await handlePhpEnableConf(host?.phpVersion)
  }

  const nginxvpath = join(global.Server.BaseDir!, 'vhost/nginx')
  const rewritepath = join(global.Server.BaseDir!, 'vhost/rewrite')
  const logpath = join(global.Server.BaseDir!, 'vhost/logs')

  await mkdirp(nginxvpath)
  await mkdirp(rewritepath)
  await mkdirp(logpath)

  const tmpl = await vhostTmpl()

  let ntmpl = tmpl.nginx
  if (host.useSSL) {
    ntmpl = tmpl.nginxSSL
  }

  const hostname = host.name
  const nvhost = join(nginxvpath, `${hostname}.conf`)
  const hostalias = hostAlias(host).join(' ')
  ntmpl = ntmpl
    .replace('{ServerPort}', `${host.port.nginx}`)
    .replace('{ServerName}', hostname)
    .replace('{ServerAlias}', hostalias)
    .replace('{ServerRoot}', host.root)
    .replace('{LogPath}', logpath)
    .replace('{RewritePath}', rewritepath)
    .replace('{ServerSSLCert}', host.ssl.cert)
    .replace('{ServerSSLKey}', host.ssl.key)
    .replace('{ServerSSLPort}', `${host.port.nginx_ssl}`)

  if (host.phpVersion) {
    ntmpl = ntmpl.replace(
      /include enable-php\.conf;/g,
      `include enable-php-${host.phpVersion}.conf;`
    )
  } else {
    ntmpl = ntmpl.replace(/include enable-php\.conf;/g, '##Static Site Nginx##')
  }

  await writeFile(nvhost, handleReverseProxy(host, ntmpl))

  const rewrite = host?.nginx?.rewrite?.trim() ?? ''
  await writeFile(join(rewritepath, `${hostname}.conf`), rewrite)
}

const handlePhpEnableConf = async (v: number) => {
  try {
    const name = `enable-php-${v}.conf`
    const confFile = join(global.Server.NginxDir!, 'common/conf/', name)
    if (!existsSync(confFile)) {
      await mkdirp(dirname(confFile))
      const tmplFile = join(global.Server.Static!, 'tmpl/enable-php.conf')
      const tmplContent = await readFile(tmplFile, 'utf-8')
      const content = tmplContent.replace('{PHPVersion}', `${v}`)
      await writeFile(confFile, content)
    }
  } catch (e) {}
}

export const updateNginxConf = async (host: AppHost, old: AppHost) => {
  if (host?.phpVersion) {
    await handlePhpEnableConf(host?.phpVersion)
  }
  const nginxvpath = join(global.Server.BaseDir!, 'vhost/nginx')
  const rewritepath = join(global.Server.BaseDir!, 'vhost/rewrite')
  const logpath = join(global.Server.BaseDir!, 'vhost/logs')

  await mkdirp(nginxvpath)
  await mkdirp(rewritepath)
  await mkdirp(logpath)

  if (host.name !== old.name) {
    const nvhost = {
      oldFile: join(nginxvpath, `${old.name}.conf`),
      newFile: join(nginxvpath, `${host.name}.conf`)
    }
    const rewritep = {
      oldFile: join(rewritepath, `${old.name}.conf`),
      newFile: join(rewritepath, `${host.name}.conf`)
    }
    const accesslogng = {
      oldFile: join(logpath, `${old.name}.log`),
      newFile: join(logpath, `${host.name}.log`)
    }
    const errorlogng = {
      oldFile: join(logpath, `${old.name}.error.log`),
      newFile: join(logpath, `${host.name}.error.log`)
    }
    const arr = [nvhost, rewritep, accesslogng, errorlogng]
    for (const f of arr) {
      if (existsSync(f.oldFile)) {
        let hasErr = false
        try {
          await copyFile(f.oldFile, f.newFile)
        } catch (e) {
          hasErr = true
        }
        if (hasErr) {
          try {
            const content = await Helper.send('tools', 'readFileByRoot', f.oldFile)
            await writeFile(f.newFile, content)
          } catch (e) {}
        }
        hasErr = false
        try {
          await remove(f.oldFile)
        } catch (e) {
          hasErr = true
        }
        if (hasErr) {
          try {
            await Helper.send('tools', 'rm', f.oldFile)
          } catch (e) {}
        }
      }
      if (existsSync(f.newFile)) {
        await chmod(f.newFile, '0777')
      }
    }
  }
  const nginxConfPath = join(nginxvpath, `${host.name}.conf`)
  let hasChanged = false

  if (!existsSync(nginxConfPath)) {
    await makeNginxConf(host)
  }

  let contentNginxConf = await readFile(nginxConfPath, 'utf-8')

  const find: Array<string> = []
  const replace: Array<string> = []
  if (host.name !== old.name) {
    hasChanged = true
    find.push(
      ...[
        `include(.*?)${rewritepath}/(.*?)\\r\\n`,
        `include(.*?)${rewritepath}/(.*?)\\n`,
        `access_log(.*?)${logpath}/(.*?)\\r\\n`,
        `access_log(.*?)${logpath}/(.*?)\\n`,
        `error_log(.*?)${logpath}/(.*?)\\r\\n`,
        `error_log(.*?)${logpath}/(.*?)\\n`
      ]
    )
    replace.push(
      ...[
        `include "${rewritepath}/${host.name}.conf";\r\n`,
        `include "${rewritepath}/${host.name}.conf";\n`,
        `access_log  "${logpath}/${host.name}.log";\r\n`,
        `access_log  "${logpath}/${host.name}.log";\n`,
        `error_log  "${logpath}/${host.name}.error.log";\r\n`,
        `error_log  "${logpath}/${host.name}.error.log";\n`
      ]
    )
  }
  const oldAliasArr = hostAlias(old)
  const newAliasArr = hostAlias(host)
  if (!isEqual(oldAliasArr, newAliasArr)) {
    hasChanged = true
    const newAlias = newAliasArr.join(' ')
    find.push(`server_name (.*?)\\r\\n`)
    replace.push(`server_name ${newAlias};\r\n`)
    find.push(`server_name (.*?)\\n`)
    replace.push(`server_name ${newAlias};\n`)
  }

  if (host.ssl.cert !== old.ssl.cert) {
    hasChanged = true
    find.push(`ssl_certificate (.*?)\\r\\n`)
    replace.push(`ssl_certificate "${host.ssl.cert}";\r\n`)
    find.push(`ssl_certificate (.*?)\\n`)
    replace.push(`ssl_certificate "${host.ssl.cert}";\n`)
  }
  if (host.ssl.key !== old.ssl.key) {
    hasChanged = true
    find.push(`ssl_certificate_key (.*?)\\r\\n`)
    replace.push(`ssl_certificate_key "${host.ssl.key}";\r\n`)
    find.push(`ssl_certificate_key (.*?)\\n`)
    replace.push(`ssl_certificate_key "${host.ssl.key}";\n`)
  }
  if (host.port.nginx !== old.port.nginx) {
    hasChanged = true
    find.push(...[`listen ${old.port.nginx};`])
    replace.push(...[`listen ${host.port.nginx};`])
  }
  if (host.port.nginx_ssl !== old.port.nginx_ssl) {
    hasChanged = true
    find.push(...[`listen ${old.port.nginx_ssl} ssl http2;`])
    replace.push(...[`listen ${host.port.nginx_ssl} ssl http2;`])
    find.push(...[`listen ${old.port.nginx_ssl} ssl;`])
    replace.push(...[`listen ${host.port.nginx_ssl} ssl;`])
  }
  if (host.root !== old.root) {
    hasChanged = true
    find.push(`root (.*?)\\r\\n`)
    replace.push(`root "${host.root}";\r\n`)
    find.push(`root (.*?)\\n`)
    replace.push(`root "${host.root}";\n`)
  }
  if (host.phpVersion !== old.phpVersion) {
    hasChanged = true
    if (old.phpVersion) {
      find.push(...[`include(\\s+)enable-php-(.*?).conf;`])
    } else {
      find.push(...['##Static Site Nginx##'])
    }
    if (host.phpVersion) {
      replace.push(...[`include enable-php-${host.phpVersion}.conf;`])
    } else {
      replace.push(...['##Static Site Nginx##'])
    }
  }
  if (!isEqual(host?.reverseProxy, old?.reverseProxy)) {
    hasChanged = true
  }
  if (hasChanged) {
    find.forEach((s, i) => {
      contentNginxConf = contentNginxConf.replace(new RegExp(s, 'g'), replace[i])
      contentNginxConf = contentNginxConf.replace(s, replace[i])
    })
    contentNginxConf = handleReverseProxy(host, contentNginxConf)
    await writeFile(nginxConfPath, contentNginxConf)
  }
  if (host.nginx.rewrite.trim() !== old.nginx.rewrite.trim()) {
    const nginxRewriteConfPath = join(rewritepath, `${host.name}.conf`)
    await writeFile(nginxRewriteConfPath, host.nginx.rewrite.trim())
  }
}
