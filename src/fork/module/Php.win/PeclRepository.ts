import axios from 'axios'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { extensionHttpGet } from './ExtensionHttp'
import { compatiblePeclArchive } from './PeclWindows'
import type { ExtensionPackage, PhpExtensionProfile } from './WindowsExtensions'
import { compareExtensionVersions, stableExtensionVersion } from './ExtensionSources'
import type { ExtensionPreparation, ExtensionRelease } from './ExtensionSources'

const rest = 'https://pecl.php.net/rest/'
const windows = 'https://downloads.php.net/~windows/pecl/releases/'
const list = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value]
const parser = new XMLParser({ parseTagValue: false })
const parse = (xml: string) => {
  if (xml.length > 4_000_000 || /<!DOCTYPE/i.test(xml) || XMLValidator.validate(xml) !== true)
    throw new Error('The official PECL directory returned invalid XML')
  return parser.parse(xml)
}
const identifier = (name: string) => {
  if (!/^pecl:[a-z][a-z0-9_]*$/.test(name)) throw new Error('Invalid official PECL identifier')
  return name.slice(5)
}

export class PeclRepository {
  private cache = new Map<string, { value: string; expires: number }>()
  constructor(
    private readonly fetch: (url: string) => Promise<string> = async (url) =>
      (await extensionHttpGet(url, { timeout: 30000, maxContentLength: 4_000_000 })).data
  ) {}

  private async read(url: string, refresh = false) {
    const cached = this.cache.get(url)
    if (!refresh && cached && cached.expires > Date.now()) return cached.value
    // Never reuse an expired result after a failed refresh.
    this.cache.delete(url)
    const value = await this.fetch(url)
    if (typeof value !== 'string' || value.length > 4_000_000)
      throw new Error('Invalid official extension directory response')
    if (url.endsWith('.xml')) parse(value)
    if (this.cache.size >= 128) this.cache.delete(this.cache.keys().next().value!)
    this.cache.set(url, { value, expires: Date.now() + 5 * 60_000 })
    return value
  }

  async catalog(query: string, refresh = false): Promise<ExtensionPackage[]> {
    const data = parse(await this.read(rest + 'p/packages.xml', refresh)).a
    if (data?.c !== 'pecl.php.net' || !data.p) {
      this.cache.delete(rest + 'p/packages.xml')
      throw new Error('The official PECL catalog is unavailable')
    }
    const keyword = query.slice(0, 100).toLowerCase()
    return [
      ...new Set(
        list<unknown>(data.p)
          .filter((name): name is string => typeof name === 'string')
          .map((name) => name.toLowerCase())
      )
    ]
      .filter((name) => /^[a-z][a-z0-9_]*$/.test(name) && name.includes(keyword))
      .sort()
      .map((name) => ({ name: `pecl:${name}`, extension: name, source: 'pecl', description: '' }))
  }

  async prepare(
    name: string,
    profile: PhpExtensionProfile,
    selected?: string,
    refresh = false
  ): Promise<ExtensionPreparation> {
    const extension = identifier(name)
    if (!(await this.catalog(extension, refresh)).some((item) => item.name === name))
      throw new Error('The extension is not in the official PECL catalog')
    const data = parse(await this.read(rest + `r/${extension}/allreleases.xml`, refresh)).a
    if (String(data?.p).toLowerCase() !== extension || data.r === undefined) {
      this.cache.delete(rest + `r/${extension}/allreleases.xml`)
      throw new Error('Official PECL release identity does not match')
    }
    const releases: ExtensionRelease[] = list<{ v: string; s: string }>(data.r)
      .filter(
        (item) => item.s === 'stable' && stableExtensionVersion(item.v) && !item.v.startsWith('v')
      )
      .map((item) => ({ version: item.v, compatible: null }))
      .sort((a, b) => compareExtensionVersions(a.version, b.version))
    const target = selected ? releases.find((item) => item.version === selected) : releases[0]
    let load: { extension: string; zend: boolean } | undefined
    let archiveListingRead = false
    if (selected && !target) throw new Error('The selected official PECL release is unavailable')
    if (target) {
      try {
        const html = await this.read(windows + `${extension}/${target.version}/`, refresh)
        archiveListingRead = true
        const file = [...html.matchAll(/href="([^"?#]+)"/gi)]
          .map((match) => match[1])
          .find(
            (file) =>
              file.startsWith(`php_${extension}-${target.version}-`) &&
              compatiblePeclArchive(file, profile)
          )
        target.compatible = !!file
        if (file) {
          const metadata = parse(
            await this.read(rest + `r/${extension}/package.${target.version}.xml`, refresh)
          ).package
          if (
            String(metadata?.name).toLowerCase() !== extension ||
            metadata?.version?.release !== target.version
          )
            throw new Error('Official PECL package identity does not match the selected release')
          const module = String(metadata.providesextension ?? '')
            .toLowerCase()
            .replace(/^zend /, '')
          const zend =
            Object.hasOwn(metadata, 'zendextsrcrelease') ||
            Object.hasOwn(metadata, 'zendextbinrelease')
          if (
            !/^[a-z][a-z0-9_]*$/.test(module) ||
            (!zend &&
              !Object.hasOwn(metadata, 'extsrcrelease') &&
              !Object.hasOwn(metadata, 'extbinrelease'))
          )
            throw new Error('The official package does not declare a valid PHP extension')
          load = { extension: module, zend }
          target.url = windows + `${extension}/${target.version}/${file}`
        }
      } catch (error) {
        this.cache.delete(windows + `${extension}/${target.version}/`)
        this.cache.delete(rest + `r/${extension}/package.${target.version}.xml`)
        if (!archiveListingRead && axios.isAxiosError(error) && error.response?.status === 404)
          target.compatible = false
        else {
          target.compatible = null
          target.error = error instanceof Error ? error.message : String(error)
        }
      }
    }
    return {
      name,
      source: 'pecl',
      homepage: `https://pecl.php.net/package/${extension}`,
      profile,
      releases,
      ...load
    }
  }

  async archive(name: string, profile: PhpExtensionProfile, version: string): Promise<string> {
    return (await this.resolve(name, profile, version)).url
  }

  async resolve(name: string, profile: PhpExtensionProfile, version: string) {
    // Fresh identity/release/ABI lookup at execution time; never silently downgrade.
    const preparation = await this.prepare(name, profile, version, true)
    const release = preparation.releases.find((item) => item.version === version)!
    if (release.error) throw new Error(`Official archive lookup failed: ${release.error}`)
    if (!release.compatible || !release.url)
      throw new Error(
        `No compatible Windows archive for ${name} ${version}. ${preparation.homepage}`
      )
    if (!preparation.extension || preparation.zend === undefined)
      throw new Error('The official package load metadata is unavailable')
    return { url: release.url, extension: preparation.extension, zend: preparation.zend }
  }
}

export default new PeclRepository()
