<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <span>{{ I18nT('mcp.clientConfig') }}</span>
      </div>
    </template>
    <div class="p-5">
      <p class="text-sm text-gray-500 mb-3">{{ I18nT('mcp.configHint') }}</p>
      <div class="relative">
        <pre
          class="bg-gray-900 text-gray-100 rounded-md p-4 overflow-auto text-xs leading-relaxed"
          >{{ MCPSetup.clientConfigSnippet }}</pre
        >
        <el-button class="absolute top-2 right-2" size="small" @click="MCPSetup.copySnippet()">
          {{ I18nT('mcp.copyConfig') }}
        </el-button>
      </div>

      <el-divider />

      <p class="text-sm text-gray-500 mb-3">{{ I18nT('mcp.addToClientTip') }}</p>
      <div class="flex gap-3">
        <el-button :disabled="!MCPSetup.running" @click="add('claudeCode')">
          {{ I18nT('mcp.addToClient', { client: 'Claude Code' }) }}
        </el-button>
        <el-button :disabled="!MCPSetup.running" @click="add('codex')">
          {{ I18nT('mcp.addToClient', { client: 'Codex' }) }}
        </el-button>
        <el-button :disabled="!MCPSetup.running" @click="add('openCode')">
          {{ I18nT('mcp.addToClient', { client: 'OpenCode' }) }}
        </el-button>
      </div>
    </div>
  </el-card>
</template>

<script lang="ts" setup>
  import { I18nT } from '@lang/index'
  import { MCPSetup } from './setup'

  const add = (flag: 'claudeCode' | 'codex' | 'openCode') => {
    MCPSetup.addToClient(flag)
  }
</script>
