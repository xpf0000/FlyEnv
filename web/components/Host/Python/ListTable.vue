<template>
  <div ref="hostList" class="host-list">
    <el-card :header="null">
      <el-table
        v-loading="loading"
        :data="hosts"
        row-key="id"
        default-expand-all
        :row-class-name="tableRowClassName"
      >
        <el-table-column :label="I18nT('host.name')">
          <template #header>
            <div class="w-p100 name-cell">
              <span style="display: inline-flex; align-items: center; padding: 2px 0">{{
                I18nT('host.name')
              }}</span>
              <el-input v-model.trim="search" placeholder="search" clearable></el-input>
            </div>
          </template>
          <template #default="scope">
            <div
              class="host-list-table-cell-id"
              style="display: none"
              :data-host-id="scope.row.id"
            ></div>
            <template v-if="!scope?.row?.deling && quickEdit?.id && scope.row.id === quickEdit?.id">
              <el-input
                v-model="quickEdit.projectName"
                :class="{ error: quickEditProjectNameError }"
                @change="docClick(undefined)"
              ></el-input>
            </template>
            <template v-else>
              <QrcodePopper :url="scope.row.name">
                <div class="link" @click.stop="openSite(scope.row)">
                  <yb-icon
                    :class="{ active: checkSiteOn(scope.row) }"
                    :svg="import('@/svg/link.svg?raw')"
                    width="18"
                    height="18"
                  />
                  <span>
                    {{ siteName(scope.row) }}
                  </span>
                </div>
              </QrcodePopper>
            </template>
          </template>
        </el-table-column>
        <el-table-column :label="I18nT('host.projectPort')">
          <template #default="scope">
            <template v-if="!scope?.row?.deling && quickEdit?.id && scope.row.id === quickEdit?.id">
              <el-input v-model="quickEdit.projectPort" @change="docClick(undefined)"></el-input>
            </template>
            <template v-else>
              <span>{{ scope.row.projectPort }}</span>
            </template>
          </template>
        </el-table-column>
        <el-table-column :label="I18nT('host.mark')">
          <template #default="scope">
            <template v-if="!scope?.row?.deling && quickEdit?.id && scope.row.id === quickEdit?.id">
              <el-input v-model="quickEdit.mark" @change="docClick(undefined)"></el-input>
            </template>
            <template v-else>
              <el-popover width="auto" :show-after="800" placement="top">
                <template #default>
                  <span>{{ scope.row.mark }}</span>
                </template>
                <template #reference>
                  <span style="display: inline-block; max-width: 100%">
                    {{ scope.row.mark }}
                  </span>
                </template>
              </el-popover>
            </template>
          </template>
        </el-table-column>
        <el-table-column
          :label="I18nT('base.service')"
          :prop="null"
          width="110px"
          class="app-service-table-cell"
        >
          <template #default="scope">
            <template v-if="HostStore.state(scope.row.id).running">
              <el-button :loading="true" link></el-button>
            </template>
            <template v-else>
              <template v-if="HostStore.state(scope.row.id).isRun">
                <el-button link class="status running" @click.stop="serviceDo('stop', scope.row)">
                  <yb-icon :svg="import('@/svg/stop2.svg?raw')" />
                </el-button>
                <el-button link class="status refresh" @click.stop="serviceDo('start', scope.row)">
                  <yb-icon :svg="import('@/svg/icon_refresh.svg?raw')" />
                </el-button>
              </template>
              <template v-else>
                <el-button
                  link
                  class="status start current"
                  @click.stop="serviceDo('start', scope.row)"
                >
                  <yb-icon :svg="import('@/svg/play.svg?raw')" />
                </el-button>
              </template>
            </template>
          </template>
        </el-table-column>
        <el-table-column align="center" :label="I18nT('host.setup')" width="100px">
          <template #default="scope">
            <template v-if="scope?.row?.deling || scope.row.id !== quickEdit?.id">
              <template v-if="!scope?.row?.deling">
                <el-popover
                  effect="dark"
                  popper-class="host-list-poper"
                  placement="left-start"
                  width="auto"
                  :show-arrow="false"
                >
                  <ul v-poper-fix class="host-list-menu">
                    <li @click.stop="action(scope.row, scope.$index, 'open')">
                      <yb-icon :svg="import('@/svg/folder.svg?raw')" width="13" height="13" />
                      <span class="ml-15">{{ I18nT('base.open') }}</span>
                    </li>
                    <li @click.stop="action(scope.row, scope.$index, 'edit')">
                      <yb-icon :svg="import('@/svg/edit.svg?raw')" width="13" height="13" />
                      <span class="ml-15">{{ I18nT('base.edit') }}</span>
                    </li>
                    <li @click.stop="action(scope.row, scope.$index, 'link')">
                      <yb-icon :svg="import('@/svg/link.svg?raw')" width="13" height="13" />
                      <span class="ml-15">{{ I18nT('base.link') }}</span>
                    </li>
                    <li @click.stop="action(scope.row, scope.$index, 'log')">
                      <yb-icon :svg="import('@/svg/log.svg?raw')" width="13" height="13" />
                      <span class="ml-15">{{ I18nT('base.log') }}</span>
                    </li>
                    <li @click.stop="showSort($event, scope.row.id)">
                      <yb-icon :svg="import('@/svg/sort.svg?raw')" width="13" height="13" />
                      <span class="ml-15">{{ I18nT('host.sort') }}</span>
                    </li>
                    <li @click.stop="action(scope.row, scope.$index, 'del')">
                      <yb-icon :svg="import('@/svg/trash.svg?raw')" width="13" height="13" />
                      <span class="ml-15">{{ I18nT('base.del') }}</span>
                    </li>
                  </ul>

                  <template #reference>
                    <div class="right">
                      <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
                    </div>
                  </template>
                </el-popover>
              </template>
              <template v-else>
                <el-button :loading="true" link></el-button>
              </template>
            </template>
            <template v-else>
              <div class="right" style="opacity: 0; padding: 19px">
                <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
              </div>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { ref, computed, onMounted, nextTick, onBeforeUnmount, type Ref, reactive } from 'vue'
  import { AppStore } from '@web/store/app'
  import QrcodePopper from '../Qrcode/Index.vue'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentShow, waitTime } from '@web/fn'
  import type { AppHost } from '@shared/app'
  import { isEqual } from 'lodash'
  import { HostStore } from '@web/components/Host/store'
  import { MessageSuccess } from '@/util/Element'
  import { ElMessageBox } from 'element-plus'

  const hostList = ref()
  const loading = ref(false)
  const appStore = AppStore()
  const task_index = ref(0)
  const search = ref('')

  const hosts = computed(() => {
    if (appStore.hosts.length === 0 || HostStore.index === 0) {
      return []
    }
    let hosts: Array<any> = JSON.parse(JSON.stringify(HostStore.tabList('python')))
    if (search.value) {
      hosts = hosts.filter((h) => {
        const name = h?.name ?? ''
        const pname = h?.projectName ?? ''
        const mark = h?.mark ?? ''
        return (
          pname.includes(search.value) ||
          name.includes(search.value) ||
          `${mark}`.includes(search.value)
        )
      })
    }
    const allHost = hosts
      .filter((h) => !h.projectName && h.name)
      .map((h) => {
        return {
          id: h.id,
          name: h.name
        }
      })
      .sort((a, b) => {
        return b.name.length - a.name.length
      })
    const arr: Array<any> = []
    const findChild = (item: any) => {
      if (!item.name) {
        return
      }
      const sub = hosts.filter((h) => {
        if (!h.name || h?.pid) {
          return false
        }
        let name: any = h.name.split('.')
        let has = false
        while (!has && name.length > 0) {
          name.shift()
          const str = name.join('.').trim()
          has = item.name.trim() === str
        }
        return has
      })
      sub.forEach((s) => {
        s.pid = item.id
      })
      item.children = sub
    }
    allHost.forEach((a) => {
      const item = hosts.find((h) => h.id === a.id)
      findChild(item)
    })
    hosts.forEach((h) => {
      if (!h.pid) {
        arr.push(h)
      }
    })
    console.log('hosts arr: ', arr)
    return arr
  })

  const serviceDo = (action: 'start' | 'stop', item: AppHost) => {
    const state = HostStore.state(item.id)
    if (state.running) {
      return
    }
    state.running = true
    waitTime().then(() => {
      state.running = false
      state.isRun = action === 'start'
      MessageSuccess(I18nT('base.success'))
    })
  }

  const tableRowClassName = ({ row }: { row: AppHost }) => {
    if (row?.isSorting) {
      return 'is-sorting'
    }
    if (row?.isTop) {
      return 'is-top'
    }
    return ''
  }

  const siteName = (item: AppHost) => {
    return item?.projectName ?? ''
  }

  const checkSiteOn = (item: AppHost) => {
    return HostStore.state(`${item.id}`).isRun
  }

  const openSite = (item: any) => {}

  let EditVM: any
  import('./Edit.vue').then((res) => {
    EditVM = res.default
  })
  let LogVM: any
  import('../Java/Logs.vue').then((res) => {
    LogVM = res.default
  })
  let LinkVM: any
  import('../Link.vue').then((res) => {
    LinkVM = res.default
  })

  const action = (item: any, index: number, flag: string) => {
    console.log('item: ', item)
    item = appStore.hosts.find((h) => h.id === item.id)
    task_index.value = index
    switch (flag) {
      case 'open':
        break
      case 'edit':
        AsyncComponentShow(EditVM, {
          edit: item,
          isEdit: true
        }).then()
        break
      case 'log':
        const logFile = 'Log'
        const customTitle = item.projectName
        AsyncComponentShow(LogVM, {
          logFile,
          customTitle
        }).then()
        break
      case 'del':
        ElMessageBox.confirm(I18nT('base.delAlertContent'), undefined, {
          confirmButtonText: I18nT('base.confirm'),
          cancelButtonText: I18nT('base.cancel'),
          closeOnClickModal: false,
          customClass: 'confirm-del',
          type: 'warning'
        }).then(() => {
          const index = appStore.hosts.findIndex((h) => h.id === item.id)
          if (index >= 0) {
            appStore.hosts.splice(index, 1)
          }
        })
        break
      case 'link':
        console.log('item: ', item)
        AsyncComponentShow(LinkVM, {
          host: item
        }).then()
        break
    }
  }

  let SortVM: any
  import('../Sort/index.vue').then((res) => {
    SortVM = res.default
  })

  const showSort = (event: MouseEvent, id: string) => {
    let dom: HTMLElement = event.target as any
    while (dom.tagName.toUpperCase() !== 'LI' && dom.parentElement && dom.parentElement !== dom) {
      dom = dom.parentElement
    }
    const rect = dom.getBoundingClientRect()
    AsyncComponentShow(SortVM, {
      hostId: id,
      rect
    }).then()
  }

  let quickEditBack: AppHost | undefined = undefined
  const quickEdit: Ref<AppHost | undefined> = ref(undefined)
  const quickEditTr: Ref<HTMLElement | undefined> = ref(undefined)

  const quickEditProjectNameError = computed(() => {
    if (!quickEdit.value?.projectName) {
      return true
    }
    return (
      quickEdit?.value?.id &&
      HostStore.tabList('python').some(
        (h) =>
          h.projectName &&
          h.projectName === quickEdit.value?.projectName &&
          h.id !== quickEdit.value?.id
      )
    )
  })

  const tbodyDblClick = (e: MouseEvent) => {
    console.log('tbodyDblClick: ', e, e.target)
    let node: HTMLElement = e.target as any
    while (node.nodeName.toLowerCase() !== 'tr') {
      node = node.parentNode as any
    }
    console.log('tr: ', node)
    const idDom: HTMLElement = node.querySelector('.host-list-table-cell-id') as any
    const id = idDom.getAttribute('data-host-id') ?? ''
    console.log('id: ', id)
    const host = appStore.hosts.find((h) => `${h.id}` === `${id}`)
    console.log('host: ', host)
    quickEdit.value = JSON.parse(JSON.stringify(host))
    quickEditTr.value = node as any
    quickEditBack = JSON.parse(JSON.stringify(host))
  }

  const docClick = (e?: MouseEvent) => {
    const dom: HTMLElement = e?.target as any
    if (quickEdit?.value && !quickEditTr?.value?.contains(dom)) {
      if (!quickEdit?.value?.projectName?.trim() || quickEditProjectNameError?.value) {
        quickEdit.value.projectName = quickEditBack?.projectName ?? ''
      }
      if (!isEqual(quickEdit.value, quickEditBack)) {
        const index = appStore.hosts.findIndex((h) => h.id === quickEdit?.value?.id)
        if (index >= 0) {
          appStore.hosts.splice(index, 1, reactive(JSON.parse(JSON.stringify(quickEdit.value))))
        }
      }
      quickEdit.value = undefined
      quickEditTr.value = undefined
      quickEditBack = undefined
    }
  }

  onMounted(() => {
    document.addEventListener('click', docClick)
    nextTick().then(() => {
      const list: HTMLElement = hostList.value as any
      const tbody = list.querySelector('tbody')
      console.log('tbody: ', tbody)
      tbody?.addEventListener('dblclick', tbodyDblClick)
    })
  })
  onBeforeUnmount(() => {
    document.removeEventListener('click', docClick)
    const list: HTMLElement = hostList.value as any
    const tbody = list.querySelector('tbody')
    tbody?.removeEventListener('dblclick', tbodyDblClick)
  })
</script>
