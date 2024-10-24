import { dirname, join } from 'path'
import { readFile } from 'fs-extra'
import { isEqual } from 'lodash'
import type { AppHost } from '@shared/app'
import { hostAlias } from '../../Fn'
import { makeAutoSSL } from './SSL'
import { existsSync } from 'fs'
import { execPromiseRoot } from '@shared/Exec'

type VhostTmplType = {
  nginx: string
  apache: string
  nginxSSL: string
  apacheSSL: string
  caddy: string
  caddySSL: string
}

let _tmpl: VhostTmplType | undefined
export const vhostTmpl = async () => {
  if (_tmpl) {
    return _tmpl
  }
  const nginxtmpl = join(global.Server.Static!, 'tmpl/nginx.vhost')
  const nginxSSLtmpl = join(global.Server.Static!, 'tmpl/nginxSSL.vhost')

  const apachetmpl = join(global.Server.Static!, 'tmpl/apache.vhost')
  const apacheSSLtmpl = join(global.Server.Static!, 'tmpl/apacheSSL.vhost')

  const caddytmpl = join(global.Server.Static!, 'tmpl/CaddyfileVhost')
  const caddySSLtmpl = join(global.Server.Static!, 'tmpl/CaddyfileVhostSSL')

  const nginx = await readFile(nginxtmpl, 'utf-8')
  const apache = await readFile(apachetmpl, 'utf-8')
  const nginxSSL = await readFile(nginxSSLtmpl, 'utf-8')
  const apacheSSL = await readFile(apacheSSLtmpl, 'utf-8')
  const caddy = await readFile(caddytmpl, 'utf-8')
  const caddySSL = await readFile(caddySSLtmpl, 'utf-8')

  _tmpl = {
    nginx,
    apache,
    nginxSSL,
    apacheSSL,
    caddy,
    caddySSL
  }
  return _tmpl
}

export const updateAutoSSL = async (host: AppHost, old: AppHost) => {
  const oldAliasArr = hostAlias(old)
  const newAliasArr = hostAlias(host)
  if (host?.useSSL && host?.autoSSL) {
    if (host?.autoSSL !== old?.autoSSL || !isEqual(oldAliasArr, newAliasArr)) {
      const ssl = await makeAutoSSL(host)
      if (ssl) {
        host.ssl.cert = ssl.crt
        host.ssl.key = ssl.key
      } else {
        host.autoSSL = false
      }
    }
  }
}

export const setDirRole = async (dir: string, depth = 0) => {
  console.log('#setDirRole: ', dir, depth)
  if (!dir || dir === '/') {
    return
  }
  if (existsSync(dir)) {
    try {
      await execPromiseRoot([`chmod`, `755`, dir])
    } catch (e) {}
    const parentDir = dirname(dir)
    if (parentDir !== dir) {
      await setDirRole(parentDir, depth + 1)
    }
  }
}

export const updateRootRule = async (host: AppHost, old: AppHost) => {
  if (host.root !== old.root) {
    await setDirRole(host.root)
  }
}
