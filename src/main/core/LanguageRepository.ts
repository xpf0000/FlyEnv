import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { basename, join, relative, resolve } from 'node:path'
import { FALLBACK_LOCALE, normalizeLocale } from '@lang/catalog'
import {
  isLanguageAsset,
  isLanguageManifest,
  type LanguageAsset,
  type LanguageManifest,
  type LocaleMessages
} from '@shared/LanguageProtocol'

export interface LanguageRepositoryOptions {
  builtInRoot: string
  customRoot: string
  onRead?: (file: string) => void
}

export class LanguageRepository {
  private manifest?: LanguageManifest
  private readonly cache = new Map<string, LanguageAsset>()
  private readonly inFlight = new Map<string, Promise<LanguageAsset>>()

  constructor(private readonly options: LanguageRepositoryOptions) {}

  private async readJson(file: string): Promise<unknown> {
    this.options.onRead?.(file)
    try {
      return JSON.parse(await readFile(file, 'utf8'))
    } catch (error) {
      throw new Error(`Unable to read locale asset ${file}: ${String(error)}`)
    }
  }

  async ready() {
    if (this.manifest) return this.manifest
    const value = await this.readJson(join(this.options.builtInRoot, 'manifest.json'))
    if (!isLanguageManifest(value) || !value.locales[value.fallbackLocale]) {
      throw new Error('Invalid language manifest')
    }
    for (const descriptor of Object.values(value.locales)) {
      if (basename(descriptor.file) !== descriptor.file) {
        throw new Error(`Unsafe locale asset filename: ${descriptor.file}`)
      }
    }
    this.manifest = value
    return value
  }

  listBuiltIn() {
    if (!this.manifest) throw new Error('LanguageRepository.ready() must be awaited first')
    return Object.entries(this.manifest.locales)
      .map(([locale, item]) => ({ locale, label: item.label }))
      .sort((a, b) => a.locale.localeCompare(b.locale))
  }

  async listCustom() {
    const result: Array<{ locale: string; label: string }> = []
    const entries = await readdir(this.options.customRoot, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const metadata = await this.readJson(
        join(this.options.customRoot, entry.name, 'index.json')
      ).catch(() => undefined)
      if (
        metadata &&
        typeof metadata === 'object' &&
        !Array.isArray(metadata) &&
        (metadata as any).lang === entry.name &&
        typeof (metadata as any).label === 'string' &&
        !this.manifest?.locales[entry.name]
      ) {
        result.push({ locale: entry.name, label: (metadata as any).label })
      }
    }
    return result.sort((a, b) => a.locale.localeCompare(b.locale))
  }

  load(localeInput: string): Promise<LanguageAsset> {
    const locale = normalizeLocale(localeInput)
    const cached = this.cache.get(locale)
    if (cached) return Promise.resolve(cached)
    const pending = this.inFlight.get(locale)
    if (pending) return pending
    const load = this.loadUncached(locale)
      .then((asset) => {
        this.cache.set(locale, asset)
        return asset
      })
      .finally(() => this.inFlight.delete(locale))
    this.inFlight.set(locale, load)
    return load
  }

  private async loadUncached(locale: string): Promise<LanguageAsset> {
    const manifest = await this.ready()
    const builtIn = manifest.locales[locale]
    if (builtIn) {
      const value = await this.readJson(join(this.options.builtInRoot, builtIn.file))
      if (!isLanguageAsset(value) || value.locale !== locale) {
        throw new Error(`Invalid language asset: ${locale}`)
      }
      return value
    }
    if (!/^[a-z][a-z0-9-]*$/.test(locale)) {
      throw new Error(`Unsupported or unsafe locale: ${locale}`)
    }
    const root = resolve(this.options.customRoot)
    const directory = resolve(root, locale)
    const rel = relative(root, directory)
    if (!rel || rel.startsWith('..') || rel.includes('/../') || rel.includes('\\..\\')) {
      throw new Error(`Unsupported or unsafe locale: ${locale}`)
    }
    const metadata = await this.readJson(join(directory, 'index.json')).catch(() => undefined)
    if (
      !metadata ||
      typeof metadata !== 'object' ||
      Array.isArray(metadata) ||
      (metadata as any).lang !== locale
    ) {
      throw new Error(`Unsupported or unsafe locale: ${locale}`)
    }
    const messages: LocaleMessages = {}
    const files = (await readdir(directory, { withFileTypes: true }))
      .filter((item) => item.isFile() && item.name.endsWith('.json') && item.name !== 'index.json')
      .map((item) => item.name)
      .sort()
    for (const file of files) {
      const value = await this.readJson(join(directory, file))
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Invalid custom locale namespace: ${locale}/${file}`)
      }
      messages[file.slice(0, -'.json'.length)] = value
    }
    return { schemaVersion: 1, locale, messages }
  }

  retain(activeLocale: string) {
    for (const locale of this.cache.keys()) {
      if (locale !== FALLBACK_LOCALE && locale !== activeLocale) this.cache.delete(locale)
    }
  }

  cachedLocales() {
    return [...this.cache.keys()].sort()
  }

  invalidate(locale: string) {
    this.cache.delete(normalizeLocale(locale))
  }

  async initializeCustomTemplate(locale: 'en' | 'zh') {
    const asset = await this.load(locale)
    const directory = join(this.options.customRoot, locale)
    await mkdir(directory, { recursive: true })
    for (const [namespace, messages] of Object.entries(asset.messages)) {
      const file = join(directory, `${namespace}.json`)
      await writeFile(file, JSON.stringify(messages, null, 2), { flag: 'wx' }).catch(
        (error: any) => {
          if (error?.code !== 'EEXIST') throw error
        }
      )
    }
    await writeFile(
      join(directory, 'index.json'),
      JSON.stringify({ lang: locale, label: locale === 'zh' ? '中文' : 'English' }, null, 2),
      { flag: 'wx' }
    ).catch((error: any) => {
      if (error?.code !== 'EEXIST') throw error
    })
    return directory
  }
}
