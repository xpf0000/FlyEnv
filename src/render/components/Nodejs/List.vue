<template>
  <template v-if="showInstall">
    <ToolInstall />
  </template>
  <template v-else>
    <el-card class="version-manager">
      <template #header>
        <div class="card-header">
          <div class="left">
            <span> {{ $t('base.currentVersionLib') }} </span>
            <el-select v-model="currentTool" style="margin-left: 8px">
              <el-option value="fnm" label="fnm" :disabled="!tool || tool === 'nvm'"></el-option>
              <el-option value="nvm" label="nvm" :disabled="!tool || tool === 'fnm'"></el-option>
            </el-select>
          </div>
          <el-button class="button" :disabled="!tool || !currentTool" link @click="resetData">
            <yb-icon
              :svg="import('@/svg/icon_refresh.svg?raw')"
              class="refresh-icon"
              :class="{ 'fa-spin': loading }"
            ></yb-icon>
          </el-button>
        </div>
      </template>
      <el-table v-loading="loading" class="nodejs-table" :data="tableData">
        <el-table-column :label="$t('base.version')" prop="version">
          <template #header>
            <div class="w-p100 name-cell">
              <span style="display: inline-flex; align-items: center; padding: 2px 0">{{
                $t('base.version')
              }}</span>
              <el-input v-model.trim="search" placeholder="search" clearable></el-input>
            </div>
          </template>
          <template #default="scope">
            <span
              style="display: inline-flex; align-items: center; padding: 2px 12px 2px 50px"
              :class="{ current: currentItem?.current === scope.row.version }"
              >{{ scope.row.version }}</span
            >
          </template>
        </el-table-column>
        <el-table-column :label="$t('util.nodeListCellCurrent')" :prop="null" align="center">
          <template #default="scope">
            <template v-if="currentItem?.current === scope.row.version">
              <el-button link>
                <yb-icon
                  class="current"
                  :svg="import('@/svg/select.svg?raw')"
                  width="17"
                  height="17"
                />
              </el-button>
            </template>
            <template v-else-if="scope.row.installed">
              <template v-if="scope.row.switching">
                <el-button :loading="true" link></el-button>
              </template>
              <template v-else>
                <el-button
                  v-if="!switching"
                  link
                  class="current-set"
                  @click.stop="doUse(scope.row)"
                >
                  <yb-icon
                    class="current-not"
                    :svg="import('@/svg/select.svg?raw')"
                    width="20"
                    height="20"
                  />
                </el-button>
              </template>
            </template>
          </template>
        </el-table-column>
        <el-table-column :label="$t('util.nodeListCellInstalled')" :prop="null" align="center">
          <template #default="scope">
            <template v-if="scope.row.installed">
              <el-button link>
                <yb-icon
                  class="installed"
                  :svg="import('@/svg/select.svg?raw')"
                  width="20"
                  height="20"
                />
              </el-button>
            </template>
          </template>
        </el-table-column>
        <el-table-column :label="$t('base.operation')" width="140px" :prop="null" align="center">
          <template #default="scope">
            <template v-if="scope.row.installing">
              <el-button :loading="true" link></el-button>
            </template>
            <template v-else>
              <template v-if="scope.row.installed">
                <el-button
                  type="primary"
                  link
                  @click.stop="doInstallOrUninstall('uninstall', scope.row)"
                  >{{ $t('base.uninstall') }}</el-button
                >
              </template>
              <template v-else>
                <el-button
                  type="primary"
                  link
                  @click.stop="doInstallOrUninstall('install', scope.row)"
                  >{{ $t('base.install') }}</el-button
                >
              </template>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </template>
</template>

<script lang="ts" setup>
  import { ref, computed, watch, type ComputedRef } from 'vue'
  import { AppStore } from '@/store/app'
  import { type NodeJSItem, NodejsStore } from '@/components/Nodejs/node'
  import ToolInstall from '@/components/Nodejs/ToolInstall.vue'

  const search = ref('')
  const nodejsStore = NodejsStore()
  const appStore = AppStore()

  const tool = computed({
    get() {
      return nodejsStore.tool
    },
    set(v) {
      nodejsStore.tool = v
    }
  })
  const currentTool = computed({
    get() {
      return appStore.config.setup.currentNodeTool
    },
    set(v) {
      if (v !== appStore.config.setup.currentNodeTool) {
        appStore.config.setup.currentNodeTool = v
        appStore.saveConfig()
      }
    }
  })
  const loading = computed(() => {
    const flag: any = currentTool.value
    return nodejsStore.fetching[flag]
  })

  const currentItem: ComputedRef<NodeJSItem | undefined> = computed(() => {
    if (!currentTool.value) {
      return undefined
    }
    return nodejsStore?.[currentTool.value]
  })

  const tableData = computed(() => {
    if (!currentTool.value) {
      return []
    }
    const locals =
      currentItem?.value?.local.map((v) => {
        return {
          version: v,
          installed: true
        }
      }) ?? []
    const remotas =
      currentItem?.value?.all
        .filter((a) => !currentItem?.value?.local?.includes(a))
        .map((v) => {
          return {
            version: v,
            installed: false
          }
        }) ?? []
    const list = [...locals, ...remotas]
    if (!search.value) {
      return list
    }
    return list.filter((v) => v.version.includes(search.value) || search.value.includes(v.version))
  })

  const switching = computed(() => {
    return nodejsStore.switching
  })

  const showInstall = computed(() => {
    return nodejsStore.showInstall
  })

  const resetData = () => {
    if (!currentTool.value) {
      return
    }
    nodejsStore.fetchData(currentTool.value, true)
  }

  const doUse = (item: any) => {
    console.log('doUse: ', item)
    if (!currentTool.value) {
      return
    }
    const tool = currentTool.value as any
    nodejsStore.versionChange(tool, item)
  }

  const doInstallOrUninstall = (action: 'install' | 'uninstall', item: any) => {
    if (!currentTool.value) {
      return
    }
    const tool = currentTool.value as any
    nodejsStore.installOrUninstall(tool, action, item)
  }

  watch(
    currentTool,
    (v) => {
      if (v) {
        console.log('watch currentTool: ', v)
        nodejsStore.fetchData(v)
      }
    },
    {
      immediate: true
    }
  )

  watch(
    tool,
    (v) => {
      if (v === 'nvm') {
        if (currentTool.value !== 'nvm') {
          currentTool.value = 'nvm'
        }
      } else if (v === 'fnm' || v === 'all') {
        if (currentTool.value !== 'fnm') {
          currentTool.value = 'fnm'
        }
      } else if (!v) {
        currentTool.value = ''
      }
    },
    {
      immediate: true
    }
  )

  nodejsStore.chekTool()
</script>
