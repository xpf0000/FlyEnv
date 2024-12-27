<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <el-radio-group v-model="currentTool" size="small">
            <el-radio-button value="nvm">nvm</el-radio-button>
            <el-radio-button value="fnm">fnm</el-radio-button>
          </el-radio-group>
        </div>
        <el-button class="button" :disabled="loading" link @click="resetData">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': loading }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <template #default>
      <el-table v-loading="loading" class="nodejs-table" :data="tableData">
        <el-table-column :label="$t('base.version')" prop="version">
          <template #header>
            <div class="w-p100 name-cell">
              <span style="display: inline-flex; align-items: center; padding: 2px 0">{{
                I18nT('base.version' as any)
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
                  >{{ I18nT('base.uninstall') }}</el-button
                >
              </template>
              <template v-else>
                <el-button
                  type="primary"
                  link
                  @click.stop="doInstallOrUninstall('install', scope.row)"
                  >{{ I18nT('base.install') }}</el-button
                >
              </template>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { ref, computed, watch, type ComputedRef } from 'vue'
  import { AppStore } from '@/store/app'
  import { type NodeJSItem, NodejsStore } from '@/components/Nodejs/node'
  import { I18nT } from '@shared/lang'

  const search = ref('')
  const nodejsStore = NodejsStore()
  const appStore = AppStore()

  const currentTool = computed({
    get(): 'nvm' | 'fnm' {
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
    const flag = currentTool.value
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
      nodejsStore.allVersion.list
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

  const resetData = () => {
    if (loading.value) {
      return
    }
    nodejsStore.fetchData(currentTool.value)
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
</script>
