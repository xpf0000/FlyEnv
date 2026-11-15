<template>
  <el-card class="version-manager mcp-tools-card">
    <template #header>
      <el-radio-group
        v-model="activeGroup"
        class="mcp-tool-groups"
        size="small"
        :aria-label="I18nT('mcp.tools')"
      >
        <el-radio-button v-for="group in groups" :key="group.id" :value="group.id">
          <span class="mcp-tool-group-label">
            {{ group.id === 'builtin' ? I18nT('mcp.builtinTools') : group.label }}
            <span class="mcp-tool-count">{{ group.tools.length }}</span>
          </span>
        </el-radio-button>
      </el-radio-group>
    </template>
    <el-scrollbar class="h-full">
      <div :key="selectedGroup.id" class="mcp-tool-content">
        <section class="mcp-tool-section">
          <h3>{{ I18nT('mcp.enabledTools') }}</h3>
          <div>
            <p class="text-xs text-orange-500 mb-4">{{ I18nT('mcp.riskyTip') }}</p>
            <p class="text-xs text-gray-500 mb-4">{{ I18nT('mcp.pluginToolsRefresh') }}</p>
            <div class="flex flex-col gap-3">
              <div
                v-for="tool in selectedGroup.tools"
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
                      tool.pluginId ? tool.description : I18nT('mcp.toolDescriptions.' + tool.name)
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
        </section>
        <section class="mcp-tool-section">
          <h3>{{ I18nT('mcp.approval') }}</h3>
          <div>
            <p class="text-xs text-orange-500 mb-4">{{ I18nT('mcp.approvalTip') }}</p>
            <div class="flex flex-col gap-3">
              <div
                v-for="tool in selectedGroup.tools.filter((item) => item.risky || !item.readOnly)"
                :key="tool.name"
                class="flex items-start justify-between border-b border-gray-100 dark:border-gray-700 pb-2 gap-4"
              >
                <div class="flex flex-col gap-1 min-w-0">
                  <span class="font-mono text-sm">{{ tool.name }}</span>
                  <p class="text-xs text-gray-500 leading-relaxed">
                    {{
                      tool.pluginId ? tool.description : I18nT('mcp.toolDescriptions.' + tool.name)
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
        </section>
      </div>
    </el-scrollbar>
  </el-card>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref, watch } from 'vue'
  import { I18nT } from '@lang/index'
  import { MCPSetup } from './setup'
  import { groupMcpTools, resolveMcpToolGroup } from './toolGroups'

  const activeGroup = ref('builtin')
  const groups = computed(() => groupMcpTools(MCPSetup.tools))
  const selectedGroup = computed(
    () => groups.value.find((group) => group.id === activeGroup.value) ?? groups.value[0]
  )
  watch(groups, (value) => {
    activeGroup.value = resolveMcpToolGroup(value, activeGroup.value)
  })
  onMounted(() => MCPSetup.fetchTools())
</script>

<style scoped>
  .mcp-tools-card {
    min-height: 0;
  }
  .mcp-tool-groups {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 0;
  }
  .mcp-tool-group-label {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }
  .mcp-tool-count {
    min-width: 16px;
    height: 13px;
    padding: 0 5px;
    border-radius: 10px;
    background: var(--el-fill-color);
    color: var(--el-text-color-secondary);
    font-size: 11px;
    line-height: 13px;
    text-align: center;
  }
  :deep(.el-radio-button.is-active .mcp-tool-count) {
    color: inherit;
    background: rgb(255 255 255 / 18%);
  }
  .mcp-tool-content {
    padding: 20px;
  }
  .mcp-tool-section + .mcp-tool-section {
    margin-top: 24px;
    padding-top: 20px;
  }
  .mcp-tool-section h3 {
    margin: 0 0 16px;
    color: var(--el-text-color-primary);
    font-size: 14px;
    font-weight: 500;
  }
</style>
