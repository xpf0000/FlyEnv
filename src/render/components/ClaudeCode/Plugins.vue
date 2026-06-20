<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left flex items-center">
          <span>{{ I18nT('claudeCode.plugins') }}</span>
          <el-radio-group v-model="pluginTab" size="small" class="ml-4">
            <el-radio-button value="installed">{{ I18nT('claudeCode.installed') }}</el-radio-button>
            <el-radio-button value="available">{{ I18nT('claudeCode.available') }}</el-radio-button>
          </el-radio-group>
        </div>
        <el-button
          link
          :disabled="ClaudeCodeSetup.pluginsLoading || ClaudeCodeSetup.installing"
          @click="ClaudeCodeSetup.refreshPlugins()"
        >
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="w-[24px] h-[24px]"
            :class="{ 'fa-spin': ClaudeCodeSetup.pluginsLoading || ClaudeCodeSetup.installing }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <div class="w-full h-full overflow-hidden">
      <template v-if="ClaudeCodeSetup.installing">
        <div class="w-full h-full overflow-hidden p-5">
          <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
        </div>
      </template>
      <template v-else>
        <div class="p-5 h-full overflow-hidden flex flex-col">
          <el-input
            v-model="search"
            :placeholder="I18nT('claudeCode.searchPlugin')"
            clearable
            class="mb-3"
          />
          <div v-loading="ClaudeCodeSetup.pluginsLoading" class="flex-1 overflow-hidden">
            <el-scrollbar v-if="filteredPlugins.length > 0">
              <div v-for="item in filteredPlugins" :key="item.pluginId" class="plugin-row">
                <div class="plugin-info">
                  <div class="plugin-title">
                    <span class="name">{{ item.name }}</span>
                    <el-tag v-if="item.marketplaceName" size="small" type="info" class="ml-2">{{
                      item.marketplaceName
                    }}</el-tag>
                    <el-tag
                      v-if="item.installed"
                      size="small"
                      :type="item.enabled ? 'success' : 'warning'"
                      class="ml-2"
                      >{{
                        item.enabled ? I18nT('claudeCode.enabled') : I18nT('claudeCode.disabled')
                      }}</el-tag
                    >
                    <span v-if="item.installCount" class="install-count">{{
                      item.installCount
                    }}</span>
                  </div>
                  <div class="plugin-desc">
                    <el-tooltip
                      :content="item.description"
                      placement="top"
                      :show-after="300"
                      :disabled="!item.description"
                    >
                      <span>{{ item.description }}</span>
                    </el-tooltip>
                  </div>
                </div>
                <div class="plugin-actions">
                  <template v-if="item.installed">
                    <el-tooltip
                      v-if="item.enabled"
                      :content="I18nT('claudeCode.disable')"
                      placement="top"
                      :show-after="300"
                    >
                      <el-button
                        link
                        :icon="VideoPause"
                        @click="ClaudeCodeSetup.disablePlugin(item.pluginId)"
                      />
                    </el-tooltip>
                    <el-tooltip
                      v-else
                      :content="I18nT('claudeCode.enable')"
                      placement="top"
                      :show-after="300"
                    >
                      <el-button
                        link
                        type="success"
                        :icon="VideoPlay"
                        @click="ClaudeCodeSetup.enablePlugin(item.pluginId)"
                      />
                    </el-tooltip>
                    <el-tooltip
                      :content="I18nT('claudeCode.uninstall')"
                      placement="top"
                      :show-after="300"
                    >
                      <el-button
                        link
                        type="danger"
                        :icon="Delete"
                        @click="confirmUninstall(item.pluginId)"
                      />
                    </el-tooltip>
                  </template>
                  <template v-else>
                    <el-tooltip :content="I18nT('base.install')" placement="top" :show-after="300">
                      <el-button
                        link
                        type="primary"
                        :icon="Download"
                        @click="installPlugin(item.pluginId)"
                      />
                    </el-tooltip>
                  </template>
                </div>
              </div>
            </el-scrollbar>
            <el-empty v-else-if="!ClaudeCodeSetup.pluginsLoading" />
          </div>
        </div>
      </template>
    </div>
    <template v-if="ClaudeCodeSetup.installing" #footer>
      <template v-if="ClaudeCodeSetup.installEnd">
        <el-button type="primary" @click.stop="ClaudeCodeSetup.taskConfirm()">{{
          I18nT('base.confirm')
        }}</el-button>
      </template>
      <template v-else>
        <el-button @click.stop="ClaudeCodeSetup.taskCancel()">{{ I18nT('base.cancel') }}</el-button>
      </template>
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { ref, computed, onMounted, nextTick, onUnmounted } from 'vue'
  import { I18nT } from '@lang/index'
  import { ClaudeCodeSetup } from './setup'
  import { ElMessageBox } from 'element-plus'
  import { VideoPlay, VideoPause, Delete, Download } from '@element-plus/icons-vue'
  import XTerm from '@/util/XTerm'

  const search = ref('')
  const xtermDom = ref()

  const pluginTab = computed({
    get() {
      return ClaudeCodeSetup.pluginTab
    },
    set(value: 'installed' | 'available') {
      ClaudeCodeSetup.pluginTab = value
    }
  })

  const filteredPlugins = computed(() => {
    const list =
      pluginTab.value === 'installed'
        ? ClaudeCodeSetup.installedPlugins
        : ClaudeCodeSetup.availablePlugins
    if (!search.value) {
      return list
    }
    const keyword = search.value.toLowerCase()
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(keyword) ||
        p.description.toLowerCase().includes(keyword) ||
        p.marketplaceName.toLowerCase().includes(keyword)
    )
  })

  const installPlugin = (pluginId: string) => {
    ClaudeCodeSetup.installPlugin(pluginId, xtermDom)
  }

  const confirmUninstall = (pluginId: string) => {
    ElMessageBox.confirm(
      I18nT('claudeCode.uninstallConfirm', { name: pluginId }),
      I18nT('base.delAlertTitle'),
      {
        confirmButtonText: I18nT('base.confirm'),
        cancelButtonText: I18nT('base.cancel'),
        type: 'warning'
      }
    )
      .then(() => {
        ClaudeCodeSetup.uninstallPlugin(pluginId)
      })
      .catch(() => {})
  }

  onMounted(() => {
    if (ClaudeCodeSetup.installing) {
      nextTick().then(() => {
        const execXTerm: XTerm = ClaudeCodeSetup.xterm as any
        if (execXTerm && xtermDom.value) {
          execXTerm.mount(xtermDom.value).then().catch()
        }
      })
    }
    ClaudeCodeSetup.refreshPlugins()
  })

  onUnmounted(() => {
    ClaudeCodeSetup?.xterm?.unmounted?.()
  })
</script>
<style lang="scss" scoped>
  .plugin-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 8px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    gap: 16px;

    .plugin-info {
      flex: 1;
      overflow: hidden;

      .plugin-title {
        display: flex;
        align-items: center;

        .name {
          font-weight: 500;
        }

        .install-count {
          margin-left: 8px;
          font-size: 12px;
          color: var(--el-text-color-secondary);
        }
      }

      .plugin-desc {
        margin-top: 4px;
        font-size: 12px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    .plugin-actions {
      flex-shrink: 0;
    }
  }
</style>
