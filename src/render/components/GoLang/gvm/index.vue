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
      <el-table height="100%" :data="versionList" :border="false" style="width: 100%">
        <el-table-column prop="version">
          <template #header>
            <div class="w-full flex items-center gap-3">
              <span class="inline-flex items-center py-[2px] flex-shrink-0">{{
                I18nT('base.version')
              }}</span>
              <el-input
                v-model.trim="GvmSetup.searchKey"
                style="width: 188px"
                size="small"
                :placeholder="I18nT('common.action.search')"
                clearable
              />
            </div>
          </template>
          <template #default="scope"><span class="pl-12">{{ scope.row.version }}</span></template>
        </el-table-column>
        <el-table-column align="center" :label="I18nT('base.isInstalled')" width="150">
          <template #default="scope">
            <div class="cell-status">
              <yb-icon
                v-if="scope.row.installed"
                :svg="import('@/svg/ok.svg?raw')"
                class="installed"
              />
            </div>
          </template>
        </el-table-column>
        <el-table-column align="center" :label="I18nT('common.value.default')" width="150">
          <template #default="scope">
            <el-button v-if="scope.row.isDefault" link type="primary">
              <yb-icon :svg="import('@/svg/select.svg?raw')" width="18" height="18" />
            </el-button>
            <el-button
              v-else-if="scope.row.installed"
              class="current-set row-hover-show"
              link
              @click.stop="setVersionDefault(scope.row)"
            >
              <yb-icon
                class="current-not"
                :svg="import('@/svg/select.svg?raw')"
                width="18"
                height="18"
              />
            </el-button>
          </template>
        </el-table-column>
        <el-table-column align="center" :label="I18nT('common.label.action')" width="150">
          <template #default="scope">
            <el-button
              v-if="!scope.row.installed || (scope.row.installed && !scope.row.isDefault)"
              type="primary"
              link
              :disabled="GvmSetup.installing"
              @click="doVersionAction(scope.row)"
            >
              {{
                scope.row.installed ? I18nT('common.action.uninstall') : I18nT('base.install')
              }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>
    <template v-if="GvmSetup.installing" #footer>
      <el-button v-if="GvmSetup.installEnd" type="primary" @click.stop="taskConfirm">
        {{ I18nT('base.confirm') }}
      </el-button>
      <el-button v-else @click.stop="taskCancel">{{ I18nT('base.cancel') }}</el-button>
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
  import type { GvmVersionItem } from '@shared/Gvm'
  import { I18nT } from '@lang/index'
  import XTerm from '@/util/XTerm'
  import { GvmSetup } from './setup'

  const xtermDom = ref<HTMLElement>()
  GvmSetup.checkGvm()

  const refreshDisabled = computed(() => GvmSetup.fetching || GvmSetup.installing)
  const versionList = computed(() => {
    const key = GvmSetup.searchKey.trim()
    const list = key
      ? GvmSetup.versions.filter(
          (item) => item.version.includes(key) || item.name.includes(key)
        )
      : [...GvmSetup.versions]
    return list.sort((a, b) => Number(b.installed) - Number(a.installed))
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
