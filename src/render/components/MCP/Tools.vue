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
          <div class="flex flex-col gap-3">
            <div
              v-for="tool in ALL_TOOLS"
              :key="tool"
              class="flex items-start justify-between border-b border-gray-100 dark:border-gray-700 pb-2 gap-4"
            >
              <div class="flex flex-col gap-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-mono text-sm">{{ tool }}</span>
                  <el-tag
                    v-if="RISKY_TOOLS.includes(tool)"
                    type="warning"
                    size="small"
                    effect="plain"
                  >
                    {{ I18nT('mcp.risky') }}
                  </el-tag>
                </div>
                <p class="text-xs text-gray-500 leading-relaxed">
                  {{ I18nT('mcp.toolDescriptions.' + tool) }}
                </p>
              </div>
              <el-switch
                :model-value="MCPSetup.config.enabledTools.includes(tool)"
                class="flex-shrink-0 mt-0.5"
                @change="(v: any) => MCPSetup.toggleTool(tool, !!v)"
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
              v-for="tool in RISKY_TOOLS"
              :key="tool"
              class="flex items-start justify-between border-b border-gray-100 dark:border-gray-700 pb-2 gap-4"
            >
              <div class="flex flex-col gap-1 min-w-0">
                <span class="font-mono text-sm">{{ tool }}</span>
                <p class="text-xs text-gray-500 leading-relaxed">
                  {{ I18nT('mcp.toolDescriptions.' + tool) }}
                </p>
              </div>
              <el-radio-group
                :model-value="MCPSetup.config.approval[tool] || 'auto'"
                size="small"
                class="flex-shrink-0"
                @change="(v: any) => MCPSetup.setApproval(tool, v)"
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
  import { MCPSetup, ALL_TOOLS, RISKY_TOOLS } from './setup'
</script>
