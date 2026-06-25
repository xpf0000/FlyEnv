<template>
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
            class="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2"
          >
            <div class="flex items-center gap-2">
              <span class="font-mono text-sm">{{ tool }}</span>
              <el-tag v-if="RISKY_TOOLS.includes(tool)" type="warning" size="small" effect="plain">
                risky
              </el-tag>
            </div>
            <el-switch
              :model-value="MCPSetup.config.enabledTools.includes(tool)"
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
            class="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2"
          >
            <span class="font-mono text-sm">{{ tool }}</span>
            <el-radio-group
              :model-value="MCPSetup.config.approval[tool] || 'auto'"
              size="small"
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
</template>

<script lang="ts" setup>
  import { I18nT } from '@lang/index'
  import { MCPSetup, ALL_TOOLS, RISKY_TOOLS } from './setup'
</script>
