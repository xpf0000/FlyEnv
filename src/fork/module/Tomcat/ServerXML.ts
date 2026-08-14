import type { AppHost, SoftInstalled } from '@shared/app'
import { join } from 'node:path'
import { XMLBuilder, XMLParser } from 'fast-xml-parser'
import { existsSync, mkdirp, readFile, writeFile } from '../../Fn'
import { fetchHostList } from '../Host/HostFile'
import { updateAutoSSL } from '../Host/Host'
import {
  reconcileTomcatSiteFiles,
  restoreTomcatSiteFiles,
  snapshotTomcatSiteFiles,
  type TomcatSiteFilesSnapshot,
  tomcatHostName,
  tomcatSiteConfig,
  type TomcatSiteHost
} from './Site'

type XMLItem = Record<string, any>

const asArray = <T>(value: T | T[] | undefined): T[] => {
  return value === undefined ? [] : Array.isArray(value) ? value : [value]
}

const setArrayOrDelete = (object: XMLItem, key: string, values: XMLItem[]) => {
  if (values.length === 0) {
    delete object[key]
  } else {
    object[key] = values
  }
}

const isFlyEnv = (value: XMLItem | undefined) => value?.appFlag === 'FlyEnv'
const isSSLConnector = (connector: XMLItem) => connector.SSLEnabled === 'true'
const isRewriteValve = (valve: XMLItem) =>
  valve.className === 'org.apache.catalina.valves.rewrite.RewriteValve'

const isEmptyContext = (context: XMLItem) =>
  context.path === '' && context.docBase === '' && Object.keys(context).length === 2

const certificate = (cert: string, key: string): XMLItem => ({
  certificateFile: cert,
  certificateKeyFile: key,
  type: 'RSA'
})

const sslHostConfig = (hostName: string, cert: string, key: string): XMLItem => ({
  appFlag: 'FlyEnv',
  hostName,
  sslProtocol: 'TLS',
  certificateVerification: 'false',
  Certificate: certificate(cert, key)
})

const accessLogValve = (host: TomcatSiteHost): XMLItem => ({
  appFlag: 'FlyEnv',
  className: 'org.apache.catalina.valves.AccessLogValve',
  directory: join(global.Server.BaseDir!, 'vhost/logs'),
  prefix: `${host.name}-tomcat_access_log`,
  suffix: '.log',
  pattern: '%h %l %u %t &quot;%r&quot; %s %b'
})

const addOrUpdateHost = (hosts: XMLItem[], name: string, host: TomcatSiteHost) => {
  let item = hosts.find((candidate) => candidate.name === name)
  if (item && !isFlyEnv(item)) {
    throw new Error(`Tomcat site conflicts with a user-managed Host named ${name}`)
  }
  if (!item) {
    item = {}
    hosts.push(item)
  }
  Object.assign(item, {
    name,
    appBase: host.root,
    appFlag: 'FlyEnv',
    unpackWARs: 'true',
    deployOnStartup: 'true',
    autoDeploy: 'true'
  })

  const contexts = asArray<XMLItem>(item.Context).filter((context) => !isEmptyContext(context))
  const managedPaths = new Set(tomcatSiteConfig(host).contexts.map((context) => context.path))
  const inlineConflict = contexts.find((context) => managedPaths.has(context.path ?? ''))
  if (inlineConflict) {
    throw new Error(
      `Tomcat site has a user-managed inline Context for ${inlineConflict.path ?? ''} on Host ${name}`
    )
  }
  setArrayOrDelete(item, 'Context', contexts)

  const valves = asArray<XMLItem>(item.Valve)
  if (!valves.some((valve) => valve.className === 'org.apache.catalina.valves.AccessLogValve')) {
    valves.push(accessLogValve(host))
  }
  const enabled = tomcatSiteConfig(host).rewrite.enabled
  if (enabled && valves.some((valve) => !isFlyEnv(valve) && isRewriteValve(valve))) {
    throw new Error(`Tomcat site has a user-managed RewriteValve on Host ${name}`)
  }
  const retained = valves.filter((valve) => !(isFlyEnv(valve) && isRewriteValve(valve)))
  if (enabled) {
    retained.push({
      appFlag: 'FlyEnv',
      className: 'org.apache.catalina.valves.rewrite.RewriteValve'
    })
  }
  setArrayOrDelete(item, 'Valve', retained)
}

const desiredTLS = (hosts: TomcatSiteHost[]) => {
  const byPort = new Map<number, TomcatSiteHost[]>()
  for (const host of hosts) {
    if (!host.useSSL || !host.ssl?.cert || !host.ssl?.key) {
      continue
    }
    const port = host.port?.tomcat_ssl ?? 443
    byPort.set(port, [...(byPort.get(port) ?? []), host])
  }
  return byPort
}

const reconcileSSLConfigs = (connector: XMLItem, group: TomcatSiteHost[]) => {
  const desired = new Map<string, { cert: string; key: string }>()
  const primary = [...group].sort((a, b) => a.name.localeCompare(b.name))[0]
  desired.set('_default_', { cert: primary.ssl.cert, key: primary.ssl.key })
  for (const host of group) {
    desired.set(tomcatHostName(host), { cert: host.ssl.cert, key: host.ssl.key })
  }

  const existing = asArray<XMLItem>(connector.SSLHostConfig)
  const desiredNames = new Set(desired.keys())
  const manualConflict = existing.find(
    (config) => !isFlyEnv(config) && desiredNames.has(config.hostName ?? '_default_')
  )
  if (manualConflict) {
    throw new Error(
      `Tomcat site conflicts with a user-managed SSLHostConfig: ${manualConflict.hostName ?? '_default_'}`
    )
  }
  const retained = existing.filter((config) => !isFlyEnv(config))
  for (const [name, paths] of desired) {
    const config = existing.find((candidate) => isFlyEnv(candidate) && candidate.hostName === name)
    if (config) {
      Object.assign(config, sslHostConfig(name, paths.cert, paths.key))
      retained.push(config)
    } else {
      retained.push(sslHostConfig(name, paths.cert, paths.key))
    }
  }
  setArrayOrDelete(connector, 'SSLHostConfig', retained)
}

const reconcileConnectors = (
  service: XMLItem,
  hosts: TomcatSiteHost[],
  sslHosts: TomcatSiteHost[] = hosts
) => {
  const connectors = asArray<XMLItem>(service.Connector)
  const tlsGroups = desiredTLS(sslHosts)
  const httpPorts = new Set(hosts.map((host) => host.port?.tomcat ?? 80))

  for (const [port] of tlsGroups) {
    if (httpPorts.has(port)) {
      throw new Error(`Tomcat site cannot use the same HTTP and HTTPS Connector port: ${port}`)
    }
    const existing = connectors.find((connector) => `${connector.port}` === `${port}`)
    if (existing && (!isFlyEnv(existing) || !isSSLConnector(existing))) {
      throw new Error(`Tomcat site conflicts with a user-managed HTTPS Connector on port ${port}`)
    }
  }

  for (const port of httpPorts) {
    const existing = connectors.find((connector) => `${connector.port}` === `${port}`)
    if (existing && isSSLConnector(existing)) {
      throw new Error(`Tomcat site conflicts with an HTTPS Connector on HTTP port ${port}`)
    }
    if (!existing) {
      connectors.push({
        appFlag: 'FlyEnv',
        port: String(port),
        protocol: 'HTTP/1.1',
        connectionTimeout: '60000'
      })
    }
  }

  for (const [port, group] of tlsGroups) {
    let connector = connectors.find((candidate) => `${candidate.port}` === `${port}`)
    if (!connector) {
      connector = {}
      connectors.push(connector)
    }
    Object.assign(connector, {
      appFlag: 'FlyEnv',
      port: String(port),
      protocol: 'org.apache.coyote.http11.Http11NioProtocol',
      maxThreads: '150',
      SSLEnabled: 'true',
      scheme: 'https',
      secure: 'true',
      defaultSSLHostConfigName: '_default_'
    })
    reconcileSSLConfigs(connector, group)
  }

  const retained = connectors.filter((connector) => {
    if (!isFlyEnv(connector)) {
      return true
    }
    const port = Number(connector.port)
    if (isSSLConnector(connector)) {
      if (tlsGroups.has(port)) {
        return true
      }
      const configs = asArray<XMLItem>(connector.SSLHostConfig)
      const manual = configs.filter((config) => !isFlyEnv(config))
      if (manual.length > 0) {
        setArrayOrDelete(connector, 'SSLHostConfig', manual)
        return true
      }
      return false
    }
    return httpPorts.has(port)
  })
  setArrayOrDelete(service, 'Connector', retained)
}

export const makeTomcatServerXML = (
  cnfDir: string,
  serverContent: string,
  hostAll: AppHost[],
  sslHosts?: TomcatSiteHost[]
) => {
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
  const document = parser.parse(serverContent) as XMLItem
  const server = document.Server as XMLItem
  const service = server.Service as XMLItem
  let engine = service.Engine as XMLItem | string | undefined
  if (!engine || typeof engine !== 'object') {
    engine = {}
    service.Engine = engine
  }
  const hosts = asArray<XMLItem>(engine.Host)
  const tomcatHosts = hostAll.filter((host) => host.type === 'tomcat') as TomcatSiteHost[]
  const desiredNames = new Set<string>()

  for (const host of tomcatHosts) {
    const name = tomcatHostName(host)
    if (!name) continue
    desiredNames.add(name)
    addOrUpdateHost(hosts, name, host)
  }
  setArrayOrDelete(
    engine,
    'Host',
    hosts.filter((host) => !isFlyEnv(host) || desiredNames.has(host.name))
  )
  reconcileConnectors(service, tomcatHosts, sslHosts ?? tomcatHosts)
  return builder.build(document)
}

export const reconcileTomcatBase = async (catalinaBase: string, suppliedHosts?: AppHost[]) => {
  const hosts = suppliedHosts ?? (await fetchHostList())
  const tomcatHosts = hosts.filter((host) => host.type === 'tomcat') as TomcatSiteHost[]
  for (const host of tomcatHosts) {
    if (host.useSSL && host.autoSSL) {
      await updateAutoSSL(host, host)
    }
  }
  const sslHosts = tomcatHosts.filter(
    (host) => !host.useSSL || (existsSync(host.ssl?.cert) && existsSync(host.ssl?.key))
  )
  const configFile = join(catalinaBase, 'conf', 'server.xml')
  let serverContent = await readFile(configFile, 'utf-8')
  serverContent = serverContent.replaceAll('PhpWebStudy', 'FlyEnv')
  const next = makeTomcatServerXML(join(catalinaBase, 'conf'), serverContent, tomcatHosts, sslHosts)
  await reconcileTomcatSiteFiles(catalinaBase, tomcatHosts)
  await writeFile(configFile, next)
}

export type TomcatBaseSnapshot = {
  serverXML: string
  siteFiles: TomcatSiteFilesSnapshot
}

export const snapshotTomcatBase = async (catalinaBase: string): Promise<TomcatBaseSnapshot> => ({
  serverXML: await readFile(join(catalinaBase, 'conf', 'server.xml'), 'utf-8'),
  siteFiles: await snapshotTomcatSiteFiles(catalinaBase)
})

export const restoreTomcatBase = async (catalinaBase: string, snapshot: TomcatBaseSnapshot) => {
  await restoreTomcatSiteFiles(catalinaBase, snapshot.siteFiles)
  await writeFile(join(catalinaBase, 'conf', 'server.xml'), snapshot.serverXML)
}

export const makeGlobalTomcatServerXML = async (version: SoftInstalled) => {
  await mkdirp(join(version.path, 'conf'))
  await reconcileTomcatBase(version.path)
}
