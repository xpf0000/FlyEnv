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
      <div class="nav pl-3 pr-5">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-3">{{ I18nT('php.phpExtensions') }}</span>
        </div>
        <el-button-group class="flex-shrink-0">
          <el-tooltip content="php.ini" :show-after="600">
            <el-button :icon="Memo" @click.stop="showIni"></el-button>
          </el-tooltip>
          <el-tooltip :content="I18nT('base.open')" :show-after="600">
            <el-button :icon="Folder" :disabled="!extensionDir" @click.stop="openDir"></el-button>
          </el-tooltip>
        </el-button-group>
      </div>
      <div class="main-wapper p-3">
        <el-card>
          <template #header>
            <div class="card-header">
              <div class="left">
                <template v-if="isMacOS">
                  <el-radio-group v-model="lib" size="small">
                    <el-radio-button value="loaded">{{
                      I18nT('php.loadedExtensions')
                    }}</el-radio-button>
                    <template v-if="isHomeBrew">
                      <el-radio-button value="homebrew">Homebrew</el-radio-button>
                    </template>
                    <template v-else-if="isMacPorts">
                      <el-radio-button value="macports">Macports</el-radio-button>
                    </template>
                    <template v-else-if="!isStatic">
                      <el-radio-button value="flyenv">{{ I18nT('base.default') }}</el-radio-button>
                    </template>
                  </el-radio-group>
                </template>
                <template v-else-if="isWindows">
                  <el-radio-group v-model="lib" size="small">
                    <el-radio-button class="flex-1" value="loaded">{{
                      I18nT('php.loadedExtensions')
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
                </template>
                <template v-else-if="isLinux">
                  <el-radio-group v-model="lib" size="small">
                    <el-radio-button value="loaded">{{
                      I18nT('php.loadedExtensions')
                    }}</el-radio-button>
                    <template v-if="isHomeBrew">
                      <el-radio-button value="homebrew">Homebrew</el-radio-button>
                    </template>
                  </el-radio-group>
                </template>
              </div>
              <el-button class="button" :disabled="loading" link @click="reFetch">
                <yb-icon
                  :svg="import('@/svg/icon_refresh.svg?raw')"
                  class="refresh-icon"
                  :class="{ 'fa-spin': loading }"
                ></yb-icon>
              </el-button>
            </div>
          </template>

          <template v-if="lib === 'loaded'">
            <LoadedVM :version="version" />
          </template>
          <template v-else-if="lib === 'homebrew'">
            <BrewVM :version="version" />
          </template>
          <template v-else-if="lib === 'macports'">
            <PortsVM :version="version" />
          </template>
          <template v-else-if="lib === 'local'">
            <LocalVM :version="version" />
          </template>
          <template v-else-if="lib === 'lib'">
            <LibVM :version="version" />
          </template>
          <template v-else-if="lib === 'flyenv'"> </template>

          <template v-if="showFooter" #footer>
            <template v-if="taskEnd">
              <el-button type="primary" @click.stop="taskConfirm">{{
                I18nT('base.confirm')
              }}</el-button>
            </template>
            <template v-else>
              <el-button @click.stop="taskCancel">{{ I18nT('base.cancel') }}</el-button>
            </template>
          </template>
        </el-card>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import { type SoftInstalled } from '@/store/brew'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup, AsyncComponentShow } from '@/util/AsyncComponent'
  import BrewVM from './Extension/Homebrew/index.vue'
  import LoadedVM from './Extension/Loaded/index.vue'
  import PortsVM from './Extension/Macports/index.vue'
  import { Setup } from '@/components/PHP/Extension/setup'
  import { join } from '@/util/path-browserify'
  import { fs } from '@/util/NodeFn'
  import { Folder, Memo } from '@element-plus/icons-vue'
  import LocalVM from './Extension/Local/index.vue'
  import LibVM from './Extension/Lib/index.vue'

  const props = defineProps<{
    version: SoftInstalled
  }>()

  const isMacOS = computed(() => {
    return window.Server.isMacOS
  })
  const isWindows = computed(() => {
    return window.Server.isWindows
  })
  const isLinux = computed(() => {
    return window.Server.isLinux
  })

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const {
    lib,
    showFooter,
    taskEnd,
    taskConfirm,
    taskCancel,
    loading,
    reFetch,
    extensionDir,
    openDir
  } = Setup(props.version)

  const isMacPorts = computed(() => {
    return props.version?.flag === 'macports'
  })
  const isHomeBrew = computed(() => {
    return props.version?.path?.includes(window.Server?.BrewCellar ?? '-----')
  })
  const exists = ref(false)
  watch(
    () => props.version?.phpConfig ?? join(props.version?.path, 'bin/php-config'),
    (v) => {
      fs.existsSync(v).then((res) => {
        exists.value = res
      })
    },
    {
      immediate: true
    }
  )
  const isStatic = computed(() => {
    const pkconfig = props.version?.phpConfig ?? join(props.version?.path, 'bin/php-config')
    return !pkconfig || !exists.value
  })

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
