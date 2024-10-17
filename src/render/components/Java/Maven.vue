<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> Maven </span>
          <el-button class="button" link @click="openURL">
            <yb-icon
              style="width: 20px; height: 20px; margin-left: 10px"
              :svg="import('@/svg/http.svg?raw')"
            ></yb-icon>
          </el-button>
        </div>
        <el-button v-if="showNextBtn" type="primary" @click="toNext">{{
          I18nT('base.confirm')
        }}</el-button>
        <el-button v-else class="button" link :disabled="isRunning" @click="reGetData">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': currentType.getListing || brewRunning }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <template v-if="showLog">
      <div class="log-wapper">
        <div ref="logs" class="logs"></div>
      </div>
    </template>
    <el-table
      v-else
      class="service-table"
      height="100%"
      :data="tableData"
      :border="false"
      style="width: 100%"
    >
      <template #empty>
        <template v-if="currentType.getListing">
          {{ I18nT('base.gettingVersion') }}
        </template>
        <template v-else>
          {{ I18nT('util.noVerionsFoundInLib') }}
        </template>
      </template>
      <el-table-column prop="version" width="200">
        <template #header>
          <span style="padding: 2px 12px 2px 24px; display: block">{{
            I18nT('base.version')
          }}</span>
        </template>
        <template #default="scope">
          <span
            :class="{
              current: checkEnvPath(scope.row)
            }"
            style="padding: 2px 12px 2px 24px; display: block"
            >{{ scope.row.version }}</span
          >
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('base.path')">
        <template #default="scope">
          <template v-if="scope.row?.path">
            <span
              class="path"
              :class="{
                current: checkEnvPath(scope.row)
              }"
              @click.stop="openDir(scope.row.path)"
              >{{ scope.row.path }}</span
            >
          </template>
          <template v-else>
            <div class="cell-progress">
              <el-progress v-if="scope.row.downing" :percentage="scope.row.progress"></el-progress>
            </div>
          </template>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('base.source')" width="120">
        <template #default="scope">
          <span>{{ scope.row.source }}</span>
        </template>
      </el-table-column>
      <el-table-column align="center" :label="I18nT('base.isInstalled')" width="150">
        <template #default="scope">
          <div class="cell-status">
            <template v-if="scope.row.installed || scope.row?.path">
              <yb-icon :svg="import('@/svg/ok.svg?raw')" class="installed"></yb-icon>
            </template>
          </div>
        </template>
      </el-table-column>
      <el-table-column align="center" :label="I18nT('base.operation')" width="150">
        <template #default="scope">
          <template v-if="scope.row?.path">
            <ExtSet :item="scope.row" :type="typeFlag" />
          </template>
          <template v-else>
            <el-button
              type="primary"
              link
              :style="{ opacity: scope.row.version !== undefined ? 1 : 0 }"
              :loading="scope.row.downing"
              :disabled="scope.row.downing"
              @click="handleEdit(scope.$index, scope.row, scope.row.installed)"
              >{{
                scope.row.installed ? I18nT('base.uninstall') : I18nT('base.install')
              }}</el-button
            >
          </template>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script lang="ts" setup>
  import { computed, ComputedRef, nextTick, onUnmounted, ref, watch } from 'vue'
  import { fetchAllVersion } from '@/util/Brew'
  import { AppSoftInstalledItem, BrewStore, type OnlineVersionItem } from '@/store/brew'
  import IPC from '@/util/IPC'
  import { I18nT } from '@shared/lang'
  import { Service } from '@/components/ServiceManager/service'
  import installedVersions from '@/util/InstalledVersions'
  import type { SoftInstalled } from '@/store/brew'
  import ExtSet from '@/components/ServiceManager/EXT/index.vue'
  import { ServiceActionStore } from '../ServiceManager/EXT/store'
  import { staticVersionDel } from '@/util/Version'
  import { join } from 'path'
  import { copyFileSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
  import { chmod } from '@shared/file'
  import XTerm from '@/util/XTerm'
  import { AppStore } from '@/store/app'

  const { shell } = require('@electron/remote')
  const { existsSync } = require('fs-extra')
  const { dirname } = require('path')

  const props = defineProps<{
    typeFlag: 'maven'
  }>()

  if (!Service[props.typeFlag]) {
    Service[props.typeFlag] = {
      fetching: false
    }
  }

  const brewStore = BrewStore()

  const brewRunning = computed(() => {
    return brewStore.brewRunning
  })
  const currentType: ComputedRef<AppSoftInstalledItem> = computed(() => {
    return brewStore.module('maven')
  })

  const isRunning = computed(() => {
    return Object.values(currentType?.value?.list?.static ?? {}).some(
      (l: OnlineVersionItem) => l?.downing === true
    )
  })

  const tableData = computed(() => {
    const localList = brewStore.module('maven').installed
    const onLineList = Object.values(currentType?.value?.list?.static ?? {}).map((item) => {
      const obj: any = {
        ...item
      }
      obj.source = I18nT('base.staticBinarie')
      return obj
    })
    const brewList = Object.values(currentType?.value?.list?.brew ?? {}).map((item) => {
      const obj: any = {
        ...item
      }
      obj.source = 'Homebrew'
      return obj
    })
    const portList = Object.values(currentType?.value?.list?.port ?? {}).map((item) => {
      const obj: any = {
        ...item
      }
      obj.source = 'MacPorts'
      return obj
    })
    return [...localList, ...onLineList, ...brewList, ...portList]
  })

  const checkEnvPath = (item: SoftInstalled) => {
    if (!item?.bin) {
      return false
    }
    console.log('checkEnvPath: ', ServiceActionStore.allPath, dirname(item.bin))
    return ServiceActionStore.allPath.includes(dirname(item.bin))
  }

  const openDir = (dir: string) => {
    shell.openPath(dir)
  }

  const fetchData = () => {
    fetchAllVersion(props.typeFlag)
    const service = Service[props.typeFlag]
    if (service?.fetching) {
      return
    }
    const data = brewStore.module('maven')
    data.installedInited = false
    installedVersions.allInstalledVersions([props.typeFlag]).then(() => {
      service.fetching = false
    })
  }
  const getData = () => {
    const currentItem = currentType.value
    if (currentItem.getListing) {
      return
    }
    const list = currentItem?.list?.static ?? []
    if (Object.keys(list).length === 0) {
      fetchData()
    }
  }
  const reGetData = () => {
    if (isRunning?.value) {
      return
    }
    const list = currentType.value.list.static
    for (let k in list) {
      delete list[k]
    }
    getData()
  }

  const regetInstalled = () => {
    const service = Service[props.typeFlag]
    if (service?.fetching) {
      return
    }
    service.fetching = true
    const data = brewStore.module('maven')
    data.installedInited = false
    installedVersions.allInstalledVersions([props.typeFlag]).then(() => {
      service.fetching = false
    })
  }

  const showNextBtn = ref(false)
  const appStore = AppStore()
  const proxy = computed(() => {
    return appStore.config.setup.proxy
  })
  const proxyStr = computed(() => {
    if (!proxy?.value.on) {
      return undefined
    }
    return proxy?.value?.proxy
  })

  const handleEditBrew = (row: any, installed: boolean, flag: 'Homebrew' | 'MacPorts') => {
    if (brewRunning?.value) {
      return
    }
    brewStore.log.splice(0)
    brewStore.showInstallLog = true
    brewStore.brewRunning = true
    let fn = ''
    if (installed) {
      fn = 'uninstall'
      brewStore.cardHeadTitle = `${I18nT('base.uninstall')} ${row.name}`
    } else {
      fn = 'install'
      brewStore.cardHeadTitle = `${I18nT('base.install')} ${row.name}`
    }

    const arch = global.Server.isAppleSilicon ? '-arm64' : '-x86_64'
    const name = row.name
    let params = []
    if (flag === 'Homebrew') {
      const sh = join(global.Server.Static!, 'sh/brew-cmd.sh')
      const copyfile = join(global.Server.Cache!, 'brew-cmd.sh')
      if (existsSync(copyfile)) {
        unlinkSync(copyfile)
      }
      copyFileSync(sh, copyfile)
      chmod(copyfile, '0777')
      params = [`${copyfile} ${arch} ${fn} ${name}; exit 0`]
      if (proxyStr?.value) {
        params.unshift(proxyStr?.value)
      }
    } else {
      let names = [name]
      const sh = join(global.Server.Static!, 'sh/port-cmd.sh')
      const copyfile = join(global.Server.Cache!, 'port-cmd.sh')
      if (existsSync(copyfile)) {
        unlinkSync(copyfile)
      }
      if (fn === 'uninstall') {
        fn = 'uninstall --follow-dependents'
      }
      let content = readFileSync(sh, 'utf-8')
      content = content
        .replace(new RegExp('##PASSWORD##', 'g'), global.Server.Password!)
        .replace(new RegExp('##ARCH##', 'g'), arch)
        .replace(new RegExp('##ACTION##', 'g'), fn)
        .replace(new RegExp('##NAME##', 'g'), names.join(' '))
      writeFileSync(copyfile, content)
      chmod(copyfile, '0777')
      params = [`sudo -S ${copyfile}; exit 0`]
      params.push(global.Server.Password!)
      if (proxyStr?.value) {
        params.unshift(proxyStr?.value)
      }
    }

    XTerm.send(params, true).then((key: string) => {
      IPC.off(key)
      showNextBtn.value = true
      regetInstalled()
    })
  }

  const handleEdit = (index: number, row: any, installed: boolean) => {
    console.log('row: ', row, installed)
    if (['Homebrew', 'MacPorts'].includes(row.source)) {
      handleEditBrew(row, installed, row.source)
      return
    }
    if (!installed) {
      if (row.downing) {
        return
      }
      row.downing = true
      row.type = props.typeFlag
      IPC.send('app-fork:maven', 'installSoft', JSON.parse(JSON.stringify(row))).then(
        (key: string, res: any) => {
          console.log('res: ', res)
          if (res?.code === 200) {
            Object.assign(row, res.msg)
          } else if (res?.code === 0) {
            IPC.off(key)
            if (res?.data) {
              regetInstalled()
            }
            row.downing = false
          }
        }
      )
    } else {
      staticVersionDel(row.appDir)
    }
  }

  const toNext = () => {
    showNextBtn.value = false
    BrewStore().cardHeadTitle = I18nT('base.currentVersionLib')
  }

  const showInstallLog = computed(() => {
    return brewStore.showInstallLog
  })

  const showLog = computed(() => {
    return showInstallLog?.value || showNextBtn?.value
  })

  const log = computed(() => {
    return brewStore.log
  })

  const openURL = () => {
    shell.openExternal('https://maven.apache.org/')
  }

  const logLength = computed(() => {
    return log?.value?.length
  })

  const logs = ref()
  let xterm: XTerm | null = null

  watch(
    showLog,
    (val) => {
      nextTick().then(() => {
        if (val) {
          const dom = logs?.value
          xterm = new XTerm()
          xterm.mount(dom)
        } else {
          xterm && xterm.destory()
          xterm = null
        }
      })
    },
    {
      immediate: true
    }
  )

  watch(logLength, () => {
    if (showInstallLog?.value) {
      nextTick(() => {
        let container: HTMLElement = logs?.value as any
        if (container) {
          container.scrollTop = container.scrollHeight
        }
      })
    }
  })

  onUnmounted(() => {
    xterm && xterm.destory()
    xterm = null
  })

  getData()
  ServiceActionStore.fetchPath()
</script>
