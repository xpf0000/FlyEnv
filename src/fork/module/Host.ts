import { join, dirname } from 'path'
import { existsSync, accessSync, constants, readdirSync } from 'fs'
import { Base } from './Base'
import { I18nT } from '../lang'
import type { AppHost, SoftInstalled } from '@shared/app'
import { downFile, execPromise, getSubDir, hostAlias, uuid } from '../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import dns from 'dns'
import util from 'util'
import { readFile, writeFile, copyFile, mkdirp, remove, copy } from 'fs-extra'
import { EOL } from 'os'
import { isEqual } from 'lodash'
import compressing from 'compressing'

class Host extends Base {
  NginxTmpl = ''
  NginxSSLTmpl = ''
  ApacheTmpl = ''
  ApacheSSLTmpl = ''
  CaddyTmpl = ''
  CaddySSLTmpl = ''

  constructor() {
    super()
  }

  _makeAutoSSL(host: AppHost): ForkPromise<{ crt: string; key: string } | false> {
    return new ForkPromise(async (resolve) => {
      try {
        const alias = hostAlias(host)
        const CARoot = join(global.Server.BaseDir!, 'CA/PhpWebStudy-Root-CA.crt')
        const CADir = dirname(CARoot)
        const caFileName = 'PhpWebStudy-Root-CA'
        if (!existsSync(CARoot)) {
          await mkdirp(CADir)
          let command = `openssl genrsa -out ${caFileName}.key 2048;`
          command += `openssl req -new -key ${caFileName}.key -out ${caFileName}.csr -sha256 -subj "/CN=${caFileName}";`
          command += `echo "basicConstraints=CA:true" > ${caFileName}.cnf;`
          command += `openssl x509 -req -in ${caFileName}.csr -signkey ${caFileName}.key -out ${caFileName}.crt -extfile ${caFileName}.cnf -sha256 -days 3650;`
          await execPromise(command, {
            cwd: CADir
          })
          if (!existsSync(CARoot)) {
            resolve(false)
            return
          }
          command = `echo '${global.Server.Password}' | sudo -S security add-trusted-cert -d -r trustRoot -k "/Library/Keychains/System.keychain" "PhpWebStudy-Root-CA.crt"`
          await execPromise(command, {
            cwd: CADir
          })
          command = `echo '${global.Server.Password}' | sudo -S security find-certificate -c "PhpWebStudy-Root-CA"`
          const res = await execPromise(command, {
            cwd: CADir
          })
          if (
            !res.stdout.includes('PhpWebStudy-Root-CA') &&
            !res.stderr.includes('PhpWebStudy-Root-CA')
          ) {
            resolve(false)
            return
          }
        }
        const hostCAName = `CA-${host.id}`
        const hostCADir = join(CADir, `${host.id}`)
        if (existsSync(hostCADir)) {
          await remove(hostCADir)
        }
        await mkdirp(hostCADir)
        let ext = `authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName=@alt_names

[alt_names]${EOL}`
        alias.forEach((item, index) => {
          ext += `DNS.${index + 1} = ${item}${EOL}`
        })
        ext += `IP.1 = 127.0.0.1${EOL}`
        await writeFile(join(hostCADir, `${hostCAName}.ext`), ext)

        const rootCA = join(CADir, 'PhpWebStudy-Root-CA')

        let command = `openssl req -new -newkey rsa:2048 -nodes -keyout ${hostCAName}.key -out ${hostCAName}.csr -sha256 -subj "/CN=${hostCAName}";`
        command += `openssl x509 -req -in ${hostCAName}.csr -out ${hostCAName}.crt -extfile ${hostCAName}.ext -CA "${rootCA}.crt" -CAkey "${rootCA}.key" -CAcreateserial -sha256 -days 3650;`
        await execPromise(command, {
          cwd: hostCADir
        })
        const crt = join(hostCADir, `${hostCAName}.crt`)
        if (!existsSync(crt)) {
          resolve(false)
          return
        }
        resolve({
          crt,
          key: join(hostCADir, `${hostCAName}.key`)
        })
      } catch (e) {
        resolve(false)
      }
    })
  }

  hostList() {
    return new ForkPromise(async (resolve) => {
      try {
        const hostfile = join(global.Server.BaseDir!, 'host.json')
        if (!existsSync(hostfile)) {
          await writeFile(hostfile, JSON.stringify([]))
          resolve({
            host: []
          })
          return
        }
        const json = await readFile(hostfile, 'utf-8')
        let host = []
        let parseErr = false
        const hostBackFile = join(global.Server.BaseDir!, 'host.back.json')
        try {
          host = JSON.parse(json)
        } catch (e) {
          if (json.trim().length > 0) {
            await copyFile(hostfile, hostBackFile)
            parseErr = true
          }
        }
        if (parseErr) {
          resolve({
            hostBackFile
          })
        } else {
          resolve({
            host
          })
        }
      } catch (e) {
        resolve({
          host: []
        })
      }
    })
  }

  async #initTmpl() {
    const nginxtmpl = join(global.Server.Static!, 'tmpl/nginx.vhost')
    const nginxSSLtmpl = join(global.Server.Static!, 'tmpl/nginxSSL.vhost')

    const apachetmpl = join(global.Server.Static!, 'tmpl/apache.vhost')
    const apacheSSLtmpl = join(global.Server.Static!, 'tmpl/apacheSSL.vhost')

    const caddytmpl = join(global.Server.Static!, 'tmpl/CaddyfileVhost')
    const caddySSLtmpl = join(global.Server.Static!, 'tmpl/CaddyfileVhostSSL')

    this.NginxTmpl = await readFile(nginxtmpl, 'utf-8')
    this.ApacheTmpl = await readFile(apachetmpl, 'utf-8')
    this.NginxSSLTmpl = await readFile(nginxSSLtmpl, 'utf-8')
    this.ApacheSSLTmpl = await readFile(apacheSSLtmpl, 'utf-8')
    this.CaddyTmpl = await readFile(caddytmpl, 'utf-8')
    this.CaddySSLTmpl = await readFile(caddySSLtmpl, 'utf-8')
  }

  handleHost(host: AppHost, flag: string, old?: AppHost, park?: boolean) {
    return new ForkPromise(async (resolve) => {
      const hostfile = join(global.Server.BaseDir!, 'host.json')
      let hostList: Array<AppHost> = []
      const writeHostFile = async () => {
        await writeFile(hostfile, JSON.stringify(hostList))
        resolve({
          host: hostList
        })
      }
      if (existsSync(hostfile)) {
        const content = await readFile(hostfile, 'utf-8')
        try {
          hostList = JSON.parse(content)
        } catch (e) {
          console.log(e)
          if (content.length > 0) {
            const hostBackFile = join(global.Server.BaseDir!, 'host.back.json')
            await copyFile(hostfile, hostBackFile)
            resolve({
              hostBackFile
            })
            return
          }
        }
      }

      let addApachePort = true
      let addApachePortSSL = true

      hostList.forEach((h) => {
        if (h.port.apache === host.port.apache) {
          addApachePort = false
        }
        if (h.port.apache_ssl === host.port.apache_ssl) {
          addApachePortSSL = false
        }
      })

      const doPark = () => {
        console.log('doPark !!!')
        return new ForkPromise((resolve) => {
          if (!park || !host || !host.root) {
            resolve(0)
            return
          }
          const root = host.root
          const subDir = getSubDir(root, false)
          if (subDir.length === 0) {
            resolve(0)
            return
          }
          const arrs: Array<AppHost> = []
          for (const d of subDir) {
            const item = JSON.parse(JSON.stringify(host))
            item.nginx.rewrite = ''
            item.ssl.cert = ''
            item.ssl.key = ''
            item.id = uuid(13)
            const hostName = item.name.split('.')
            hostName.unshift(d)
            item.root = join(root, d)
            item.name = hostName.join('.')
            const find = hostList.find((h) => h.name === item.name)
            if (find) {
              continue
            }
            const aliasArr = item.alias
              ? item.alias.split('\n').filter((n: string) => {
                return n && n?.trim()?.length > 0
              })
              : []
            item.alias = aliasArr
              .map((a: string) => {
                const arr = a.trim().split('.')
                arr.unshift(d)
                return arr.join('.')
              })
              .join('\n')
            arrs.push(item)
          }
          if (arrs.length === 0) {
            resolve(0)
            return
          }
          const all: Array<ForkPromise<any>> = []
          arrs.forEach((a) => {
            all.push(this._addVhost(a, addApachePort, addApachePortSSL, false))
          })
          Promise.all(all)
            .then(() => {
              hostList.unshift(...arrs)
              resolve(1)
            })
            .catch(() => {
              resolve(0)
            })
        })
      }

      let index: number
      switch (flag) {
        case 'add':
          await this.#initTmpl()
          await this._addVhost(host, addApachePort, addApachePortSSL)
          await doPark()
          hostList.unshift(host)
          await writeHostFile()
          break
        case 'del':
          await this._delVhost(host)
          index = hostList.findIndex((h) => h.id === host.id)
          if (index >= 0) {
            hostList.splice(index, 1)
          }
          await writeHostFile()
          break
        case 'edit':
          await this.#initTmpl()
          const nginxConfPath = join(global.Server.BaseDir!, 'vhost/nginx/', `${old?.name}.conf`)
          const apacheConfPath = join(global.Server.BaseDir!, 'vhost/apache/', `${old?.name}.conf`)
          if (
            !existsSync(nginxConfPath) ||
            !existsSync(apacheConfPath) ||
            host.useSSL !== old?.useSSL
          ) {
            await this._delVhost(old!)
            await this._addVhost(host, addApachePort, addApachePortSSL)
          } else {
            await this._editVhost(host, old, addApachePort, addApachePortSSL)
          }
          await doPark()
          index = hostList.findIndex((h) => h.id === old?.id)
          if (index >= 0) {
            hostList[index] = host
          }
          await writeHostFile()
          break
      }
    })
  }

  _delVhost(host: AppHost) {
    return new ForkPromise(async (resolve) => {
      const nginxvpath = join(global.Server.BaseDir!, 'vhost/nginx')
      const apachevpath = join(global.Server.BaseDir!, 'vhost/apache')
      const rewritepath = join(global.Server.BaseDir!, 'vhost/rewrite')
      const caddyvpath = join(global.Server.BaseDir!, 'vhost/caddy')
      const logpath = join(global.Server.BaseDir!, 'vhost/logs')
      const hostname = host.name
      const nvhost = join(nginxvpath, `${hostname}.conf`)
      const avhost = join(apachevpath, `${hostname}.conf`)
      const cvhost = join(caddyvpath, `${hostname}.conf`)
      const rewritep = join(rewritepath, `${hostname}.conf`)
      const accesslogng = join(logpath, `${hostname}.log`)
      const errorlogng = join(logpath, `${hostname}.error.log`)
      const accesslogap = join(logpath, `${hostname}-access_log`)
      const errorlogap = join(logpath, `${hostname}-error_log`)
      const caddylog = join(logpath, `${hostname}.caddy.log`)
      const autoCA = join(global.Server.BaseDir!, `CA/${host.id}`)
      const arr = [
        nvhost,
        avhost,
        cvhost,
        rewritep,
        accesslogng,
        errorlogng,
        accesslogap,
        errorlogap,
        caddylog,
        autoCA
      ]
      for (const f of arr) {
        if (existsSync(f)) {
          try {
            await execPromise(`echo '${global.Server.Password}' | sudo -S rm -rf ${f}`)
          } catch (e) { }
        }
      }
      resolve(true)
    })
  }

  async #setDirRole(dir: string, depth = 0) {
    console.log('#setDirRole: ', dir, depth)
    if (!dir || dir === '/') {
      return
    }
    if (existsSync(dir)) {
      try {
        await execPromise(`echo '${global.Server.Password}' | sudo -S chmod 755 ${dir}`)
      } catch (e) { }
      const parentDir = dirname(dir)
      if (parentDir !== dir) {
        await this.#setDirRole(parentDir, depth + 1)
      }
    }
  }

  /**
   * auto fill nginx url rewrite
   * check folder in path
   * @param host
   * @private
   */
  _autoFillNginxRewrite(host: AppHost, chmod: boolean) {
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

  async #handlePhpEnableConf(v: number) {
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
    } catch (e) { }
  }

  async #initCaddyConf(host: AppHost) {
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

    const contentList: string[] = []

    const hostName = host.name
    const root = host.root
    const phpv = host.phpVersion
    const logFile = join(global.Server.BaseDir!, `vhost/logs/${hostName}.caddy.log`)

    const httpHostNameAll = httpNames.join(',\n')
    const content = this.CaddyTmpl.replace('##HOST-ALL##', httpHostNameAll)
      .replace('##LOG-PATH##', logFile)
      .replace('##ROOT##', root)
      .replace('##PHP-VERSION##', `${phpv}`)
    contentList.push(content)

    if (host.useSSL) {
      let tls = 'internal'
      if (host.ssl.cert && host.ssl.key) {
        tls = `${host.ssl.cert} ${host.ssl.key}`
      }
      const httpHostNameAll = httpsNames.join(',\n')
      const content = this.CaddySSLTmpl.replace('##HOST-ALL##', httpHostNameAll)
        .replace('##LOG-PATH##', logFile)
        .replace('##SSL##', tls)
        .replace('##ROOT##', root)
        .replace('##PHP-VERSION##', `${phpv}`)
      contentList.push(content)
    }
    const confFile = join(caddyvpath, `${host.name}.conf`)
    await writeFile(confFile, contentList.join('\n'))
  }

  async #initNginxConf(host: AppHost) {
    const nginxvpath = join(global.Server.BaseDir!, 'vhost/nginx')
    const rewritepath = join(global.Server.BaseDir!, 'vhost/rewrite')
    const logpath = join(global.Server.BaseDir!, 'vhost/logs')

    await mkdirp(nginxvpath)
    await mkdirp(rewritepath)
    await mkdirp(logpath)

    let ntmpl = this.NginxTmpl
    if (host.useSSL) {
      ntmpl = this.NginxSSLTmpl
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
    await writeFile(nvhost, ntmpl)

    const rewrite = host?.nginx?.rewrite?.trim() ?? ''
    await writeFile(join(rewritepath, `${hostname}.conf`), rewrite)
  }

  async #initApacheConf(host: AppHost) {
    const apachevpath = join(global.Server.BaseDir!, 'vhost/apache')
    const rewritepath = join(global.Server.BaseDir!, 'vhost/rewrite')
    const logpath = join(global.Server.BaseDir!, 'vhost/logs')

    await mkdirp(apachevpath)
    await mkdirp(rewritepath)
    await mkdirp(logpath)

    let atmpl = this.ApacheTmpl

    if (host.useSSL) {
      atmpl = this.ApacheSSLTmpl
    }

    const hostname = host.name
    const avhost = join(apachevpath, `${hostname}.conf`)
    const hostalias = hostAlias(host).join(' ')

    atmpl = atmpl
      .replace(/#Server_Alias#/g, hostalias)
      .replace(/#Server_Root#/g, host.root)
      .replace(/#Rewrite_Path#/g, rewritepath)
      .replace(/#Server_Name#/g, hostname)
      .replace(/#Log_Path#/g, logpath)
      .replace(/#Server_Cert#/g, host.ssl.cert)
      .replace(/#Server_CertKey#/g, host.ssl.key)
      .replace(/#Port_Apache#/g, `${host.port.apache}`)
      .replace(/#Port_Apache_SSL#/g, `${host.port.apache_ssl}`)
    if (host.phpVersion) {
      atmpl = atmpl.replace(
        /SetHandler "proxy:fcgi:\/\/127\.0\.0\.1:9000"/g,
        `SetHandler "proxy:unix:/tmp/phpwebstudy-php-cgi-${host.phpVersion}.sock|fcgi://localhost"`
      )
    } else {
      atmpl = atmpl.replace(
        /SetHandler "proxy:fcgi:\/\/127\.0\.0\.1:9000"/g,
        '##Static Site Apache##'
      )
    }

    await writeFile(avhost, atmpl)
  }

  initAllConf(host: AppHost) {
    return new ForkPromise(async (resolve) => {
      await this.#initTmpl()

      const nginxvpath = join(global.Server.BaseDir!, 'vhost/nginx')
      const apachevpath = join(global.Server.BaseDir!, 'vhost/apache')
      const caddyvpath = join(global.Server.BaseDir!, 'vhost/caddy')

      const nginxConfPath = join(nginxvpath, `${host.name}.conf`)
      const apacheConfPath = join(apachevpath, `${host.name}.conf`)
      const caddyConfPath = join(caddyvpath, `${host.name}.conf`)

      if (!existsSync(nginxConfPath)) {
        await this.#initNginxConf(host)
      }
      if (!existsSync(apacheConfPath)) {
        await this.#initApacheConf(host)
      }
      if (!existsSync(caddyConfPath)) {
        await this.#initCaddyConf(host)
      }

      resolve(true)
    })
  }

  /**
   * 增量更新
   * @param host
   * @param old
   * @param addApachePort
   * @param addApachePortSSL
   * @private
   */
  _editVhost(host: AppHost, old: AppHost, addApachePort = true, addApachePortSSL = true) {
    return new ForkPromise(async (resolve) => {
      if (host?.phpVersion) {
        await this.#handlePhpEnableConf(host?.phpVersion)
      }
      const nginxvpath = join(global.Server.BaseDir!, 'vhost/nginx')
      const apachevpath = join(global.Server.BaseDir!, 'vhost/apache')
      const caddyvpath = join(global.Server.BaseDir!, 'vhost/caddy')
      const rewritepath = join(global.Server.BaseDir!, 'vhost/rewrite')
      const logpath = join(global.Server.BaseDir!, 'vhost/logs')

      await mkdirp(nginxvpath)
      await mkdirp(apachevpath)
      await mkdirp(caddyvpath)
      await mkdirp(rewritepath)
      await mkdirp(logpath)

      if (host.name !== old.name) {
        const nvhost = {
          oldFile: join(nginxvpath, `${old.name}.conf`),
          newFile: join(nginxvpath, `${host.name}.conf`)
        }
        const avhost = {
          oldFile: join(apachevpath, `${old.name}.conf`),
          newFile: join(apachevpath, `${host.name}.conf`)
        }
        const cvhost = {
          oldFile: join(caddyvpath, `${old.name}.conf`),
          newFile: join(caddyvpath, `${host.name}.conf`)
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
        const accesslogap = {
          oldFile: join(logpath, `${old.name}-access_log`),
          newFile: join(logpath, `${host.name}-access_log`)
        }
        const errorlogap = {
          oldFile: join(logpath, `${old.name}-error_log`),
          newFile: join(logpath, `${host.name}-error_log`)
        }
        const caddylog = {
          oldFile: join(logpath, `${old.name}.caddy.log`),
          newFile: join(logpath, `${host.name}.caddy.log`)
        }
        const arr = [
          nvhost,
          avhost,
          cvhost,
          rewritep,
          accesslogng,
          errorlogng,
          accesslogap,
          errorlogap,
          caddylog
        ]
        for (const f of arr) {
          if (existsSync(f.oldFile)) {
            await execPromise(
              `echo '${global.Server.Password}' | sudo -S cp -f ${f.oldFile} ${f.newFile}`
            )
            await execPromise(`echo '${global.Server.Password}' | sudo -S rm -rf ${f.oldFile}`)
          }
          if (existsSync(f.newFile)) {
            await execPromise(`echo '${global.Server.Password}' | sudo -S chmod 777 ${f.newFile}`)
          }
        }
      }
      const nginxConfPath = join(nginxvpath, `${host.name}.conf`)
      const apacheConfPath = join(apachevpath, `${host.name}.conf`)
      const caddyConfPath = join(caddyvpath, `${host.name}.conf`)
      let hasChanged = false

      if (!existsSync(nginxConfPath)) {
        await this.#initNginxConf(host)
      }
      if (!existsSync(apacheConfPath)) {
        await this.#initApacheConf(host)
      }
      if (!existsSync(caddyConfPath)) {
        await this.#initCaddyConf(host)
      }

      let contentNginxConf = await readFile(nginxConfPath, 'utf-8')
      let contentApacheConf = await readFile(apacheConfPath, 'utf-8')
      let contentCaddyConf = await readFile(caddyConfPath, 'utf-8')

      const find: Array<string> = []
      const replace: Array<string> = []
      if (host.name !== old.name) {
        hasChanged = true
        find.push(
          ...[
            `include ${rewritepath}/${old.name}.conf;`,
            `access_log  ${logpath}/${old.name}.log;`,
            `error_log  ${logpath}/${old.name}.error.log;`,
            `ServerName ${old.name}`,
            `ErrorLog "${logpath}/${old.name}-error_log"`,
            `CustomLog "${logpath}/${old.name}-access_log" combined`,
            `ServerName SSL.${old.name}`,
            join(logpath, `${old.name}.caddy.log`)
          ]
        )
        replace.push(
          ...[
            `include ${rewritepath}/${host.name}.conf;`,
            `access_log  ${logpath}/${host.name}.log;`,
            `error_log  ${logpath}/${host.name}.error.log;`,
            `ServerName ${host.name}`,
            `ErrorLog "${logpath}/${host.name}-error_log"`,
            `CustomLog "${logpath}/${host.name}-access_log" combined`,
            `ServerName SSL.${host.name}`,
            join(logpath, `${host.name}.caddy.log`)
          ]
        )
      }
      const oldAliasArr = hostAlias(old)
      const newAliasArr = hostAlias(host)
      if (!isEqual(oldAliasArr, newAliasArr)) {
        hasChanged = true
        const oldAlias = oldAliasArr.join(' ')
        const newAlias = newAliasArr.join(' ')
        find.push(...[`server_name ${oldAlias};`, `ServerAlias ${oldAlias}`])
        replace.push(...[`server_name ${newAlias};`, `ServerAlias ${newAlias}`])
      }

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

      if (host?.useSSL && host?.autoSSL) {
        if (host?.autoSSL !== old?.autoSSL || !isEqual(oldAliasArr, newAliasArr)) {
          const ssl = await this._makeAutoSSL(host)
          if (ssl) {
            host.ssl.cert = ssl.crt
            host.ssl.key = ssl.key
          } else {
            host.autoSSL = false
          }
        }
      }
      if (host.ssl.cert !== old.ssl.cert) {
        hasChanged = true
        find.push(
          ...[
            `ssl_certificate    ${old.ssl.cert};`,
            `ssl_certificate    "${old.ssl.cert}";`,
            `SSLCertificateFile ${old.ssl.cert}`,
            `SSLCertificateFile "${old.ssl.cert}"`,
            old.ssl.cert
          ]
        )
        replace.push(
          ...[
            `ssl_certificate    "${host.ssl.cert}";`,
            `ssl_certificate    "${host.ssl.cert}";`,
            `SSLCertificateFile "${host.ssl.cert}"`,
            `SSLCertificateFile "${host.ssl.cert}"`,
            host.ssl.cert
          ]
        )
      }
      if (host.ssl.key !== old.ssl.key) {
        hasChanged = true
        find.push(
          ...[
            `ssl_certificate_key    ${old.ssl.key};`,
            `ssl_certificate_key    "${old.ssl.key}";`,
            `SSLCertificateKeyFile ${old.ssl.key}`,
            `SSLCertificateKeyFile "${old.ssl.key}"`,
            old.ssl.key
          ]
        )
        replace.push(
          ...[
            `ssl_certificate_key    "${host.ssl.key}";`,
            `ssl_certificate_key    "${host.ssl.key}";`,
            `SSLCertificateKeyFile "${host.ssl.key}"`,
            `SSLCertificateKeyFile "${host.ssl.key}"`,
            host.ssl.key
          ]
        )
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
      if (host.port.apache !== old.port.apache) {
        hasChanged = true
        find.push(...[`Listen ${old.port.apache}\nNameVirtualHost *:${old.port.apache}\n`])
        if (addApachePort) {
          replace.push(...[`Listen ${host.port.apache}\nNameVirtualHost *:${host.port.apache}\n`])
        } else {
          replace.push('')
        }
        find.push(...[`<VirtualHost \\*:${old.port.apache}>`])
        replace.push(...[`<VirtualHost *:${host.port.apache}>`])
      }
      if (host.port.apache_ssl !== old.port.apache_ssl) {
        hasChanged = true
        find.push(...[`Listen ${old.port.apache_ssl}\nNameVirtualHost *:${old.port.apache_ssl}\n`])
        if (addApachePortSSL) {
          replace.push(
            ...[`Listen ${host.port.apache_ssl}\nNameVirtualHost *:${host.port.apache_ssl}\n`]
          )
        } else {
          replace.push('')
        }
        find.push(...[`<VirtualHost \\*:${old.port.apache_ssl}>`])
        replace.push(...[`<VirtualHost *:${host.port.apache_ssl}>`])
      }
      if (host.root !== old.root) {
        hasChanged = true
        find.push(
          ...[
            `root ${old.root};`,
            `root "${old.root}";`,
            `DocumentRoot "${old.root}"`,
            `<Directory "${old.root}">`,
            old.root
          ]
        )
        replace.push(
          ...[
            `root "${host.root}";`,
            `root "${host.root}";`,
            `DocumentRoot "${host.root}"`,
            `<Directory "${host.root}">`,
            host.root
          ]
        )
        this.#setDirRole(host.root)
      }
      if (host.phpVersion !== old.phpVersion) {
        hasChanged = true
        if (old.phpVersion) {
          find.push(
            ...[
              `include enable-php-${old.phpVersion}.conf;`,
              `SetHandler "proxy:unix:/tmp/phpwebstudy-php-cgi-${old.phpVersion}.sock\\|fcgi://localhost"`,
              `import enable-php-select ${old.phpVersion}`
            ]
          )
        } else {
          find.push(
            ...[
              '##Static Site Nginx##',
              '##Static Site Apache##',
              'import enable-php-select undefined'
            ]
          )
        }
        if (host.phpVersion) {
          replace.push(
            ...[
              `include enable-php-${host.phpVersion}.conf;`,
              `SetHandler "proxy:unix:/tmp/phpwebstudy-php-cgi-${host.phpVersion}.sock|fcgi://localhost"`,
              `import enable-php-select ${host.phpVersion}`
            ]
          )
        } else {
          replace.push(
            ...[
              '##Static Site Nginx##',
              '##Static Site Apache##',
              'import enable-php-select undefined'
            ]
          )
        }
      }
      if (hasChanged) {
        find.forEach((s, i) => {
          contentNginxConf = contentNginxConf.replace(new RegExp(s, 'g'), replace[i])
          contentApacheConf = contentApacheConf.replace(new RegExp(s, 'g'), replace[i])
          contentCaddyConf = contentCaddyConf.replace(new RegExp(s, 'g'), replace[i])
        })
        await writeFile(nginxConfPath, contentNginxConf)
        await writeFile(apacheConfPath, contentApacheConf)
        await writeFile(caddyConfPath, contentCaddyConf)
      }
      if (host.nginx.rewrite.trim() !== old.nginx.rewrite.trim()) {
        const nginxRewriteConfPath = join(rewritepath, `${host.name}.conf`)
        await writeFile(nginxRewriteConfPath, host.nginx.rewrite.trim())
      }
      resolve(true)
    })
  }

  _addVhost(host: AppHost, addApachePort = true, addApachePortSSL = true, chmod = true) {
    return new ForkPromise(async (resolve, reject) => {
      if (host?.phpVersion) {
        await this.#handlePhpEnableConf(host.phpVersion)
      }
      try {
        /**
         * auto fill nginx url rewrite
         */
        await this._autoFillNginxRewrite(host, chmod)

        if (host?.useSSL && host?.autoSSL) {
          const ssl = await this._makeAutoSSL(host)
          if (ssl) {
            host.ssl.cert = ssl.crt
            host.ssl.key = ssl.key
          } else {
            host.autoSSL = false
          }
        }

        await this.#initCaddyConf(host)
        await this.#initNginxConf(host)
        await this.#initApacheConf(host)
        if (chmod) {
          await this.#setDirRole(host.root)
        }
        resolve(true)
      } catch (e) {
        console.log('_addVhost: ', e)
        reject(e)
      }
    })
  }

  _initHost(list: Array<AppHost>, writeToSystem = true) {
    return new ForkPromise(async (resolve, reject) => {
      const allHost: Set<string> = new Set<string>()
      const host: Array<string> = []
      for (const item of list) {
        const alias = hostAlias(item)
        alias.forEach((a) => {
          allHost.add(a)
        })
      }
      allHost.forEach((a) => {
        host.push(`127.0.0.1     ${a}`)
        host.push(`::1     ${a}`)
      })
      await writeFile(join(global.Server.BaseDir!, 'app.hosts.txt'), host.join('\n'))
      if (!writeToSystem) {
        resolve(true)
        return
      }
      const filePath = '/etc/hosts'
      if (!existsSync(filePath)) {
        reject(new Error(I18nT('fork.hostsFileNoFound')))
        return
      }
      let content = await readFile(filePath, 'utf-8')
      let x: any = content.match(/(#X-HOSTS-BEGIN#)([\s\S]*?)(#X-HOSTS-END#)/g)
      if (x && x[0]) {
        x = x[0]
        content = content.replace(x, '')
      }
      if (host) {
        x = `#X-HOSTS-BEGIN#\n${host.join('\n')}\n#X-HOSTS-END#`
      } else {
        x = ''
      }
      content = content.trim()
      content += `\n${x}`

      const tmpFile = join(global.Server.Cache!, 'hosts-tmpl')
      await writeFile(tmpFile, content.trim())
      await execPromise(`echo "${global.Server.Password}" | sudo -S cp ${tmpFile} /etc/hosts`)

      resolve(true)
    })
  }

  githubFix() {
    return new ForkPromise((resolve, reject) => {
      const hosts = [
        'github.com',
        'github.global.ssl.fastly.net',
        'assets-cdn.github.com',
        'raw.githubusercontent.com',
        'macphpstudy.com',
        'pkg-containers.githubusercontent.com'
      ]
      dns.setServers(['8.8.8.8', '8.8.4.4', '64.6.64.6', '64.6.65.6', '168.95.192.1', '168.95.1.1'])
      const all = []
      for (const host of hosts) {
        all.push(util.promisify(dns.resolve)(host))
      }
      Promise.all(all).then(async (arr) => {
        const list = ['#GITHUB-HOSTS-BEGIN#']
        arr.forEach((ips, i) => {
          const host = hosts[i]
          ips.forEach((ip) => {
            list.push(`${ip}  ${host}`)
          })
        })
        list.push('#GITHUB-HOSTS-END#')
        try {
          const hostFile = '/etc/hosts'
          let content = await readFile(hostFile, 'utf-8')
          let x: any = content.match(/(#GITHUB-HOSTS-BEGIN#)([\s\S]*?)(#GITHUB-HOSTS-END#)/g)
          if (x && x[0]) {
            x = x[0]
            content = content.replace(x, '')
          }
          content = content.trim()
          content += `\n${list.join('\n')}`
          await writeFile(hostFile, content.trim())
          resolve(0)
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  async _fixHostsRole() {
    let access = false
    try {
      accessSync('/etc/hosts', constants.R_OK | constants.W_OK)
      access = true
      console.log('可以读写')
    } catch (err) {
      console.error('无权访问')
    }
    if (!access) {
      const password = global.Server.Password
      try {
        await execPromise(`echo '${password}' | sudo -S chmod 777 /private/etc`)
        await execPromise(`echo '${password}' | sudo -S chmod 777 /etc/hosts`)
      } catch (e) { }
    }
  }

  doFixHostsRole() {
    return new ForkPromise(async (resolve) => {
      await this._fixHostsRole()
      resolve(0)
    })
  }

  writeHosts(write = true) {
    return new ForkPromise(async (resolve) => {
      await this._fixHostsRole()
      const hostfile = join(global.Server.BaseDir!, 'host.json')
      const appHost: Array<AppHost> = []
      if (existsSync(hostfile)) {
        let json: any = await readFile(hostfile, 'utf-8')
        try {
          json = JSON.parse(json)
          appHost.push(...json)
        } catch (e) { }
      }
      if (write) {
        this._initHost(appHost).then(resolve)
      } else {
        let hosts = await readFile('/etc/hosts', 'utf-8')
        const x = hosts.match(/(#X-HOSTS-BEGIN#)([\s\S]*?)(#X-HOSTS-END#)/g)
        if (x) {
          hosts = hosts.replace(x[0], '')
          const tmpFile = join(global.Server.Cache!, 'hosts-tmpl')
          await writeFile(tmpFile, hosts.trim())
          await execPromise(`echo "${global.Server.Password}" | sudo -S cp ${tmpFile} /etc/hosts`)
        }
        this._initHost(appHost, false).then(resolve)
      }
    })
  }

  addRandaSite(version?: SoftInstalled) {
    return new ForkPromise(async (resolve, reject) => {
      const baseName = join(global.Server.BaseDir!, 'www')
      let host = `www.test.com`
      let i = 0
      let dir = `${baseName}/${host}`
      while (existsSync(dir)) {
        i += 1
        host = `www.test${i}.com`
        dir = `${baseName}/${host}`
      }
      await mkdirp(dir)
      const hostItem: any = {
        id: new Date().getTime(),
        name: host,
        alias: '',
        useSSL: false,
        ssl: {
          cert: '',
          key: ''
        },
        port: {
          nginx: 80,
          apache: 8080,
          nginx_ssl: 443,
          apache_ssl: 8443
        },
        nginx: {
          rewrite: ''
        },
        url: '',
        root: dir,
        mark: 'phpwebstudy ai created',
        phpVersion: undefined
      }
      if (version?.num) {
        hostItem.phpVersion = version.num
      }
      try {
        await this.handleHost(hostItem, 'add')
        await this.writeHosts()
        if (version?.num) {
          const file = join(dir, 'index.php')
          await writeFile(
            file,
            `<?php
        phpinfo();
        `
          )
        } else {
          const file = join(dir, 'index.html')
          await writeFile(
            file,
            `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PhpWebStudy AI Created</title>
  </head>
  <body>
    PhpWebStudy AI Created
  </body>
</html>
`
          )
        }
        this.#setDirRole(dir)
        resolve({
          host,
          dir,
          version
        })
      } catch (e) {
        reject(e)
      }
    })
  }

  addPhpMyAdminSite(phpVersion?: number) {
    return new ForkPromise(async (resolve, reject, on) => {
      const zipFile = join(global.Server.Cache!, 'phpMyAdmin.zip')
      const wwwDir = join(global.Server.BaseDir!, 'www')
      const siteDir = join(global.Server.BaseDir!, 'www/phpMyAdmin-5.2.1-all-languages')
      const hostfile = join(global.Server.BaseDir!, 'host.json')
      let hostList: Array<AppHost> = []
      const content = await readFile(hostfile, 'utf-8')
      try {
        hostList = JSON.parse(content)
      } catch (e) { }
      const find = hostList.find((h) => h.name === 'phpmyadmin.phpwebstudy.test')
      if (find) {
        resolve(true)
        return
      }

      const doMake = async () => {
        if (!existsSync(siteDir) || readdirSync(siteDir).length === 0) {
          if (!existsSync(zipFile)) {
            reject(new Error(I18nT('fork.downFileFail')))
            return
          }
          if (existsSync(siteDir)) {
            await remove(siteDir)
          }
          await mkdirp(wwwDir)
          try {
            await compressing.zip.uncompress(zipFile, wwwDir)
          } catch (e) {
            reject(e)
            return
          }
          if (readdirSync(siteDir).length === 0) {
            reject(new Error(I18nT('fork.downFileFail')))
            return
          }
        }

        let useSSL = false
        let autoSSL = false
        const CARoot = join(global.Server.BaseDir!, 'CA/PhpWebStudy-Root-CA.crt')
        if (existsSync(CARoot)) {
          useSSL = true
          autoSSL = true
        }

        const hostItem: any = {
          id: new Date().getTime(),
          name: 'phpmyadmin.phpwebstudy.test',
          alias: '',
          useSSL: useSSL,
          autoSSL: autoSSL,
          ssl: {
            cert: '',
            key: ''
          },
          port: {
            nginx: 80,
            apache: 80,
            nginx_ssl: 443,
            apache_ssl: 443,
            caddy: 80,
            caddy_ssl: 443
          },
          nginx: {
            rewrite: ''
          },
          url: '',
          root: siteDir,
          mark: 'PhoMyAdmin - PhpWebStudy Auto Created',
          phpVersion: undefined
        }
        if (phpVersion) {
          hostItem.phpVersion = phpVersion
        }
        try {
          await this.handleHost(hostItem, 'add')
          await this.writeHosts()
          await this.#setDirRole(siteDir)
          resolve(true)
        } catch (e) {
          reject(e)
        }
      }
      if (existsSync(zipFile)) {
        doMake().then()
        return
      }

      const zipTmpFile = join(global.Server.Cache!, 'phpMyAdmin-Cache')
      if (existsSync(zipTmpFile)) {
        await remove(zipTmpFile)
      }
      const url = 'https://files.phpmyadmin.net/phpMyAdmin/5.2.1/phpMyAdmin-5.2.1-all-languages.zip'
      downFile(url, zipTmpFile)
        .on(on)
        .then(async () => {
          return copy(zipTmpFile, zipFile)
        })
        .then(() => {
          if (existsSync(zipFile)) {
            doMake().then()
            return
          } else {
            reject(new Error(I18nT('fork.downFileFail')))
          }
        })
        .catch(reject)
    })
  }
}
export default new Host()
