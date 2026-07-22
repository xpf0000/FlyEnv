<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left"><span>GVM</span></div>
        <el-button class="button" link :disabled="refreshDisabled" @click="GvmSetup.fetchData()">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': refreshDisabled }"
          />
        </el-button>
      </div>
    </template>
    <template v-if="GvmSetup.installing">
      <div class="w-full h-full overflow-hidden p-5">
        <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
      </div>
    </template>
    <template v-else-if="GvmSetup.installed === undefined">
      <div class="w-full h-full flex items-center justify-center">
        {{ I18nT('base.gettingVersion') }}
      </div>
    </template>
    <template v-else-if="GvmSetup.installed === false">
      <div class="w-full h-full flex flex-col items-center justify-center p-10 gap-5">
        <span>Install GVM?</span>
        <el-button type="primary" @click.stop="doInstall">{{ I18nT('base.confirm') }}</el-button>
      </div>
    </template>
    <template v-else>
      <el-auto-resizer>
        <template #default="{ height, width }">
          <el-table-v2
            class="app-el-table-v2"
            :columns="columns"
            :data="versionList"
            :width="width"
            :height="height"
            :header-height="59"
            :row-height="59"
          />
        </template>
      </el-auto-resizer>
    </template>
    <template v-if="GvmSetup.installing" #footer>
      <el-button v-if="GvmSetup.installEnd" type="primary" @click.stop="taskConfirm">
        {{ I18nT('base.confirm') }}
      </el-button>
      <el-button v-else @click.stop="taskCancel">{{ I18nT('base.cancel') }}</el-button>
    </template>
  </el-card>
</template>

<script lang="tsx" setup>
  import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
  import { sortGvmVersionsNewestFirst, type GvmVersionItem } from '@shared/Gvm'
  import { I18nT } from '@lang/index'
  import { ElButton, ElInput, type Column } from 'element-plus'
  import XTerm from '@/util/XTerm'
  import { GvmSetup } from './setup'

  const xtermDom = ref<HTMLElement>()
  GvmSetup.checkGvm()

  const refreshDisabled = computed(() => GvmSetup.fetching || GvmSetup.installing)
  const versionList = computed(() => {
    const key = GvmSetup.searchKey.trim()
    const list = key
      ? GvmSetup.versions.filter((item) => item.version.includes(key) || item.name.includes(key))
      : [...GvmSetup.versions]
    return sortGvmVersionsNewestFirst(list)
  })

  const startTask = (run: () => Promise<void>) => {
    GvmSetup.installing = true
    nextTick(() => run().catch(() => (GvmSetup.installEnd = true)))
  }
  const doInstall = () => startTask(() => GvmSetup.installGvm(xtermDom.value!))
  const doVersionAction = (item: GvmVersionItem) =>
    startTask(() =>
      GvmSetup.versionAction(item, item.installed ? 'uninstall' : 'install', xtermDom.value!)
    )
  const setVersionDefault = (item: GvmVersionItem) =>
    startTask(() => GvmSetup.versionAction(item, 'default', xtermDom.value!))

  const columns: Column<GvmVersionItem>[] = [
    {
      key: 'version',
      title: I18nT('base.version'),
      dataKey: 'version',
      class: 'flex-1',
      headerClass: 'flex-1',
      width: 0,
      headerCellRenderer: () => (
        <div class="w-full flex items-center gap-3">
          <span class="inline-flex items-center py-[2px] flex-shrink-0">
            {I18nT('base.version')}
          </span>
          <ElInput
            v-model={GvmSetup.searchKey}
            style={{ width: '188px' }}
            size="small"
            placeholder={I18nT('common.action.search')}
            clearable={true}
          />
        </div>
      ),
      cellRenderer: ({ rowData: row }) => <span class="pl-12">{row.version}</span>
    },
    {
      key: 'installed',
      title: I18nT('base.isInstalled'),
      dataKey: 'installed',
      class: 'flex-shrink-0',
      headerClass: 'flex-shrink-0',
      width: 150,
      align: 'center',
      cellRenderer: ({ rowData: row }) =>
        row.installed ? (
          <div class="cell-status">
            <YbIcon svg={import('@/svg/ok.svg?raw')} class="installed" />
          </div>
        ) : (
          <span></span>
        )
    },
    {
      key: 'default',
      title: I18nT('common.value.default'),
      dataKey: 'isDefault',
      class: 'flex-shrink-0',
      headerClass: 'flex-shrink-0',
      width: 150,
      align: 'center',
      cellRenderer: ({ rowData: row }) => {
        if (row.isDefault) {
          return (
            <ElButton link type="primary">
              <YbIcon svg={import('@/svg/select.svg?raw')} width="18" height="18" />
            </ElButton>
          )
        }
        if (row.installed) {
          return (
            <ElButton
              class="current-set row-hover-show"
              link
              onClick={(event: MouseEvent) => {
                event.stopPropagation()
                setVersionDefault(row)
              }}
            >
              <YbIcon
                class="current-not"
                svg={import('@/svg/select.svg?raw')}
                width="18"
                height="18"
              />
            </ElButton>
          )
        }
        return <span></span>
      }
    },
    {
      key: 'operation',
      title: I18nT('common.label.action'),
      dataKey: 'operation',
      class: 'flex-shrink-0',
      headerClass: 'flex-shrink-0',
      width: 150,
      align: 'center',
      cellRenderer: ({ rowData: row }) => {
        return (
          <ElButton
            type="primary"
            link
            disabled={GvmSetup.installing}
            onClick={() => doVersionAction(row)}
          >
            {row.installed ? I18nT('common.action.uninstall') : I18nT('base.install')}
          </ElButton>
        )
      }
    }
  ]

  const taskConfirm = () => {
    GvmSetup.installing = false
    GvmSetup.installEnd = false
    GvmSetup.xterm?.destroy()
    delete GvmSetup.xterm
    GvmSetup.checkGvm()
  }
  const taskCancel = () => {
    GvmSetup.installing = false
    GvmSetup.installEnd = false
    GvmSetup.xterm?.stop()?.then(() => {
      GvmSetup.xterm?.destroy()
      delete GvmSetup.xterm
    })
  }

  onMounted(() => {
    if (GvmSetup.installing) {
      nextTick().then(() => {
        const xterm = GvmSetup.xterm as XTerm | undefined
        if (xterm && xtermDom.value) xterm.mount(xtermDom.value).catch()
      })
    }
  })
  onUnmounted(() => GvmSetup.xterm?.unmounted?.())
</script>
