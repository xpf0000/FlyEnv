const { join, dirname } = require('path')
const {
  unlinkSync,
  existsSync,
  readFileSync,
  writeFileSync,
  accessSync,
  constants,
  copyFileSync
} = require('fs')
const { execSync } = require('child_process')
const { exec } = require('child-process-promise')
const Utils = require('./Utils')
const dns = require('dns')
const util = require('util')
const { I18nT } = require('./lang/index.js')

class HostManager {
  constructor() {
    this.ipcCommand = ''
    this.ipcCommandKey = ''
  }
  exec(commands) {
    this.ipcCommand = commands[0]
    commands.splice(0, 1)
    this.ipcCommandKey = commands[0]
    commands.splice(0, 1)

    let fn = commands[0]
    commands.splice(0, 1)
    this[fn](...commands)
  }

  hostList() {
    let hostfile = join(global.Server.BaseDir, 'host.json')
    if (!existsSync(hostfile)) {
      Utils.writeFileAsync(hostfile, JSON.stringify([])).then()
      process.send({
        command: this.ipcCommand,
        key: this.ipcCommandKey,
        info: {
          code: 0,
          msg: 'SUCCESS',
          hosts: []
        }
      })
      return
    }
    Utils.readFileAsync(hostfile).then((json) => {
      let host = []
      let parseErr = false
      const hostBackFile = join(global.Server.BaseDir, 'host.back.json')
      try {
        host = JSON.parse(json)
      } catch (e) {
        if (json.trim().length > 0) {
          copyFileSync(hostfile, hostBackFile)
          parseErr = true
        }
      }
      process.send({
        command: this.ipcCommand,
        key: this.ipcCommandKey,
        info: {
          code: parseErr ? 2 : 0,
          msg: 'SUCCESS',
          hosts: host,
          hostBackFile
        }
      })
    })
  }

  handleHost(host, flag, old, park) {
    let hostfile = join(global.Server.BaseDir, 'host.json')
    let hostList = []

    const writeHostFile = () => {
      writeFileSync(hostfile, JSON.stringify(hostList))
      process.send({
        command: this.ipcCommand,
        key: this.ipcCommandKey,
        info: {
          code: 0,
          msg: 'SUCCESS',
          hosts: hostList
        }
      })
    }

    const sendError = (err) => {
      console.log(err)
      process.send({
        command: this.ipcCommand,
        key: this.ipcCommandKey,
        info: {
          code: 1,
          msg: err
        }
      })
    }

    if (existsSync(hostfile)) {
      const content = readFileSync(hostfile, 'utf-8').toString().trim()
      try {
        hostList = JSON.parse(content)
      } catch (e) {
        console.log(e)
        if (content.length > 0) {
          const hostBackFile = join(global.Server.BaseDir, 'host.back.json')
          copyFileSync(hostfile, hostBackFile)
          process.send({
            command: this.ipcCommand,
            key: this.ipcCommandKey,
            info: {
              code: 2,
              msg: 'FAIL',
              hostBackFile
            }
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
      return new Promise((resolve) => {
        if (!park || !host || !host.root) {
          resolve(0)
          return
        }
        const root = host.root
        const subDir = Utils.getSubDir(root, false)
        if (subDir.length === 0) {
          resolve(0)
          return
        }
        const arrs = []
        for (const d of subDir) {
          const item = JSON.parse(JSON.stringify(host))
          item.id = Utils.uuid(13)
          const hostName = item.name.split('.')
          hostName.unshift(d)
          item.root = join(root, d)
          item.name = hostName.join('.')
          const find = hostList.find((h) => h.name === item.name)
          if (find) {
            continue
          }
          const aliasArr = item.alias
            ? item.alias.split('\n').filter((n) => {
                return n && n.length > 0
              })
            : []
          item.alias = aliasArr
            .map((a) => {
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
        const all = []
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

    const initTmpl = () => {
      const nginxtmpl = join(global.Server.Static, 'tmpl/nginx.vhost')
      const apachetmpl = join(global.Server.Static, 'tmpl/apache.vhost')
      const nginxSSLtmpl = join(global.Server.Static, 'tmpl/nginxSSL.vhost')
      const apacheSSLtmpl = join(global.Server.Static, 'tmpl/apacheSSL.vhost')
      this.NginxTmpl = readFileSync(nginxtmpl, 'utf-8')
      this.ApacheTmpl = readFileSync(apachetmpl, 'utf-8')
      this.NginxSSLTmpl = readFileSync(nginxSSLtmpl, 'utf-8')
      this.ApacheSSLTmpl = readFileSync(apacheSSLtmpl, 'utf-8')
    }

    switch (flag) {
      case 'add':
        initTmpl()
        this._addVhost(host, addApachePort, addApachePortSSL)
          .then(() => {
            return doPark()
          })
          .then(() => {
            hostList.unshift(host)
            writeHostFile()
          })
          .catch((err) => {
            sendError(err)
          })
        break
      case 'del':
        this._delVhost(host)
          .then(() => {
            const index = hostList.findIndex((h) => h.id === host.id)
            if (index >= 0) {
              hostList.splice(index, 1)
            }
            writeHostFile()
          })
          .catch((err) => {
            sendError(err)
          })
        break
      case 'edit':
        initTmpl()
        const nginxConfPath = join(global.Server.BaseDir, 'vhost/nginx/', `${old.name}.conf`)
        const apacheConfPath = join(global.Server.BaseDir, 'vhost/apache/', `${old.name}.conf`)
        let primose
        if (
          !existsSync(nginxConfPath) ||
          !existsSync(apacheConfPath) ||
          host.useSSL !== old.useSSL
        ) {
          primose = this._delVhost(old).then(() => {
            return this._addVhost(host, addApachePort, addApachePortSSL)
          })
        } else {
          primose = this._editVhost(host, old, addApachePort, addApachePortSSL)
        }
        primose
          .then(() => {
            return doPark()
          })
          .then(() => {
            const index = hostList.findIndex((h) => h.id === old.id)
            if (index >= 0) {
              hostList[index] = host
            }
            writeHostFile()
          })
          .catch((err) => {
            sendError(err)
          })
        break
    }
  }

  _delVhost(host) {
    return new Promise((resolve) => {
      let nginxvpath = join(global.Server.BaseDir, 'vhost/nginx')
      let apachevpath = join(global.Server.BaseDir, 'vhost/apache')
      let rewritepath = join(global.Server.BaseDir, 'vhost/rewrite')
      let logpath = join(global.Server.BaseDir, 'vhost/logs')
      let hostname = host.name
      let nvhost = join(nginxvpath, `${hostname}.conf`)
      let avhost = join(apachevpath, `${hostname}.conf`)
      let rewritep = join(rewritepath, `${hostname}.conf`)
      let accesslogng = join(logpath, `${hostname}.log`)
      let errorlogng = join(logpath, `${hostname}.error.log`)
      let accesslogap = join(logpath, `${hostname}-access_log`)
      let errorlogap = join(logpath, `${hostname}-error_log`)
      let arr = [nvhost, avhost, rewritep, accesslogng, errorlogng, accesslogap, errorlogap]
      for (let f of arr) {
        if (existsSync(f)) {
          unlinkSync(f)
        }
      }
      resolve(true)
    })
  }

  #setDirRole(dir, depth = 0) {
    if (!dir || dir === '/') {
      return
    }
    try {
      if (existsSync(dir)) {
        let e
        if (depth === 0) {
          e = exec(`echo '${global.Server.Password}' | sudo -S chmod -R 755 ${dir}`)
        } else {
          e = exec(`echo '${global.Server.Password}' | sudo -S chmod 755 ${dir}`)
        }
        e.then(() => {
          const parentDir = dirname(dir)
          this.#setDirRole(parentDir, depth + 1)
        })
      }
    } catch (e) {
      console.log('setDirRole err: ', e)
    }
  }

  /**
   * auto fill nginx url rewrite
   * check folder in path
   * @param host
   * @private
   */
  _autoFillNginxRewrite(host, chmod) {
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

  /**
   * 增量更新
   * @param host
   * @param old
   * @param addApachePort
   * @param addApachePortSSL
   * @private
   */
  _editVhost(host, old, addApachePort = true, addApachePortSSL = true) {
    return new Promise((resolve) => {
      let nginxvpath = join(global.Server.BaseDir, 'vhost/nginx')
      let apachevpath = join(global.Server.BaseDir, 'vhost/apache')
      let rewritepath = join(global.Server.BaseDir, 'vhost/rewrite')
      let logpath = join(global.Server.BaseDir, 'vhost/logs')
      if (host.name !== old.name) {
        const nvhost = {
          oldFile: join(nginxvpath, `${old.name}.conf`),
          newFile: join(nginxvpath, `${host.name}.conf`)
        }
        const avhost = {
          oldFile: join(apachevpath, `${old.name}.conf`),
          newFile: join(apachevpath, `${host.name}.conf`)
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
        const arr = [nvhost, avhost, rewritep, accesslogng, errorlogng, accesslogap, errorlogap]
        for (let f of arr) {
          if (existsSync(f.oldFile)) {
            copyFileSync(f.oldFile, f.newFile)
            unlinkSync(f.oldFile)
          }
        }
      }
      const nginxConfPath = join(nginxvpath, `${host.name}.conf`)
      const apacheConfPath = join(apachevpath, `${host.name}.conf`)
      let hasChanged = false

      let contentNginxConf = readFileSync(nginxConfPath, 'utf-8')
      let contentApacheConf = readFileSync(apacheConfPath, 'utf-8')
      const find = []
      const replace = []
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
            `ServerName SSL.${old.name}`
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
            `ServerName SSL.${host.name}`
          ]
        )
      }
      if (host.alias !== old.alias || host.name !== old.name) {
        let oldAlias = this.#hostAlias(old)
        let newAlias = this.#hostAlias(host)
        hasChanged = true
        find.push(...[`server_name ${oldAlias};`, `ServerAlias ${oldAlias}`])
        replace.push(...[`server_name ${newAlias};`, `ServerAlias ${newAlias}`])
      }
      if (host.ssl.cert !== old.ssl.cert) {
        hasChanged = true
        find.push(
          ...[
            `ssl_certificate    ${old.ssl.cert};`,
            `ssl_certificate    "${old.ssl.cert}";`,
            `SSLCertificateFile ${old.ssl.cert}`,
            `SSLCertificateFile "${old.ssl.cert}"`
          ]
        )
        replace.push(
          ...[
            `ssl_certificate    "${host.ssl.cert}";`,
            `ssl_certificate    "${host.ssl.cert}";`,
            `SSLCertificateFile "${host.ssl.cert}"`,
            `SSLCertificateFile "${host.ssl.cert}"`
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
            `SSLCertificateKeyFile "${old.ssl.key}"`
          ]
        )
        replace.push(
          ...[
            `ssl_certificate_key    "${host.ssl.key}";`,
            `ssl_certificate_key    "${host.ssl.key}";`,
            `SSLCertificateKeyFile "${host.ssl.key}"`,
            `SSLCertificateKeyFile "${host.ssl.key}"`
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
            `<Directory "${old.root}">`
          ]
        )
        replace.push(
          ...[
            `root "${host.root}";`,
            `root "${host.root}";`,
            `DocumentRoot "${host.root}"`,
            `<Directory "${host.root}">`
          ]
        )
      }
      if (host.phpVersion !== old.phpVersion) {
        hasChanged = true
        if (old.phpVersion) {
          find.push(
            ...[
              `include enable-php-${old.phpVersion}.conf;`,
              `SetHandler "proxy:unix:/tmp/phpwebstudy-php-cgi-${old.phpVersion}.sock\\|fcgi://localhost"`
            ]
          )
        } else {
          find.push(...['##Static Site Nginx##', '##Static Site Apache##'])
        }
        if (host.phpVersion) {
          replace.push(
            ...[
              `include enable-php-${host.phpVersion}.conf;`,
              `SetHandler "proxy:unix:/tmp/phpwebstudy-php-cgi-${host.phpVersion}.sock|fcgi://localhost"`
            ]
          )
        } else {
          replace.push(...['##Static Site Nginx##', '##Static Site Apache##'])
        }
      }
      if (hasChanged) {
        find.forEach((s, i) => {
          contentNginxConf = contentNginxConf.replace(new RegExp(s, 'g'), replace[i])
          contentApacheConf = contentApacheConf.replace(new RegExp(s, 'g'), replace[i])
        })
        writeFileSync(nginxConfPath, contentNginxConf)
        writeFileSync(apacheConfPath, contentApacheConf)
      }
      if (host.nginx.rewrite.trim() !== old.nginx.rewrite.trim()) {
        const nginxRewriteConfPath = join(rewritepath, `${host.name}.conf`)
        writeFileSync(nginxRewriteConfPath, host.nginx.rewrite.trim())
      }
      resolve(true)
    })
  }

  _addVhost(host, addApachePort = true, addApachePortSSL = true, chmod = true) {
    return new Promise((resolve, reject) => {
      try {
        /**
         * auto fill nginx url rewrite
         */
        this._autoFillNginxRewrite(host, chmod)

        let nginxvpath = join(global.Server.BaseDir, 'vhost/nginx')
        let apachevpath = join(global.Server.BaseDir, 'vhost/apache')
        let rewritepath = join(global.Server.BaseDir, 'vhost/rewrite')
        let logpath = join(global.Server.BaseDir, 'vhost/logs')
        Utils.createFolder(nginxvpath)
        Utils.createFolder(apachevpath)
        Utils.createFolder(rewritepath)
        Utils.createFolder(logpath)

        let ntmpl = this.NginxTmpl
        let atmpl = this.ApacheTmpl

        if (host.useSSL) {
          ntmpl = this.NginxSSLTmpl
          atmpl = this.ApacheSSLTmpl
        }

        let hostname = host.name
        let nvhost = join(nginxvpath, `${hostname}.conf`)
        let avhost = join(apachevpath, `${hostname}.conf`)
        let hostalias = this.#hostAlias(host)
        ntmpl = ntmpl
          .replace(/#Server_Alias#/g, hostalias)
          .replace(/#Server_Root#/g, host.root)
          .replace(/#Rewrite_Path#/g, rewritepath)
          .replace(/#Server_Name#/g, hostname)
          .replace(/#Log_Path#/g, logpath)
          .replace(/#Server_Cert#/g, host.ssl.cert)
          .replace(/#Server_CertKey#/g, host.ssl.key)
          .replace(/#Port_Nginx#/g, host.port.nginx)
          .replace(/#Port_Nginx_SSL#/g, host.port.nginx_ssl)

        if (host.phpVersion) {
          ntmpl = ntmpl.replace(
            /include enable-php\.conf;/g,
            `include enable-php-${host.phpVersion}.conf;`
          )
        } else {
          ntmpl = ntmpl.replace(/include enable-php\.conf;/g, '##Static Site Nginx##')
        }
        writeFileSync(nvhost, ntmpl)

        atmpl = atmpl
          .replace(/#Server_Alias#/g, hostalias)
          .replace(/#Server_Root#/g, host.root)
          .replace(/#Rewrite_Path#/g, rewritepath)
          .replace(/#Server_Name#/g, hostname)
          .replace(/#Log_Path#/g, logpath)
          .replace(/#Server_Cert#/g, host.ssl.cert)
          .replace(/#Server_CertKey#/g, host.ssl.key)
          .replace(/#Port_Apache#/g, host.port.apache)
          .replace(/#Port_Apache_SSL#/g, host.port.apache_ssl)
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

        if (addApachePort) {
          atmpl = atmpl.replace(/#Listen_Port_Apache#/g, host.port.apache)
        } else {
          atmpl = atmpl
            .replace('Listen #Listen_Port_Apache#\n', '')
            .replace('NameVirtualHost *:#Listen_Port_Apache#\n', '')
        }

        if (addApachePortSSL) {
          atmpl = atmpl.replace(/#Listen_Port_Apache_SSL#/g, host.port.apache_ssl)
        } else {
          atmpl = atmpl
            .replace('Listen #Listen_Port_Apache_SSL#\n', '')
            .replace('NameVirtualHost *:#Listen_Port_Apache_SSL#\n', '')
        }

        writeFileSync(avhost, atmpl)

        let rewrite = host.nginx.rewrite.trim()
        writeFileSync(join(rewritepath, `${hostname}.conf`), rewrite)
        if (chmod) {
          this.#setDirRole(host.root)
        }
        resolve(true)
      } catch (e) {
        reject(e)
      }
    })
  }

  #hostAlias(item) {
    let alias = item.alias
      ? item.alias.split('\n').filter((n) => {
          return n && n.length > 0
        })
      : []
    return [item.name, ...alias].join(' ')
  }

  _initHost(list) {
    return new Promise((resolve, reject) => {
      let host = ''
      for (let item of list) {
        let alias = this.#hostAlias(item)
        host += `127.0.0.1     ${alias}\n`
      }
      const filePath = '/private/etc/hosts'
      if (!existsSync(filePath)) {
        reject(new Error(I18nT('fork.hostsFileNoFound')))
        return
      }
      let content = readFileSync(filePath, 'utf-8')
      let x = content.match(/(#X-HOSTS-BEGIN#)([\s\S]*?)(#X-HOSTS-END#)/g)
      if (x && x[0]) {
        x = x[0]
        content = content.replace(x, '')
      }
      if (host) {
        x = `#X-HOSTS-BEGIN#\n${host}#X-HOSTS-END#`
      } else {
        x = ''
      }
      content = content.trim()
      content += `\n${x}`
      writeFileSync(filePath, content.trim())
      resolve(true)
    })
  }

  githubFix() {
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
    Promise.all(all).then((arr) => {
      console.log(arr)
      const list = ['#GITHUB-HOSTS-BEGIN#']
      arr.forEach((ips, i) => {
        const host = hosts[i]
        ips.forEach((ip) => {
          list.push(`${ip}  ${host}`)
        })
      })
      list.push('#GITHUB-HOSTS-END#')

      Utils.readFileAsync('/private/etc/hosts')
        .then((content) => {
          let x = content.match(/(#GITHUB-HOSTS-BEGIN#)([\s\S]*?)(#GITHUB-HOSTS-END#)/g)
          if (x && x[0]) {
            x = x[0]
            content = content.replace(x, '')
          }
          content = content.trim()
          content += `\n${list.join('\n')}`
          Utils.writeFileAsync('/private/etc/hosts', content.trim())
            .then(() => {
              process.send({
                command: this.ipcCommand,
                key: this.ipcCommandKey,
                info: {
                  code: 0,
                  msg: 'SUCCESS'
                }
              })
            })
            .catch(() => {
              process.send({
                command: this.ipcCommand,
                key: this.ipcCommandKey,
                info: {
                  code: 1,
                  msg: I18nT('fork.hostsWriteFail')
                }
              })
            })
        })
        .catch(() => {
          process.send({
            command: this.ipcCommand,
            key: this.ipcCommandKey,
            info: {
              code: 1,
              msg: I18nT('fork.hostsReadFail')
            }
          })
        })
    })
  }

  _fixHostsRole() {
    let access = false
    try {
      accessSync('/private/etc/hosts', constants.R_OK | constants.W_OK)
      access = true
      console.log('可以读写')
    } catch (err) {
      console.error('无权访问')
    }
    if (!access) {
      const password = global.Server.Password
      try {
        execSync(`echo '${password}' | sudo -S chmod 777 /private/etc`)
        execSync(`echo '${password}' | sudo -S chmod 777 /private/etc/hosts`)
      } catch (e) {}
    }
  }

  doFixHostsRole() {
    this._fixHostsRole()
    process.send({
      command: this.ipcCommand,
      key: this.ipcCommandKey,
      info: {
        code: 0,
        msg: 'SUCCESS'
      }
    })
  }

  writeHosts(write = true) {
    this._fixHostsRole()
    if (write) {
      let hostfile = join(global.Server.BaseDir, 'host.json')
      if (!existsSync(hostfile)) {
        process.send({
          command: this.ipcCommand,
          key: this.ipcCommandKey,
          info: {
            code: 0,
            msg: 'SUCCESS'
          }
        })
        return
      }
      let json = readFileSync(hostfile, 'utf-8')
      json = JSON.parse(json)
      this._initHost(json).then()
    } else {
      let hosts = readFileSync('/private/etc/hosts', 'utf-8').toString()
      let x = hosts.match(/(#X-HOSTS-BEGIN#)([\s\S]*?)(#X-HOSTS-END#)/g)
      if (x) {
        hosts = hosts.replace(x[0], '')
        writeFileSync('/private/etc/hosts', hosts.trim())
      }
    }
    process.send({
      command: this.ipcCommand,
      key: this.ipcCommandKey,
      info: {
        code: 0,
        msg: 'SUCCESS'
      }
    })
  }
}
module.exports = HostManager
