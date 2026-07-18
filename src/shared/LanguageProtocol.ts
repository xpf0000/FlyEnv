export type LocaleMessages = Record<string, unknown>

export interface LanguageAsset {
  schemaVersion: 1
  locale: string
  messages: LocaleMessages
}

export interface LanguageManifest {
  schemaVersion: 1
  fallbackLocale: string
  locales: Record<string, { file: string; label: string }>
}

export interface LanguageRuntimePayload {
  locale: string
  fallbackLocale: string
  messages: LocaleMessages
  fallbackMessages: LocaleMessages
}

export interface LanguagePrepared extends LanguageRuntimePayload {
  token: string
  expiresAt: number
}

export interface LanguageBootstrapResult {
  payload: LanguageRuntimePayload
  warning?: string
}

export interface LanguageChanged {
  type: 'language-changed'
  requestId: string
  payload: LanguageRuntimePayload
}

export interface LanguageChangedAck {
  type: 'language-changed-ack'
  requestId: string
  locale: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export const isLocaleMessages = (value: unknown): value is LocaleMessages => isRecord(value)

export const isLanguageAsset = (value: unknown): value is LanguageAsset =>
  isRecord(value) &&
  value.schemaVersion === 1 &&
  typeof value.locale === 'string' &&
  value.locale.length > 0 &&
  isLocaleMessages(value.messages)

export const isLanguageManifest = (value: unknown): value is LanguageManifest => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.fallbackLocale !== 'string' ||
    !isRecord(value.locales)
  ) {
    return false
  }
  return Object.values(value.locales).every(
    (item) =>
      isRecord(item) &&
      typeof item.file === 'string' &&
      item.file.endsWith('.json') &&
      typeof item.label === 'string'
  )
}

export const isLanguageRuntimePayload = (value: unknown): value is LanguageRuntimePayload =>
  isRecord(value) &&
  typeof value.locale === 'string' &&
  typeof value.fallbackLocale === 'string' &&
  isLocaleMessages(value.messages) &&
  isLocaleMessages(value.fallbackMessages)

export const isLanguageChanged = (value: unknown): value is LanguageChanged =>
  isRecord(value) &&
  value.type === 'language-changed' &&
  typeof value.requestId === 'string' &&
  isLanguageRuntimePayload(value.payload)

export const isLanguageChangedAck = (value: unknown): value is LanguageChangedAck =>
  isRecord(value) &&
  value.type === 'language-changed-ack' &&
  typeof value.requestId === 'string' &&
  typeof value.locale === 'string'
