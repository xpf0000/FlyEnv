import { reactive } from 'vue'
import { MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'
import { clipboard } from '@/util/NodeFn'

const defaultUrl =
  'https://me:pwd@www.macphpstudy.com:3000/sponsor.html?key1=value&key2=value2#thanks'

const store = reactive({
  url: defaultUrl,
  urlDict: new URL(defaultUrl),
  list: [
    { title: 'Protocol', key: 'protocol' },
    { title: 'Username', key: 'username' },
    { title: 'Password', key: 'password' },
    { title: 'Hostname', key: 'hostname' },
    { title: 'Port', key: 'port' },
    { title: 'Path', key: 'pathname' },
    { title: 'Params', key: 'search' }
  ],
  parse() {
    this.urlDict = new URL(this.url)
  },
  copy(text: string) {
    clipboard.writeText(text)
    MessageSuccess(I18nT('base.success'))
  }
})

export default store
