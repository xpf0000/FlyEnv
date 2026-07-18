import { randomUUID } from 'node:crypto'
import { FALLBACK_LOCALE, normalizeLocale } from '@lang/catalog'
import type {
  LanguageAsset,
  LanguageChanged,
  LanguagePrepared,
  LanguageRuntimePayload
} from '@shared/LanguageProtocol'

interface RepositoryContract {
  load(locale: string): Promise<LanguageAsset>
  retain(locale: string): void
}

interface RuntimeContract {
  apply(payload: LanguageRuntimePayload): void
}

export interface LanguageCoordinatorOptions {
  repository: RepositoryContract
  runtime: RuntimeContract
  persist(locale: string): void | Promise<void>
  publish(message: LanguageChanged): Promise<void>
  refreshNativeUi(): void | Promise<void>
  setServerLocale(locale: string): void
  now?: () => number
  token?: () => string
  requestId?: () => string
  preparationTtlMs?: number
  onError?: (error: unknown) => void
}

export class LanguageCoordinator {
  private readonly now: () => number
  private readonly token: () => string
  private readonly requestId: () => string
  private readonly preparationTtlMs: number
  private pending?: LanguagePrepared
  private current?: LanguageRuntimePayload
  private startupWarning?: string

  constructor(private readonly options: LanguageCoordinatorOptions) {
    this.now = options.now ?? Date.now
    this.token = options.token ?? randomUUID
    this.requestId = options.requestId ?? randomUUID
    this.preparationTtlMs = options.preparationTtlMs ?? 30_000
  }

  private async payload(localeInput: string): Promise<LanguageRuntimePayload> {
    const locale = normalizeLocale(localeInput)
    const [fallback, selected] = await Promise.all([
      this.options.repository.load(FALLBACK_LOCALE),
      this.options.repository.load(locale)
    ])
    return {
      locale: selected.locale,
      fallbackLocale: fallback.locale,
      messages: selected.messages,
      fallbackMessages: fallback.messages
    }
  }

  async initialize(locale: string) {
    let payload: LanguageRuntimePayload
    try {
      payload = await this.payload(locale)
    } catch (error) {
      this.options.onError?.(error)
      this.startupWarning = String(error)
      payload = await this.payload(FALLBACK_LOCALE)
    }
    this.options.runtime.apply(payload)
    this.options.setServerLocale(payload.locale)
    this.options.repository.retain(payload.locale)
    this.current = payload
    return payload
  }

  async prepare(locale: string): Promise<LanguagePrepared> {
    const payload = await this.payload(locale)
    const prepared: LanguagePrepared = {
      ...payload,
      token: this.token(),
      expiresAt: this.now() + this.preparationTtlMs
    }
    this.pending = prepared
    return prepared
  }

  async commit(token: string): Promise<LanguageRuntimePayload> {
    const pending = this.pending
    if (!pending || pending.token !== token) {
      if (pending) throw new Error('Stale language preparation')
      throw new Error('Unknown language preparation')
    }
    this.pending = undefined
    if (this.now() > pending.expiresAt) throw new Error('Expired language preparation')

    const payload: LanguageRuntimePayload = {
      locale: pending.locale,
      fallbackLocale: pending.fallbackLocale,
      messages: pending.messages,
      fallbackMessages: pending.fallbackMessages
    }
    this.options.runtime.apply(payload)
    this.options.setServerLocale(payload.locale)
    await this.options.persist(payload.locale)
    this.options.repository.retain(payload.locale)
    this.current = payload
    await Promise.resolve(this.options.refreshNativeUi()).catch((error) =>
      this.options.onError?.(error)
    )
    await this.options
      .publish({ type: 'language-changed', requestId: this.requestId(), payload })
      .catch((error) => this.options.onError?.(error))
    return payload
  }

  snapshot() {
    if (!this.current) throw new Error('LanguageCoordinator.initialize() has not completed')
    return this.current
  }

  bootstrap() {
    const result = { payload: this.snapshot(), warning: this.startupWarning }
    this.startupWarning = undefined
    return result
  }
}
