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
        <el-button-group class="flex-shrink-0">
          <el-tooltip content="php.ini" :show-after="600">
            <el-button :icon="Memo" @click.stop="showIni"></el-button>
          </el-tooltip>
          <el-tooltip :content="I18nT('base.open')" :show-after="600">
            <el-button
              :icon="Folder"
              :disabled="!installExtensionDir"
              @click.stop="openDir"
            ></el-button>
          </el-tooltip>
        </el-button-group>
      </div>
      <div class="main-wapper">
        <el-card>
          <template #header>
            <div class="card-header">
              <div class="left">
                <el-radio-group v-model="tab" size="small" class="ml-1">
                  <el-radio-button class="flex-1" value="loaded">{{
                    I18nT('php.loadedExtension')
                  }}</el-radio-button>
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

          <template v-if="tab === 'loaded'">
            <LoadedVM :version="version" />
          </template>
          <template v-else-if="tab === 'local'">
            <LocalVM :version="version" />
          </template>
          <template v-else-if="tab === 'lib'">
            <LibVM :version="version" />
          </template>
        </el-card>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { ref, computed, watch } from 'vue'
  import { SoftInstalled } from '@/store/brew'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup, AsyncComponentShow } from '@/util/AsyncComponent'
  import { PHPSetup } from '@/components/PHP/store'
  import { MessageWarning } from '@/util/Element'
  import { Memo, Folder } from '@element-plus/icons-vue'
  import LoadedVM from './Extension/Loaded/index.vue'
  import LocalVM from './Extension/Local/index.vue'
  import LibVM from './Extension/Lib/index.vue'
  import { LoadedSetup } from '@/components/PHP/Extension/Loaded/setup'

  const { shell } = require('@electron/remote')
  const { existsSync } = require('fs-extra')

  const props = defineProps<{
    version: SoftInstalled
  }>()

  const tab = ref('loaded')

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const installExtensionDir = ref('')

  const fetching = computed(() => {
    if (tab.value === 'local') {
      return PHPSetup.localFetching?.[props.version.bin] ?? false
    } else if (tab.value === 'lib') {
      return PHPSetup.libFetching?.[props.version.bin] ?? false
    } else {
      return LoadedSetup.fetching[props.version.bin] ?? false
    }
  })

  console.log('extend version: ', props.version)

  PHPSetup.fetchExtensionDir(props.version as any).then((res) => {
    installExtensionDir.value = res
  })

  watch(
    tab,
    () => {
      if (tab.value === 'local') {
        if (!PHPSetup.localExtend[props.version.bin]?.length) {
          PHPSetup.fetchLocal(props.version as any)
        }
      } else if (tab.value === 'lib') {
        if (!PHPSetup.libExtend[props.version.bin]?.length) {
          PHPSetup.fetchLib(props.version as any)
        }
      } else {
        if (!LoadedSetup.list[props.version.bin]?.length) {
          LoadedSetup.reFetch()
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
    } else if (tab.value === 'lib') {
      PHPSetup.fetchLib(props.version as any)
    } else {
      LoadedSetup.reFetch()
    }
  }

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

  let ConfVM: any
  import('./Config.vue').then((res) => {
    ConfVM = res.default
  })

  const showIni = () => {
    AsyncComponentShow(ConfVM, {
      version: props.version
    }).then()
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
