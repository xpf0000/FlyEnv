<template>
  <el-drawer
    v-model="show"
    size="80%"
    :destroy-on-close="true"
    :with-header="false"
    :close-on-click-modal="false"
    @closed="closedFn"
  >
    <div class="php-extensions">
      <div class="nav">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-15">{{ I18nT('php.phpExtension') }}</span>
        </div>
        <el-button
          type="primary"
          class="shrink0"
          :disabled="!installExtensionDir"
          @click="openDir"
          >{{ I18nT('base.open') }}</el-button
        >
      </div>
      <div class="main-wapper">
        <el-card>
          <template #header>
            <div class="card-header">
              <div class="left">
                <el-radio-group v-model="tab" size="small" class="ml-6">
                  <el-radio-button
                    class="flex-1"
                    :label="I18nT('versionmanager.Local')"
                    value="local"
                  ></el-radio-button>
                  <el-radio-button
                    class="flex-1"
                    :label="I18nT('versionmanager.Library')"
                    value="lib"
                  ></el-radio-button>
                </el-radio-group>
              </div>
              <el-button class="button" :disabled="fetching" link @click="reFetch">
                <yb-icon
                  :svg="import('@/svg/icon_refresh.svg?raw')"
                  class="refresh-icon"
                  :class="{ 'fa-spin': fetching }"
                ></yb-icon>
              </el-button>
            </div>
          </template>
          <el-table
            v-loading="fetching"
            height="100%"
            :data="showTableDataFilter"
            style="width: 100%"
          >
            <el-table-column prop="name" class-name="name-cell-td" :label="I18nT('base.name')">
              <template #header>
                <div class="w-p100 name-cell">
                  <span style="display: inline-flex; padding: 2px 0">{{ I18nT('base.name') }}</span>
                  <el-input v-model.trim="search" placeholder="search" clearable></el-input>
                </div>
              </template>
              <template #default="scope">
                <div style="padding: 2px 0 2px 24px">{{ scope.row.name }}</div>
              </template>
            </el-table-column>
            <el-table-column align="center" :label="I18nT('base.status')">
              <template #default="scope">
                <div class="cell-status">
                  <yb-icon
                    v-if="scope.row.status"
                    :svg="import('@/svg/ok.svg?raw')"
                    class="installed"
                  ></yb-icon>
                </div>
              </template>
            </el-table-column>

            <el-table-column
              width="150px"
              align="left"
              :label="I18nT('base.operation')"
              class-name="operation"
            >
              <template v-if="version?.version" #default="scope">
                <template v-if="scope.row.status">
                  <el-popover :show-after="600" placement="top" width="auto">
                    <template #default>
                      <span>{{ I18nT('base.copyLink') }}</span>
                    </template>
                    <template #reference>
                      <el-button
                        type="primary"
                        link
                        :icon="Link"
                        @click="copyLink(scope.$index, scope.row)"
                      ></el-button>
                    </template>
                  </el-popover>
                  <template v-if="scope.row.name === 'xdebug'">
                    <el-popover :show-after="600" placement="top" width="auto">
                      <template #default>
                        <span>{{ I18nT('php.copyConfTemplate') }}</span>
                      </template>
                      <template #reference>
                        <el-button
                          type="primary"
                          link
                          :icon="Document"
                          @click="copyXDebugTmpl(scope.$index, scope.row)"
                        ></el-button>
                      </template>
                    </el-popover>
                  </template>
                  <el-popover :show-after="600" placement="top" width="auto">
                    <template #default>
                      <span>{{ I18nT('base.del') }}</span>
                    </template>
                    <template #reference>
                      <el-button
                        type="primary"
                        link
                        :icon="Delete"
                        @click="doDel(scope.$index, scope.row)"
                      ></el-button>
                    </template>
                  </el-popover>
                </template>
                <template v-else>
                  <el-popover :show-after="600" placement="top" width="auto">
                    <template #default>
                      <span>{{ I18nT('base.install') }}</span>
                    </template>
                    <template #reference>
                      <el-button
                        :disabled="brewRunning || !version?.version"
                        type="primary"
                        link
                        :icon="Download"
                        @click="handleEdit(scope.$index, scope.row)"
                      ></el-button>
                    </template>
                  </el-popover>
                </template>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { ref, computed, watch } from 'vue'
  import { SoftInstalled } from '@/store/brew'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { PHPSetup } from '@/components/PHP/store'
  import { MessageSuccess, MessageWarning } from '@/util/Element'
  import { Document, Download, Link, Delete } from '@element-plus/icons-vue'

  const { clipboard } = require('@electron/remote')
  const { shell } = require('@electron/remote')
  const { existsSync } = require('fs-extra')

  const props = defineProps<{
    version: SoftInstalled
  }>()

  const tab = ref('local')

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const search = ref('')
  const installExtensionDir = ref('')

  const fetching = computed(() => {
    if (tab.value === 'local') {
      return PHPSetup.localFetching?.[props.version.bin] ?? false
    } else {
      return PHPSetup.libFetching?.[props.version.bin] ?? false
    }
  })

  console.log('extend version: ', props.version)

  PHPSetup.fetchExtensionDir(props.version as any).then((res) => {
    installExtensionDir.value = res
  })

  watch(
    tab,
    (v: any) => {
      if (tab.value === 'local') {
        if (!PHPSetup.localExtend[props.version.bin]?.length) {
          PHPSetup.fetchLocal(props.version as any)
        }
      } else {
        if (!PHPSetup.libExtend[props.version.bin]?.length) {
          PHPSetup.fetchLib(props.version as any)
        }
      }
    },
    {
      immediate: true
    }
  )

  const reFetch = () => {
    if (tab.value === 'local') {
      PHPSetup.fetchLocal(props.version as any)
    } else {
      PHPSetup.fetchLib(props.version as any)
    }
  }

  const showTableDataFilter = computed(() => {
    const sortName = (a: any, b: any) => {
      return a.name - b.name
    }
    const sortStatus = (a: any, b: any) => {
      if (a.status === b.status) {
        return 0
      }
      if (a.status) {
        return -1
      }
      if (b.status) {
        return 1
      }
      return 0
    }
    const used = PHPSetup.localUsed?.[props.version.bin] ?? []
    const local = PHPSetup.localExtend?.[props.version.bin] ?? []

    local.forEach((l: any) => {
      if (used.some((u: any) => u.name === l.name)) {
        l.installed = true
      }
    })

    if (!search.value) {
      return local.sort(sortName).sort(sortStatus)
    }
    return local
      .filter((d: any) => d.name.toLowerCase().includes(search.value.toLowerCase()))
      .sort(sortName)
      .sort(sortStatus)
  })

  const openDir = () => {
    if (!installExtensionDir?.value) {
      return
    }
    if (existsSync(installExtensionDir?.value)) {
      shell.openPath(installExtensionDir?.value)
    } else {
      MessageWarning(I18nT('php.noExtensionsDir'))
    }
  }

  const handleEdit = (index: number, row: any) => {}

  const copyLink = (index: number, row: any) => {
    const pre = row?.extendPre ?? 'extension='
    const txt = `${pre}${row.soPath}`
    clipboard.writeText(txt)
    MessageSuccess(I18nT('php.extensionCopySuccess'))
  }

  const copyXDebugTmpl = (index: number, row: any) => {
    const txt = `[xdebug]
zend_extension = "${row.soPath}"
xdebug.idekey = "PHPSTORM"
xdebug.client_host = localhost
xdebug.client_port = 9003
xdebug.mode = debug
xdebug.profiler_append = 0
xdebug.profiler_output_name = cachegrind.out.%p
xdebug.start_with_request = yes
xdebug.trigger_value=StartProfileForMe
xdebug.output_dir = /tmp`
    clipboard.writeText(txt)
    MessageSuccess(I18nT('php.xdebugConfCopySuccess'))
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
