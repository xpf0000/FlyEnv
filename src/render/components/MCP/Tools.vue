<template>
  <el-scrollbar class="h-full">
    <el-tabs v-model="activeGroup" class="mcp-tool-tabs">
      <el-tab-pane v-for="group in groups" :key="group.id" :name="group.id">
        <template #label>
          <span class="mcp-tool-tab-label">
            {{ group.id === 'builtin' ? I18nT('mcp.builtinTools') : group.label }}
            <span class="mcp-tool-count">{{ group.tools.length }}</span>
          </span>
        </template>
        <div class="flex flex-col gap-4">
          <el-card class="version-manager">
            <template #header>
              <div class="card-header">
                <span>{{ I18nT('mcp.enabledTools') }}</span>
              </div>
            </template>
            <div class="p-5">
              <p class="text-xs text-orange-500 mb-4">{{ I18nT('mcp.riskyTip') }}</p>
              <p class="text-xs text-gray-500 mb-4">{{ I18nT('mcp.pluginToolsRefresh') }}</p>
              <div class="flex flex-col gap-3">
                <div
                  v-for="tool in group.tools"
                  :key="tool.name"
                  class="flex items-start justify-between border-b border-gray-100 dark:border-gray-700 pb-2 gap-4"
                >
                  <div class="flex flex-col gap-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-mono text-sm">{{ tool.name }}</span>
                      <el-tag v-if="tool.risky" type="warning" size="small" effect="plain">
                        {{ I18nT('mcp.risky') }}
                      </el-tag>
                    </div>
                    <p class="text-xs text-gray-500 leading-relaxed">
                      {{
                        tool.pluginId
                          ? tool.description
                          : I18nT('mcp.toolDescriptions.' + tool.name)
                      }}
                    </p>
                  </div>
                  <el-switch
                    :model-value="MCPSetup.config.enabledTools.includes(tool.name)"
                    class="flex-shrink-0 mt-0.5"
                    @change="(v: any) => MCPSetup.toggleTool(tool.name, !!v)"
                  />
                </div>
              </div>
            </div>
          </el-card>

          <el-card class="version-manager">
            <template #header>
              <div class="card-header">
                <span>{{ I18nT('mcp.approval') }}</span>
              </div>
            </template>
            <div class="p-5">
              <p class="text-xs text-orange-500 mb-4">{{ I18nT('mcp.approvalTip') }}</p>
              <div class="flex flex-col gap-3">
                <div
                  v-for="tool in group.tools.filter((item) => item.risky || !item.readOnly)"
                  :key="tool.name"
                  class="flex items-start justify-between border-b border-gray-100 dark:border-gray-700 pb-2 gap-4"
                >
                  <div class="flex flex-col gap-1 min-w-0">
                    <span class="font-mono text-sm">{{ tool.name }}</span>
                    <p class="text-xs text-gray-500 leading-relaxed">
                      {{
                        tool.pluginId
                          ? tool.description
                          : I18nT('mcp.toolDescriptions.' + tool.name)
                      }}
                    </p>
                  </div>
                  <el-radio-group
                    :model-value="
                      MCPSetup.config.approval[tool.name] || (tool.pluginId ? 'confirm' : 'auto')
                    "
                    size="small"
                    class="flex-shrink-0"
                    @change="(v: any) => MCPSetup.setApproval(tool.name, v)"
                  >
                    <el-radio-button label="auto" :value="'auto'">
                      {{ I18nT('mcp.approvalAuto') }}
                    </el-radio-button>
                    <el-radio-button label="confirm" :value="'confirm'">
                      {{ I18nT('mcp.approvalConfirm') }}
                    </el-radio-button>
                  </el-radio-group>
                </div>
              </div>
            </div>
          </el-card>
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-scrollbar>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref, watch } from 'vue'
  import { I18nT } from '@lang/index'
  import { MCPSetup } from './setup'
  import { groupMcpTools, resolveMcpToolGroup } from './toolGroups'

  const activeGroup = ref('builtin')
  const groups = computed(() => groupMcpTools(MCPSetup.tools))
  watch(groups, (value) => {
    activeGroup.value = resolveMcpToolGroup(value, activeGroup.value)
  })
  onMounted(() => MCPSetup.fetchTools())
</script>

<style scoped>
  .mcp-tool-tabs {
    padding: 16px 16px 24px;
  }
  .mcp-tool-tab-label {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }
  .mcp-tool-count {
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 10px;
    background: var(--el-fill-color);
    color: var(--el-text-color-secondary);
    font-size: 11px;
    line-height: 20px;
    text-align: center;
  }
</style>
