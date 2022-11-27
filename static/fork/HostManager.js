const { join, dirname } = require('path')
const existsSync = require('fs').existsSync
const readFileSync = require('fs').readFileSync
const writeFileSync = require('fs').writeFileSync
const unlinkSync = require('fs').unlinkSync
const { execSync } = require('child_process')
const Utils = require('./Utils')
const dns = require('dns')
const util = require('util')

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
      Utils.writeFileAsync(hostfile, JSON.stringify([]))
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
      try {
        host = JSON.parse(json)
      } catch (e) {}
      process.send({
        command: this.ipcCommand,
        key: this.ipcCommandKey,
        info: {
          code: 0,
          msg: 'SUCCESS',
          hosts: host
        }
      })
    })
  }

  handleHost(host, flag, old) {
    console.log('handleHost: ', host, flag, old)
    let hostfile = join(global.Server.BaseDir, 'host.json')
    let hostList = []
    if (existsSync(hostfile)) {
      try {
        hostList = JSON.parse(readFileSync(hostfile, 'utf-8'))
      } catch (e) {
        console.log(e)
      }
    }
    switch (flag) {
      case 'add':
        this._addVhost(host)
          .then(() => {
            console.log('hostfile: ', hostfile)
            hostList.unshift(host)
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
          })
          .catch((err) => {
            console.log(err)
            process.send({
              command: this.ipcCommand,
              key: this.ipcCommandKey,
              info: {
                code: 1,
                msg: err
              }
            })
          })
        break
      case 'del':
        this._delVhost(host)
          .then(() => {
            let index = -1
            hostList.some((h, i) => {
              if (h.id === host.id) {
                index = i
                return true
              }
              return false
            })
            if (index >= 0) {
              hostList.splice(index, 1)
            }
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
          })
          .catch((err) => {
            process.send({
              command: this.ipcCommand,
              key: this.ipcCommandKey,
              info: {
                code: 1,
                msg: err
              }
            })
          })
        break
      case 'edit':
        this._delVhost(old)
          .then(() => {
            return this._addVhost(host)
          })
          .then(() => {
            let index = -1
            hostList.some((h, i) => {
              if (h.id === old.id) {
                index = i
                return true
              }
              return false
            })
            if (index >= 0) {
              hostList[index] = host
            }
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
          })
          .catch((err) => {
            process.send({
              command: this.ipcCommand,
              key: this.ipcCommandKey,
              info: {
                code: 1,
                msg: err
              }
            })
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
    const arr = dir.split('/').filter((d) => {
      return d.trim().length > 0
    })
    if (arr.length <= 2) {
      return
    }
    try {
      if (existsSync(dir)) {
        if (depth === 0) {
          execSync(`echo '${global.Server.Password}' | sudo -S chmod -R 755 ${dir}`)
        } else {
          execSync(`echo '${global.Server.Password}' | sudo -S chmod 755 ${dir}`)
        }
        const parentDir = dirname(dir)
        this.#setDirRole(parentDir, depth + 1)
      }
    } catch (e) {
      console.log('setDirRole err: ', e)
    }
  }

  _addVhost(host) {
    return new Promise((resolve, reject) => {
      try {
        let nginxvpath = join(global.Server.BaseDir, 'vhost/nginx')
        let apachevpath = join(global.Server.BaseDir, 'vhost/apache')
        let rewritepath = join(global.Server.BaseDir, 'vhost/rewrite')
        let logpath = join(global.Server.BaseDir, 'vhost/logs')
        Utils.createFolder(nginxvpath)
        Utils.createFolder(apachevpath)
        Utils.createFolder(rewritepath)
        Utils.createFolder(logpath)

        let nginxtmpl = join(global.Server.Static, 'tmpl/nginx.vhost')
        let apachetmpl = join(global.Server.Static, 'tmpl/apache.vhost')

        if (host.useSSL) {
          nginxtmpl = join(global.Server.Static, 'tmpl/nginxSSL.vhost')
          apachetmpl = join(global.Server.Static, 'tmpl/apacheSSL.vhost')
        }

        let hostname = host.name
        let nvhost = join(nginxvpath, `${hostname}.conf`)
        let avhost = join(apachevpath, `${hostname}.conf`)
        let hostalias = this.#hostAlias(host)
        let ntmpl = readFileSync(nginxtmpl, 'utf-8')
          .replace(/#Server_Alias#/g, hostalias)
          .replace(/#Server_Root#/g, host.root)
          .replace(/#Rewrite_Path#/g, rewritepath)
          .replace(/#Server_Name#/g, hostname)
          .replace(/#Log_Path#/g, logpath)
          .replace(/#Server_Cert#/g, host.ssl.cert)
          .replace(/#Server_CertKey#/g, host.ssl.key)
          .replace(/#Port_Nginx#/g, host.port.nginx)
          .replace(/#Port_Nginx_SSL#/g, host.port.nginx_ssl)
        writeFileSync(nvhost, ntmpl)

        let atmpl = readFileSync(apachetmpl, 'utf-8')
          .replace(/#Server_Alias#/g, hostalias)
          .replace(/#Server_Root#/g, host.root)
          .replace(/#Rewrite_Path#/g, rewritepath)
          .replace(/#Server_Name#/g, hostname)
          .replace(/#Log_Path#/g, logpath)
          .replace(/#Server_Cert#/g, host.ssl.cert)
          .replace(/#Server_CertKey#/g, host.ssl.key)
          .replace(/#Port_Apache#/g, host.port.apache)
          .replace(/#Port_Apache_SSL#/g, host.port.apache_ssl)

        writeFileSync(avhost, atmpl)

        let rewrite = host.nginx.rewrite.trim()
        writeFileSync(join(rewritepath, `${hostname}.conf`), rewrite)
        this.#setDirRole(host.root)
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
      if (list.length === 0) {
        resolve(true)
        return
      }
      let host = ''
      for (let item of list) {
        let alias = this.#hostAlias(item)
        host += `127.0.0.1     ${alias}\n`
      }
      const filePath = '/private/etc/hosts'
      if (!existsSync(filePath)) {
        reject(new Error('hosts文件不存在'))
        return
      }
      console.log('_initHost host: ', host)
      let content = readFileSync(filePath, 'utf-8')
      console.log('content 000: ', content)
      let x = content.match(/(#X-HOSTS-BEGIN#)([\s\S]*?)(#X-HOSTS-END#)/g)
      if (x && x[0]) {
        x = x[0]
        content = content.replace(x, '')
      }
      x = `#X-HOSTS-BEGIN#\n${host}#X-HOSTS-END#`
      content = content.trim()
      content += `\n${x}`
      console.log('content: ', content)
      writeFileSync(filePath, content)
      resolve(true)
    })
  }

  githubFix() {
    const hosts = [
      'github.com',
      'github.global.ssl.fastly.net',
      'assets-cdn.github.com',
      'raw.githubusercontent.com',
      'macphpstudy.com'
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
          Utils.writeFileAsync('/private/etc/hosts', content)
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
                  msg: '/private/etc/hosts文件写入失败'
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
              msg: '/private/etc/hosts文件读取失败'
            }
          })
        })
    })
  }

  writeHosts(write = true) {
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
      console.log('writeHosts json: ', json)
      this._initHost(json).then()
    } else {
      let hosts = readFileSync('/private/etc/hosts', 'utf-8')
      let x = hosts.match(/(#X-HOSTS-BEGIN#)([\s\S]*?)(#X-HOSTS-END#)/g)
      if (x) {
        hosts = hosts.replace(x[0], '')
        writeFileSync('/private/etc/hosts', hosts)
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
