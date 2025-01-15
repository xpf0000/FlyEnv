import type { AppHost, SoftInstalled } from '@shared/app'
import { basename, dirname, join, resolve as pathResolve } from 'path'
import { copyFile, existsSync, mkdirp, readFile, writeFile, realpathSync } from 'fs-extra'
import { execPromise, hostAlias } from '../../Fn'
import { XMLBuilder, XMLParser } from 'fast-xml-parser'
import { ServiceItem } from './ServiceItem'
import { ForkPromise } from '@shared/ForkPromise'
import { execPromiseRoot } from '@shared/Exec'
import { ProcessPidListByPid } from '@shared/Process'
import { fetchHostList } from '../host/HostFile'

export const makeTomcatServerXML = (cnfDir: string, serverContent: string, hostAll: AppHost[]) => {
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
            if (!existsSync(pathResolve(cnfDir, cert)) || !existsSync(pathResolve(cnfDir, key))) {
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
    const dels: any[] = []
    for (const c of allApp) {
      const port = Number(c.port)
      if (!allPort.has(port)) {
        dels.push(c)
      }
    }
    for (const c of dels) {
      const index = serverXML.Server.Service.Connector.indexOf(c)
      if (index >= 0) {
        serverXML.Server.Service.Connector.splice(index, 1)
      }
    }
  }

  const cleanVhost = (allName: Set<string>) => {
    if (Array.isArray(serverXML.Server.Service.Engine.Host)) {
      const allHost = serverXML.Server.Service.Engine.Host.filter(
        (c: any) => c.appFlag === 'PhpWebStudy'
      )
      const dels: any[] = []
      for (const c of allHost) {
        const name = c.name
        if (!allName.has(name)) {
          dels.push(c)
        }
      }
      for (const c of dels) {
        const index = serverXML.Server.Service.Engine.Host.indexOf(c)
        if (index >= 0) {
          serverXML.Server.Service.Engine.Host.splice(index, 1)
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
        const dels: any[] = []
        for (const c of SSLHostConfig) {
          if (c?.appFlag !== 'PhpWebStudy') {
            continue
          }
          const name = c.hostName
          console.log('SSLHostConfig c: ', c, name, allName.has(name), SSLHostConfig.indexOf(c))
          if (!allName.has(name)) {
            dels.push(c)
          }
        }
        for (const c of dels) {
          const index = SSLHostConfig.indexOf(c)
          if (index >= 0) {
            SSLHostConfig.splice(index, 1)
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

  return builder.build(serverXML)
}

export const makeGlobalTomcatServerXML = async (version: SoftInstalled) => {
  let hostAll: Array<AppHost> = []
  try {
    hostAll = await fetchHostList()
  } catch (e) {}
  hostAll = hostAll.filter((h) => h.type === 'tomcat')

  const vhostDir = join(global.Server.BaseDir!, 'vhost/tomcat')
  await mkdirp(vhostDir)

  const configFile = join(version.path, 'conf/server.xml')
  const serverContent = await readFile(configFile, 'utf-8')

  const defaultFile = join(version.path, 'conf/server.xml.default')
  if (!existsSync(defaultFile)) {
    await writeFile(defaultFile, serverContent)
  }

  const content = makeTomcatServerXML(join(version.path, 'conf'), serverContent, hostAll)
  await writeFile(configFile, content)
}

export const makeCustomTomcatServerXML = async (host: AppHost) => {
  const hostAll: Array<AppHost> = [host]

  const tomcatDir = host?.tomcatDir ?? ''
  if (!tomcatDir || !existsSync(tomcatDir)) {
    return
  }

  const logDir = join(global.Server.BaseDir!, `tomcat/${host.id}/logs`)
  await mkdirp(logDir)

  const files = [
    'catalina.properties',
    'context.xml',
    'jaspic-providers.xml',
    'jaspic-providers.xsd',
    'tomcat-users.xml',
    'tomcat-users.xsd',
    'logging.properties',
    'web.xml'
  ]
  const versionPath = pathResolve(tomcatDir, '../../conf')
  const vhostPath = join(global.Server.BaseDir!, `tomcat/${host.id}/conf`)
  await mkdirp(vhostPath)
  for (const file of files) {
    const of = join(versionPath, file)
    const nf = join(vhostPath, file)
    if (!existsSync(nf) && existsSync(of)) {
      await copyFile(of, nf)
    }
  }

  const configFile = join(global.Server.BaseDir!, `tomcat/${host.id}/conf/server.xml`)
  let serverContent = ''
  if (existsSync(configFile)) {
    serverContent = await readFile(configFile, 'utf-8')
  } else {
    const configFile = pathResolve(tomcatDir, '../../conf/server.xml')
    serverContent = await readFile(configFile, 'utf-8')
    const defaultFile = pathResolve(tomcatDir, '../../conf/server.xml.default')
    if (!existsSync(defaultFile)) {
      await writeFile(defaultFile, serverContent)
    }
  }

  const content = makeTomcatServerXML(pathResolve(tomcatDir, '../../conf'), serverContent, hostAll)
  await writeFile(configFile, content)
}

export class ServiceItemJavaTomcat extends ServiceItem {
  start(item: AppHost) {
    return new ForkPromise(async (resolve, reject) => {
      if (this.exit) {
        reject(new Error('Exit'))
        return
      }
      this.host = item
      await this.stop()
      await makeCustomTomcatServerXML(item)

      const jdkDir = pathResolve(realpathSync(item.jdkDir!), '../../')
      if (!existsSync(jdkDir)) {
        reject(new Error(`JDK not exists: ${item.jdkDir}`))
        return
      }

      const bin = item.tomcatDir!
      if (!existsSync(bin)) {
        reject(new Error(`Tomcat not exists: ${bin}`))
        return
      }

      const javaDir = join(global.Server.BaseDir!, 'tomcat')
      await mkdirp(javaDir)
      const pid = join(javaDir, `${item.id}.pid`)
      if (existsSync(pid)) {
        try {
          await execPromiseRoot([`rm`, '-rf', pid])
        } catch (e) {}
      }

      const env = {
        JAVA_HOME: jdkDir,
        CATALINA_BASE: join(global.Server.BaseDir!, `tomcat/${item.id}`),
        CATALINA_PID: pid
      }
      const commands: string[] = [
        '#!/bin/zsh',
        `export JAVA_HOME=${env.JAVA_HOME}`,
        `export CATALINA_BASE=${env.CATALINA_BASE}`,
        `export CATALINA_PID=${pid}`,
        `cd "${dirname(bin)}"`,
        `./${basename(bin)}`
      ]

      this.command = commands.join('\n')
      console.log('command: ', this.command)
      const sh = join(global.Server.Cache!, `service-${this.id}.sh`)
      await writeFile(sh, this.command)
      await execPromiseRoot([`chmod`, '777', sh])
      try {
        const res = await execPromise(`${sh}`, { env })
        console.log('start res: ', res)
        const pid = await this.checkPid()
        this.daemon()
        resolve({
          'APP-Service-Start-PID': pid
        })
      } catch (e) {
        console.log('start e: ', e)
        reject(e)
      }
    })
  }
  async checkState() {
    const id = this.host?.id
    if (!id) {
      return []
    }
    const baseDir = join(global.Server.BaseDir!, 'tomcat')
    const pidFile = join(baseDir, `${id}.pid`)
    this.pidFile = pidFile
    if (!existsSync(pidFile)) {
      return []
    }
    const pid = (await readFile(pidFile, 'utf-8')).trim()
    return await ProcessPidListByPid(pid)
  }
}
