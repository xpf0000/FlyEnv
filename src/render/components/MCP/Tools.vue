<template>
  <el-scrollbar class="h-full">
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
              v-for="tool in MCPSetup.tools"
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
              v-for="tool in MCPSetup.tools.filter((item) => item.risky || !item.readOnly)"
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
      </el-card>
    </div>
  </el-scrollbar>
</template>

<script lang="ts" setup>
  import { I18nT } from '@lang/index'
  import { MCPSetup } from './setup'
  import { onMounted } from 'vue'
  onMounted(() => MCPSetup.fetchTools())
</script>
