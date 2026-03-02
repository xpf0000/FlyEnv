import { CloudflareTunnel } from '@/core/CloudflareTunnel/CloudflareTunnel'
import { computed, reactive } from 'vue'
import CloudflareTunnelStore from '@/core/CloudflareTunnel/CloudflareTunnelStore'
import { AppStore } from '@/store/app'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import { CloudflareTunnelDnsRecord, ZoneType } from '@/core/CloudflareTunnel/type'
import Base from '@/core/Base'
import { I18nT } from '@lang/index'
import { clipboard, shell } from '@/util/NodeFn'
import { MessageSuccess } from '@/util/Element'

export const ZoneDict: Record<string, ZoneType[]> = reactive({})

export const Setup = () => {
  const appStore = AppStore()

  const list = computed(() => {
    return CloudflareTunnelStore.items
  })

  let AddVM: any
  import('./add.vue').then((res) => {
    AddVM = res.default
  })

  function add() {
    AsyncComponentShow(AddVM).then()
  }

  let EditVM: any
  import('./edit.vue').then((res) => {
    EditVM = res.default
  })

  function edit(item: CloudflareTunnel) {
    AsyncComponentShow(EditVM, {
      item: JSON.parse(JSON.stringify(item))
    }).then()
  }

  let LogVM: any
  import('./Logs.vue').then((res) => {
    LogVM = res.default
  })

  function log(item: CloudflareTunnel) {
    AsyncComponentShow(LogVM, {
      item: JSON.parse(JSON.stringify(item))
    }).then()
  }

  function del(item: CloudflareTunnel, index: number) {
    Base._Confirm(I18nT('base.areYouSure'), undefined, {
      customClass: 'confirm-del',
      type: 'warning'
    }).then(() => {
      CloudflareTunnelStore.items.splice(index, 1)
      CloudflareTunnelStore.save()
    })
  }

  const openOutUrl = (item: CloudflareTunnelDnsRecord) => {
    const url = `http://${item.subdomain}.${item.zoneName}`
    shell.openExternal(url).catch()
  }

  const openLocalUrl = (item: CloudflareTunnelDnsRecord) => {
    const url = `${item?.protocol || 'http'}://${item.localService}`
    shell.openExternal(url).catch()
  }

  const groupTrunOn = (item: CloudflareTunnel) => {
    const dict = JSON.parse(JSON.stringify(appStore.phpGroupStart))
    const key = item.id
    if (dict?.[key] === false) {
      dict[key] = true
      delete dict?.[key]
    } else {
      dict[key] = false
    }
    appStore.config.setup.phpGroupStart = reactive(dict)
    appStore.saveConfig().then().catch()
  }

  const copy = (str: string) => {
    clipboard.writeText(str).then(() => {
      MessageSuccess(I18nT('base.copySuccess'))
    })
  }

  let EditDNSVM: any
  import('./editDNS.vue').then((res) => {
    EditDNSVM = res.default
  })

  const editDNS = (item: CloudflareTunnel, dns: CloudflareTunnelDnsRecord, index: number) => {
    AsyncComponentShow(EditDNSVM, {
      item: JSON.parse(JSON.stringify(item)),
      dns: JSON.parse(JSON.stringify(dns)),
      index
    }).then()
  }

  const delDNS = (item: CloudflareTunnel, dns: CloudflareTunnelDnsRecord, index: number) => {
    Base._Confirm(I18nT('base.areYouSure'), undefined, {
      customClass: 'confirm-del',
      type: 'warning'
    }).then(() => {
      const find = CloudflareTunnelStore.items.find((i) => i.id === item.id)
      if (find) {
        find.dns.splice(index, 1)
      }
      CloudflareTunnelStore.save()
    })
  }

  let AddDNSVM: any
  import('./addDNS.vue').then((res) => {
    AddDNSVM = res.default
  })

  function addDNS(item: CloudflareTunnel) {
    AsyncComponentShow(AddDNSVM, {
      item: JSON.parse(JSON.stringify(item))
    }).then()
  }

  return {
    add,
    edit,
    del,
    list,
    openOutUrl,
    openLocalUrl,
    groupTrunOn,
    copy,
    editDNS,
    delDNS,
    addDNS,
    log
  }
}
