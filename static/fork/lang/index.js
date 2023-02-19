const ENFork = require('./en/fork')
const ZHFork = require('./zh/fork')
const { createI18n } = require('vue-i18n/dist/vue-i18n.cjs.prod.js')

const lang = {
  en: {
    fork: ENFork
  },
  zh: {
    fork: ZHFork
  }
}

let i18n

const AppI18n = (l) => {
  if (!i18n) {
    i18n = createI18n({
      legacy: true,
      locale: l || 'en',
      fallbackLocale: 'en',
      messages: lang
    })
  }
  if (l) {
    i18n.global.locale = l
  }
  return i18n
}

const I18nT = (...args) => {
  return i18n.global.t(...args)
}

module.exports = {
  AppI18n,
  I18nT
}
