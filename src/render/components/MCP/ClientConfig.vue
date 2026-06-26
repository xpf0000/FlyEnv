<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <span>{{ I18nT('mcp.clientConfig') }}</span>
        <el-radio-group v-model="activeTab" size="small">
          <el-radio-button label="HTTP" :value="'http'">
            {{ I18nT('mcp.httpConfig') }}
          </el-radio-button>
          <el-radio-button label="stdio" :value="'stdio'">
            {{ I18nT('mcp.stdioConfig') }}
          </el-radio-button>
        </el-radio-group>
      </div>
    </template>
    <div class="p-5">
      <template v-if="activeTab === 'http'">
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
        <div class="flex gap-3 flex-wrap">
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
      </template>

      <template v-else>
        <p class="text-sm text-gray-500 mb-3">{{ I18nT('mcp.stdioConfigHint') }}</p>
        <div class="relative">
          <pre
            class="bg-gray-900 text-gray-100 rounded-md p-4 overflow-auto text-xs leading-relaxed"
            >{{ MCPSetup.stdioConfigSnippet }}</pre
          >
          <el-button
            class="absolute top-2 right-2"
            size="small"
            @click="MCPSetup.copyStdioSnippet()"
          >
            {{ I18nT('mcp.copyConfig') }}
          </el-button>
        </div>
        <p class="text-xs text-orange-500 mt-3">{{ I18nT('mcp.stdioConfigTip') }}</p>
      </template>
    </div>
  </el-card>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { MCPSetup } from './setup'

  const activeTab = ref('http')

  const add = (flag: 'claudeCode' | 'codex' | 'openCode') => {
    MCPSetup.addToClient(flag)
  }
</script>
