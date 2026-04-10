import { AppAllLang } from '@lang/index'

class CustomerLang {
  lang: Record<string, any> = {}

  initLangCustomer() {
    if (!Object.keys(AppAllLang).includes(global.Server.Lang!)) {
      global.Server.LangCustomer = this.lang[global.Server.Lang!]
    }
  }
}

export default new CustomerLang()
