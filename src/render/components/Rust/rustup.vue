<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> Rustup </span>
          <el-radio-group v-model="RustupSetup.tab" size="small" class="ml-6">
            <el-radio-button class="flex-1" label="version" value="version"></el-radio-button>
            <el-radio-button class="flex-1" label="target" value="target"></el-radio-button>
          </el-radio-group>
        </div>
        <el-button class="button" link :disabled="refreshDisable" @click="RustupSetup.fetchData()">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': refreshDisable }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <temaplte v-if="RustupSetup.installing">
      <div class="w-full h-full overflow-hidden p-5">
        <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
      </div>
    </temaplte>
    <template v-else-if="RustupSetup.installed === false">
      <div class="w-full h-full flex flex-col items-center justify-center p-10 gap-5">
        <span>Install Rustup?</span>
        <el-button type="primary" @click.stop="doInstall">{{ I18nT('base.confirm') }}</el-button>
      </div>
    </template>
    <template v-else>
      <template v-if="RustupSetup.tab === 'version'">
        <el-table height="100%" :data="versionList" :border="false" style="width: 100%">
          <el-table-column prop="version">
            <template #header>
              <div class="w-full flex items-center gap-3">
                <span class="inline-flex items-center py-[2px] flex-shrink-0">{{
                  I18nT('base.version')
                }}</span>
                <el-input
                  v-model.trim="RustupSetup.versionSearchKey"
                  style="width: 188px"
                  class="w-[188px]"
                  size="small"
                  :placeholder="I18nT('base.placeholderSearch')"
                  clearable
                ></el-input>
              </div>
            </template>
            <template #default="scope">
              <span
                :class="{
                  'cursor-pointer hover:text-yellow-500': scope.row.isInstalled
                }"
                class="pl-12"
                @click.stop="scope.row.isInstalled ? showVersionDir(scope.row) : null"
                >{{ scope.row.version }}</span
              >
            </template>
          </el-table-column>
          <el-table-column align="center" :label="I18nT('base.isInstalled')" width="150">
            <template #default="scope">
              <div class="cell-status">
                <yb-icon
                  v-if="scope.row.isInstalled"
                  :svg="import('@/svg/ok.svg?raw')"
                  class="installed"
                ></yb-icon>
              </div>
            </template>
          </el-table-column>
          <el-table-column align="center" :label="I18nT('base.default')" width="150">
            <template #default="scope">
              <template v-if="scope.row.isDefault">
                <el-button link type="primary">
                  <yb-icon :svg="import('@/svg/select.svg?raw')" width="18" height="18" />
                </el-button>
              </template>
              <template v-else-if="scope.row.isInstalled">
                <el-button class="current-set row-hover-show" link @click.stop="">
                  <yb-icon
                    class="current-not"
                    :svg="import('@/svg/select.svg?raw')"
                    width="18"
                    height="18"
                    @click.stop="setVersionDefault(scope.row)"
                  />
                </el-button>
              </template>
            </template>
          </el-table-column>
          <el-table-column align="center" :label="I18nT('base.action')" width="150">
            <template #default="scope">
              <el-button
                type="primary"
                link
                :loading="RustupSetup.installing"
                :disabled="RustupSetup.installing"
                @click="doVersionAction(scope.row)"
                >{{
                  scope.row.isInstalled ? I18nT('base.uninstall') : I18nT('base.install')
                }}</el-button
              >
            </template>
          </el-table-column>
        </el-table>
      </template>
      <template v-else-if="RustupSetup.tab === 'target'">
        <el-table height="100%" :data="targetList" :border="false" style="width: 100%">
          <el-table-column prop="version">
            <template #header>
              <div class="w-full flex items-center gap-3">
                <span class="inline-flex items-center py-[2px] flex-shrink-0">target</span>
                <el-input
                  v-model.trim="RustupSetup.targetSearchKey"
                  class="w-[188px]"
                  size="small"
                  :placeholder="I18nT('base.placeholderSearch')"
                  clearable
                ></el-input>
              </div>
            </template>
            <template #default="scope">
              <span
                class="hover:text-yellow-500 pl-12"
                @click.stop="clipboard.writeText(scope.row.name)"
                >{{ scope.row.name }}</span
              >
            </template>
          </el-table-column>
          <el-table-column align="center" :label="I18nT('base.isInstalled')" width="150">
            <template #default="scope">
              <div class="cell-status">
                <yb-icon
                  v-if="scope.row.installed"
                  :svg="import('@/svg/ok.svg?raw')"
                  class="installed"
                ></yb-icon>
              </div>
            </template>
          </el-table-column>
          <el-table-column align="center" :label="I18nT('base.action')" width="150">
            <template #default="scope">
              <el-button
                type="primary"
                link
                :disabled="RustupSetup.installing"
                @click="doTargetAction(scope.row)"
                >{{
                  scope.row.installed ? I18nT('base.uninstall') : I18nT('base.install')
                }}</el-button
              >
            </template>
          </el-table-column>
        </el-table>
      </template>
    </template>
    <template v-if="showFooter" #footer>
      <template v-if="taskEnd">
        <el-button type="primary" @click.stop="taskConfirm">{{ I18nT('base.confirm') }}</el-button>
      </template>
      <template v-else>
        <el-button @click.stop="taskCancel">{{ I18nT('base.cancel') }}</el-button>
      </template>
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { RustupSetup } from './setup'
  import XTerm from '@/util/XTerm'
  import { BrewStore } from '@/store/brew'
  import { shell, clipboard } from '@/util/NodeFn'

  const xtermDom = ref<HTMLElement>()

  RustupSetup.checkRustup()

  const brewStore = BrewStore()
  const module = brewStore.module('rust')
  if (module.static.length === 0 && !module.staticFetching) {
    module.fetchStatic()
  }

  const versionList = computed(() => {
    const defaultItem = RustupSetup.toolchainList.find((t) => t.isDefault)
    const versions = RustupSetup.toolchainList.map((m) => m.version)
    let list: any[] = []
    if (!defaultItem) {
      list = module.static.map((m) => {
        const isInstalled = versions.includes(m.version)
        return {
          ...m,
          isInstalled
        }
      })
    } else {
      list = module.static.map((m) => {
        const isDefault = m.version === defaultItem.version
        const isInstalled = versions.includes(m.version)
        let name = m.name
        if (isInstalled) {
          name = RustupSetup.toolchainList.find((t) => t.version === m.version)?.name ?? ''
        }
        return {
          ...m,
          name,
          isDefault,
          isInstalled
        }
      })
    }
    const key = RustupSetup.versionSearchKey.trim()
    if (key) {
      return list.filter((l) => l.version.includes(key))
    }
    return list.sort((a, b) => {
      const i = a.isInstalled ? 1 : 0
      const j = b.isInstalled ? 1 : 0
      return j - i
    })
  })

  const targetList = computed(() => {
    const key = RustupSetup.targetSearchKey.trim()
    const sort = (a: any, b: any) => {
      const i = a.installed ? 1 : 0
      const j = b.installed ? 1 : 0
      return j - i
    }
    if (key) {
      return RustupSetup.targetList.filter((l) => l.name.includes(key)).sort(sort)
    }
    return RustupSetup.targetList.sort(sort)
  })

  const refreshDisable = computed(() => {
    return RustupSetup.fetching || RustupSetup.installing
  })

  const showFooter = computed(() => {
    return RustupSetup.installing
  })

  const taskEnd = computed(() => {
    return RustupSetup.installEnd
  })

  const showVersionDir = (item: any) => {
    const dir = RustupSetup.toolchainList.find((t) => t.version === item.version)?.path
    shell.showItemInFolder(dir).catch()
  }

  const taskConfirm = () => {
    RustupSetup.installing = false
    RustupSetup.installEnd = false
    RustupSetup.xterm?.destroy()
    delete RustupSetup.xterm
    RustupSetup.fetchData()
  }

  const taskCancel = () => {
    RustupSetup.installing = false
    RustupSetup.installEnd = false
    RustupSetup.xterm?.stop()?.then(() => {
      RustupSetup.xterm?.destroy()
      delete RustupSetup.xterm
    })
  }

  const doInstall = () => {
    RustupSetup.installing = true
    nextTick(() => {
      RustupSetup.installRustup(xtermDom.value!).catch()
    })
  }

  const doVersionAction = (item: any) => {
    RustupSetup.installing = true
    nextTick(() => {
      const action = item?.isInstalled ? 'uninstall' : 'install'
      RustupSetup.versionAction(item, action, xtermDom.value!).catch()
    })
  }

  const doTargetAction = (item: any) => {
    RustupSetup.installing = true
    nextTick(() => {
      const action = item?.installed ? 'remove' : 'add'
      RustupSetup.tagertAction(item, action, xtermDom.value!).catch()
    })
  }

  const setVersionDefault = (item: any) => {
    RustupSetup.installing = true
    nextTick(() => {
      console.log('setVersionDefault xtermDom.value: ', xtermDom.value!)
      RustupSetup.versionDefault(item, xtermDom.value!).catch()
    })
  }

  onMounted(() => {
    if (RustupSetup.installing) {
      nextTick().then(() => {
        const execXTerm: XTerm = RustupSetup.xterm as any
        if (execXTerm && xtermDom.value) {
          execXTerm.mount(xtermDom.value).then().catch()
        }
      })
    }
  })

  onUnmounted(() => {
    RustupSetup?.xterm?.unmounted?.()
  })
</script>
