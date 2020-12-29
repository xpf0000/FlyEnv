import resources from '@shared/locales/all'
import LocaleManager from '@shared/locales/LocaleManager'

const localeManager = new LocaleManager({
  resources
})

export function getLocaleManager () {
  return localeManager
}

export const I18n = localeManager.getI18n()
