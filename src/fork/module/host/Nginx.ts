import type { AppHost } from '@shared/app'
import { dirname, join } from 'path'
import { mkdirp, readFile, writeFile } from 'fs-extra'
import { hostAlias, execPromiseRoot } from '../../Fn'
import { vhostTmpl } from './Host'
import { existsSync } from 'fs'
import { isEqual } from 'lodash'

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
    if (!chmod) {
      host.root = join(host.root, 'public')
    }
    return
  }
  if (existsSync(join(root, 'vendor/yiisoft'))) {
    host.nginx.rewrite = `location / {
    try_files $uri $uri/ /index.php?$args;
  }`
    if (!chmod) {
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
    if (!chmod) {
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
    .replace(/#Server_Alias#/g, hostalias)
    .replace(/#Server_Root#/g, host.root)
    .replace(/#Rewrite_Path#/g, rewritepath)
    .replace(/#Server_Name#/g, hostname)
    .replace(/#Log_Path#/g, logpath)
    .replace(/#Server_Cert#/g, host.ssl.cert)
    .replace(/#Server_CertKey#/g, host.ssl.key)
    .replace(/#Port_Nginx#/g, `${host.port.nginx}`)
    .replace(/#Port_Nginx_SSL#/g, `${host.port.nginx_ssl}`)

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
      const content = tmplContent.replace('##VERSION##', `${v}`)
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
        await execPromiseRoot(`copy -Force ${f.oldFile} ${f.newFile}`)
        await execPromiseRoot(`del -Force ${f.oldFile}`)
      }
      if (existsSync(f.newFile)) {
        await execPromiseRoot(`icacls ${f.newFile} /grant Everyone:F`)
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
        `include ${rewritepath}/${old.name}.conf;`,
        `access_log  ${logpath}/${old.name}.log;`,
        `error_log  ${logpath}/${old.name}.error.log;`
      ]
    )
    replace.push(
      ...[
        `include ${rewritepath}/${host.name}.conf;`,
        `access_log  ${logpath}/${host.name}.log;`,
        `error_log  ${logpath}/${host.name}.error.log;`
      ]
    )
  }
  const oldAliasArr = hostAlias(old)
  const newAliasArr = hostAlias(host)
  if (!isEqual(oldAliasArr, newAliasArr)) {
    hasChanged = true
    const oldAlias = oldAliasArr.join(' ')
    const newAlias = newAliasArr.join(' ')
    find.push(...[`server_name ${oldAlias};`])
    replace.push(...[`server_name ${newAlias};`])
  }

  if (host.ssl.cert !== old.ssl.cert) {
    hasChanged = true
    find.push(...[old.ssl.cert])
    replace.push(...[host.ssl.cert])
  }
  if (host.ssl.key !== old.ssl.key) {
    hasChanged = true
    find.push(...[old.ssl.key])
    replace.push(...[host.ssl.key])
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
  }
  if (host.root !== old.root) {
    hasChanged = true
    find.push(...[old.root])
    replace.push(...[host.root])
  }
  if (host.phpVersion !== old.phpVersion) {
    hasChanged = true
    if (old.phpVersion) {
      find.push(...[`include enable-php-${old.phpVersion}.conf;`])
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
