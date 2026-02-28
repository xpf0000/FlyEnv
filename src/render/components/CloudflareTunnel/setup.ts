import { CloudflareTunnel } from '@/core/CloudflareTunnel/CloudflareTunnel'
import { computed, reactive } from 'vue'
import CloudflareTunnelStore from '@/core/CloudflareTunnel/CloudflareTunnelStore'
import { AppStore } from '@/store/app'
import { AsyncComponentShow } from '@/util/AsyncComponent'
import type { ZoneType } from '@/core/CloudflareTunnel/type'

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
      item
    }).then()
  }

  function info(item: CloudflareTunnel) {}

  function del(item: CloudflareTunnel, index: number) {}

  const openOutUrl = (item: CloudflareTunnel) => {}

  const openLocalUrl = (item: CloudflareTunnel) => {}

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

  return {
    add,
    edit,
    info,
    del,
    list,
    openOutUrl,
    openLocalUrl,
    groupTrunOn
  }
}
