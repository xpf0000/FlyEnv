import { dirname, join, resolve as pathResolve } from 'path'
import { existsSync } from 'fs'
import { Base } from './Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { AppHost, OnlineVersionItem, SoftInstalled } from '@shared/app'
import { execPromiseRoot, execPromiseRootWhenNeed } from '@shared/Exec'
import {
  brewInfoJson,
  brewSearch,
  hostAlias,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort
} from '../Fn'
import { mkdirp, readFile, writeFile } from 'fs-extra'
import { XMLParser, XMLBuilder } from 'fast-xml-parser'
import TaskQueue from '../TaskQueue'

class Tomcat extends Base {
  constructor() {
    super()
    this.type = 'tomcat'
  }

  fetchAllOnLineVersion() {
    console.log('Tomcat fetchAllOnLineVersion !!!')
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('tomcat')
        const dict: any = {}
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `static-tomcat-${a.version}`, 'bin/catalina.sh')
          const zip = join(global.Server.Cache!, `static-tomcat-${a.version}.tar.gz`)
          a.appDir = join(global.Server.AppDir!, `static-tomcat-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          dict[`tomcat-${a.version}`] = a
        })
        resolve(dict)
      } catch (e) {
        resolve({})
      }
    })
  }

  async #fixVHost(version: SoftInstalled) {
    const hostAll: Array<AppHost> = []
    const hostfile = join(global.Server.BaseDir!, 'host.json')
    const vhostDir = join(global.Server.BaseDir!, 'vhost/tomcat')
    try {
      await mkdirp(vhostDir)
      if (existsSync(hostfile)) {
        const json = await readFile(hostfile, 'utf-8')
        const jsonArr = JSON.parse(json)
        hostAll.push(...jsonArr)
      }
    } catch (e) {}

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      attributesGroupName: '',
      allowBooleanAttributes: true
    })
    const builder = new XMLBuilder({
      attributeNamePrefix: '',
      attributesGroupName: '',
      ignoreAttributes: false,
      suppressBooleanAttributes: false,
      format: true
    })

    const configFile = join(version.path, 'conf/server.xml')
    const serverContent = await readFile(configFile, 'utf-8')

    const defaultFile = join(version.path, 'conf/server.xml.default')
    if (!existsSync(defaultFile)) {
      await writeFile(defaultFile, serverContent)
    }

    const serverXML = parser.parse(serverContent)

    const handlePort = (host: AppHost) => {
      const port = host?.port?.tomcat ?? 80
      if (!serverXML.Server.Service.Connector) {
        const xml = `<Connector appFlag="PhpWebStudy" port="${port}" protocol="HTTP/1.1" connectionTimeout="60000"/>`
        const xmlObj = parser.parse(xml)
        serverXML.Server.Service.Connector = xmlObj.Connector
      } else if (!Array.isArray(serverXML.Server.Service.Connector)) {
        if (`${serverXML.Server.Service.Connector.port}` !== `${port}`) {
          serverXML.Server.Service.Connector = [serverXML.Server.Service.Connector]
          const xml = `<Connector appFlag="PhpWebStudy" port="${port}" protocol="HTTP/1.1" connectionTimeout="60000"/>`
          const xmlObj = parser.parse(xml)
          serverXML.Server.Service.Connector.push(xmlObj.Connector)
        }
      }
      if (host.useSSL && host.ssl.cert && host.ssl.key) {
        const port = host?.port?.tomcat_ssl ?? 443
        if (!Array.isArray(serverXML.Server.Service.Connector)) {
          serverXML.Server.Service.Connector = [serverXML.Server.Service.Connector]
        }
        console.log('serverXML.Server.Service.Connector: ', serverXML.Server.Service.Connector)
        const find: any = serverXML.Server.Service.Connector.find(
          (c: any) => `${c.port}` === `${port}`
        )
        console.log('find: ', find)
        if (!find) {
          const arr = [
            `<Connector appFlag="PhpWebStudy" port="${port}" protocol="org.apache.coyote.http11.Http11NioProtocol"
                   maxThreads="150" SSLEnabled="true" scheme="https">`,
            `<SSLHostConfig sslProtocol="TLS" certificateVerification="false">
                <Certificate certificateFile="${host.ssl.cert}"
                             certificateKeyFile="${host.ssl.key}"
                             type="RSA"/>
            </SSLHostConfig>`
          ]
          hostAlias(host).forEach((h) => {
            arr.push(`<SSLHostConfig appFlag="PhpWebStudy" hostName="${h}" sslProtocol="TLS" certificateVerification="false">
                <Certificate certificateFile="${host.ssl.cert}"
                             certificateKeyFile="${host.ssl.key}"
                             type="RSA"/>
            </SSLHostConfig>`)
          })
          arr.push(`</Connector>`)
          const xml = parser.parse(arr.join('\n'))
          serverXML.Server.Service.Connector.push(xml.Connector)
        } else {
          const hostConfig = find.SSLHostConfig
          if (!hostConfig) {
            const arr = [
              `<Connector appFlag="PhpWebStudy" port="${port}" protocol="org.apache.coyote.http11.Http11NioProtocol"
                   maxThreads="150" SSLEnabled="true" scheme="https">`,
              `<SSLHostConfig sslProtocol="TLS" certificateVerification="false">
                <Certificate certificateFile="${host.ssl.cert}"
                             certificateKeyFile="${host.ssl.key}"
                             type="RSA"/>
            </SSLHostConfig>`
            ]
            hostAlias(host).forEach((h) => {
              arr.push(`<SSLHostConfig appFlag="PhpWebStudy" hostName="${h}" sslProtocol="TLS" certificateVerification="false">
                <Certificate certificateFile="${host.ssl.cert}"
                             certificateKeyFile="${host.ssl.key}"
                             type="RSA"/>
            </SSLHostConfig>`)
            })
            arr.push(`</Connector>`)
            const xml = parser.parse(arr.join('\n'))
            find.SSLHostConfig = xml.Connector.SSLHostConfig
          } else {
            hostAlias(host).forEach((h) => {
              const findHost = hostConfig.find((c: any) => c.hostName === h)
              if (!findHost) {
                const str = `<SSLHostConfig appFlag="PhpWebStudy" hostName="${h}" sslProtocol="TLS" certificateVerification="false">
                <Certificate certificateFile="${host.ssl.cert}"
                             certificateKeyFile="${host.ssl.key}"
                             type="RSA"/>
            </SSLHostConfig>`
                const xml = parser.parse(str)
                hostConfig.push(xml.SSLHostConfig)
              }
            })
            const defaultConf = hostConfig.find((h: any) => !h?.hostName)
            if (defaultConf) {
              const cert = defaultConf.Certificate.certificateFile
              const key = defaultConf.Certificate.certificateKeyFile
              const base = join(version.path, 'conf')
              if (!existsSync(pathResolve(base, cert)) || !existsSync(pathResolve(base, key))) {
                defaultConf.Certificate.certificateFile = host.ssl.cert
                defaultConf.Certificate.certificateKeyFile = host.ssl.key
              }
            }
          }
        }
      }
    }

    const handleVhost = (host: AppHost) => {
      const logDir = join(global.Server.BaseDir!, 'vhost/logs')
      let hosts = serverXML.Server.Service.Engine.Host
      if (!hosts) {
        const arr: string[] = []
        hostAlias(host).forEach((h) => {
          arr.push(`<Host name="${h}" appBase="${host.root}" appFlag="PhpWebStudy"
                  unpackWARs="true" autoDeploy="true">
                <Context path="" docBase=""></Context>
                <Valve className="org.apache.catalina.valves.AccessLogValve" directory="${logDir}"
                       prefix="${host.name}-tomcat_access_log" suffix=".log"
                       pattern="%h %l %u %t &quot;%r&quot; %s %b"/>
            </Host>`)
        })
        const xml = parser.parse(arr.join('\n'))
        serverXML.Server.Service.Engine.Host = xml.Host
      } else {
        if (!Array.isArray(hosts)) {
          serverXML.Server.Service.Engine.Host = [serverXML.Server.Service.Engine.Host]
          hosts = serverXML.Server.Service.Engine.Host
        }
        hostAlias(host).forEach((h) => {
          const findHost = hosts.find((s: any) => s.name === h)
          if (findHost) {
            findHost.appBase = host.root
          } else {
            const str = `<Host name="${h}" appBase="${host.root}" appFlag="PhpWebStudy"
                  unpackWARs="true" autoDeploy="true">
                  <Context path="" docBase=""></Context>
                <Valve className="org.apache.catalina.valves.AccessLogValve" directory="${logDir}"
                       prefix="${host.name}-tomcat_access_log" suffix=".log"
                       pattern="%h %l %u %t &quot;%r&quot; %s %b"/>
            </Host>`
            const xml = parser.parse(str)
            hosts.push(xml.Host)
          }
        })
      }
    }

    const cleanPort = (allPort: Set<number>) => {
      if (!serverXML.Server.Service.Connector) {
        return
      }
      if (!Array.isArray(serverXML.Server.Service.Connector)) {
        return
      }
      const allApp = serverXML.Server.Service.Connector.filter(
        (c: any) => c.appFlag === 'PhpWebStudy'
      )
      for (const c of allApp) {
        const port = Number(c.port)
        if (!allPort.has(port)) {
          const index = serverXML.Server.Service.Connector.indexOf(c)
          if (index >= 0) {
            serverXML.Server.Service.Connector.splice(index, 1)
          }
        }
      }
    }

    const cleanVhost = (allName: Set<string>) => {
      if (Array.isArray(serverXML.Server.Service.Engine.Host)) {
        const allHost = serverXML.Server.Service.Engine.Host.filter(
          (c: any) => c.appFlag === 'PhpWebStudy'
        )
        for (const c of allHost) {
          const name = c.name
          if (!allName.has(name)) {
            const index = serverXML.Server.Service.Engine.Host.indexOf(c)
            if (index >= 0) {
              serverXML.Server.Service.Engine.Host.splice(index, 1)
            }
          }
        }
      }
      if (Array.isArray(serverXML.Server.Service.Connector)) {
        for (const Connector of serverXML.Server.Service.Connector) {
          if (Connector?.appFlag !== 'PhpWebStudy') {
            continue
          }
          const SSLHostConfig = Connector.SSLHostConfig
          if (!SSLHostConfig || !Array.isArray(SSLHostConfig)) {
            continue
          }
          for (const c of SSLHostConfig) {
            if (c?.appFlag !== 'PhpWebStudy') {
              continue
            }
            const name = c.hostName
            if (!allName.has(name)) {
              const index = SSLHostConfig.indexOf(c)
              if (index >= 0) {
                SSLHostConfig.splice(index, 1)
              }
            }
          }
        }
      }
    }

    const allPort: Set<number> = new Set()
    const allName: Set<string> = new Set()

    for (const host of hostAll) {
      handlePort(host)
      handleVhost(host)
      allPort.add(host.port?.tomcat ?? 80)
      if (host.useSSL) {
        allPort.add(host.port?.tomcat_ssl ?? 443)
      }
      hostAlias(host).forEach((n) => allName.add(n))
    }

    cleanPort(allPort)
    cleanVhost(allName)

    const content = builder.build(serverXML)
    await writeFile(configFile, content)
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject) => {
      const bin = version.bin
      await this.#fixVHost(version)
      if (existsSync(this.pidPath)) {
        await execPromiseRoot(['rm', '-rf', this.pidPath])
      }
      try {
        await execPromiseRootWhenNeed('zsh', [bin, `--APPFLAG=${global.Server.BaseDir!}`])
        resolve(0)
      } catch (e: any) {
        reject(e)
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.tomcat?.dirs ?? [], 'catalina.sh', 'tomcat')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all: any[] = []
          for (const item of versions) {
            const bin = join(dirname(item.bin), 'version.sh')
            await execPromiseRoot(['chmod', '777', bin])
            const command = `zsh ${bin}`
            const reg = /(Server version: Apache Tomcat\/)(.*?)(\n)/g
            all.push(TaskQueue.run(versionBinVersion, command, reg))
          }
          return Promise.all(all)
        })
        .then((list) => {
          list.forEach((v, i) => {
            const { error, version } = v
            const num = version
              ? Number(versionFixed(version).split('.').slice(0, 2).join(''))
              : null
            Object.assign(versions[i], {
              bin: join(dirname(versions[i].bin), 'startup.sh'),
              version: version,
              num,
              enable: version !== null,
              error
            })
          })
          resolve(versionSort(versions))
        })
        .catch(() => {
          resolve([])
        })
    })
  }

  brewinfo() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        let all: Array<string> = []
        const cammand = 'brew search -q --formula "/^tomcat((@[\\d\\.]+)?)$/"'
        all = await brewSearch(all, cammand)
        const info = await brewInfoJson(all)
        resolve(info)
      } catch (e) {
        reject(e)
        return
      }
    })
  }

  portinfo() {
    return new ForkPromise(async (resolve) => {
      resolve({})
    })
  }
}
export default new Tomcat()
