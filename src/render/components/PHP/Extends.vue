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
          <template v-if="tab === 'local'">
            <el-table
              v-loading="fetching"
              height="100%"
              :data="showTableDataFilter"
              style="width: 100%"
            >
              <el-table-column prop="name" class-name="name-cell-td" :label="I18nT('base.name')">
                <template #header>
                  <div class="w-p100 name-cell">
                    <span style="display: inline-flex; padding: 2px 0">{{
                      I18nT('base.name')
                    }}</span>
                    <el-input v-model.trim="search" placeholder="search" clearable></el-input>
                  </div>
                </template>
                <template #default="scope">
                  <div
                    style="padding: 2px 0 2px 24px"
                    class="hover:text-yellow-500"
                    @click.stop="showDLL(scope.row)"
                    >{{ scope.row.name }}</div
                  >
                </template>
              </el-table-column>
              <el-table-column align="center" :label="I18nT('base.status')">
                <template #default="scope">
                  <template v-if="PHPSetup.localExecing[scope.row.name]">
                    <el-button :loading="true" link></el-button>
                  </template>
                  <template v-else-if="scope.row.installed">
                    <el-button
                      link
                      type="primary"
                      @click.stop="PHPSetup.localExec(scope.row, version)"
                    >
                      <yb-icon
                        style="padding: 6px"
                        :svg="import('@/svg/select.svg?raw')"
                        width="29"
                        height="29"
                      />
                    </el-button>
                  </template>
                  <template v-else>
                    <el-button
                      link
                      class="php-extension-nouse-btn"
                      @click.stop="PHPSetup.localExec(scope.row, version)"
                    >
                      <yb-icon
                        style="padding: 6px"
                        :svg="import('@/svg/select.svg?raw')"
                        width="29"
                        height="29"
                      />
                    </el-button>
                  </template>
                </template>
              </el-table-column>
            </el-table>
          </template>
          <template v-else>
            <el-table
              v-loading="fetching"
              height="100%"
              :data="showTableLibFilter"
              style="width: 100%"
            >
              <el-table-column prop="name" class-name="name-cell-td" :label="I18nT('base.name')">
                <template #header>
                  <div class="w-p100 name-cell">
                    <span style="display: inline-flex; padding: 2px 0">{{
                      I18nT('base.name')
                    }}</span>
                    <el-input v-model.trim="search" placeholder="search" clearable></el-input>
                  </div>
                </template>
                <template #default="scope">
                  <div
                    style="padding: 2px 0 2px 24px"
                    class="hover:text-yellow-500"
                    @click.stop="toURL(scope.row)"
                    >{{ scope.row.name }}</div
                  >
                </template>
              </el-table-column>
              <el-table-column align="center" :label="I18nT('base.status')">
                <template #default="scope">
                  <template v-if="PHPSetup.libExecing[scope.row.name]">
                    <el-button :loading="true" link></el-button>
                  </template>
                  <template v-else-if="scope.row.installed">
                    <el-button
                      link
                      type="primary"
                      @click.stop="PHPSetup.libExec(scope.row, version)"
                    >
                      <yb-icon
                        style="padding: 6px"
                        :svg="import('@/svg/select.svg?raw')"
                        width="29"
                        height="29"
                      />
                    </el-button>
                  </template>
                  <template v-else>
                    <el-button
                      link
                      class="php-extension-nouse-btn"
                      @click.stop="PHPSetup.libExec(scope.row, version)"
                    >
                      <yb-icon
                        style="padding: 6px"
                        :svg="import('@/svg/select.svg?raw')"
                        width="29"
                        height="29"
                      />
                    </el-button>
                  </template>
                </template>
              </el-table-column>
            </el-table>
          </template>
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

  const { shell } = require('@electron/remote')
  const { existsSync } = require('fs-extra')
  const { join } = require('path')

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
  const sortName = (a: any, b: any) => {
    return a.name.toLowerCase() - b.name.toLowerCase()
  }
  const sortStatus = (a: any, b: any) => {
    if (a.installed === b.installed) {
      return 0
    }
    if (a.installed) {
      return -1
    }
    if (b.installed) {
      return 1
    }
    return 0
  }

  const showTableDataFilter = computed(() => {
    const used = PHPSetup.localUsed?.[props.version.bin] ?? []
    const local = PHPSetup.localExtend?.[props.version.bin] ?? []
    local.forEach((l: any) => {
      l.installed = used.some((u: any) => u.name === l.name)
    })
    if (!search.value) {
      return local.sort(sortName).sort(sortStatus)
    }
    return local
      .filter((d: any) => d.name.toLowerCase().includes(search.value.toLowerCase()))
      .sort(sortName)
      .sort(sortStatus)
  })

  const showTableLibFilter = computed(() => {
    const used = PHPSetup.localUsed?.[props.version.bin] ?? []
    let lib = PHPSetup.libExtend?.[props.version.bin] ?? []
    const phpVersion = props.version.version!.split('.').slice(0, 2).join('.')
    lib = lib.filter((l: any) => {
      return l.versions?.[phpVersion]?.length > 0
    })
    lib.forEach((l: any) => {
      l.installed = used.some((u: any) => u.name === `php_${l.name}`.toLowerCase())
    })
    if (!search.value) {
      return lib.sort(sortName).sort(sortStatus)
    }
    return lib
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

  const toURL = (item: any) => {
    shell.openExternal(item.url)
  }

  const showDLL = (item: any) => {
    if (!installExtensionDir?.value) {
      return
    }
    const dll = join(installExtensionDir?.value, `${item.name}.dll`)
    if (existsSync(dll)) {
      shell.showItemInFolder(dll)
    }
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
<style lang="scss">
  .php-extensions {
    .el-table {
      tr {
        .php-extension-nouse-btn {
          display: none;
        }

        &:hover {
          .php-extension-nouse-btn {
            display: inline-flex;
          }
        }
      }
    }
  }
</style>
