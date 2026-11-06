<template>
  <li
    v-if="showItem !== false"
    data-module="ai-memory"
    :class="['non-draggable', { active: currentPage === '/ai-memory' }]"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }">
        <yb-icon :svg="memoryIcon" style="padding: 5px" width="30" height="30" />
      </div>
      <span class="title">{{ MemoryT('title') }}</span>
    </div>
    <el-tooltip
      :content="
        supported ? `${MemoryT('mcpSwitchHelp')} (${enabledCount}/5)` : MemoryT('upgradeHost')
      "
      placement="right"
    >
      <el-switch
        :model-value="serviceRunning"
        :disabled="serviceFetching || !supported"
        :loading="serviceFetching"
        :aria-label="MemoryT('memoryMcpSwitch')"
        @click.stop
        @change="switchChange"
      />
    </el-tooltip>
  </li>
</template>
<script lang="ts" setup>
  import { computed, onMounted } from 'vue'
  import { MCPSetup } from '@/components/MCP/setup'
  import memoryIcon from '@/svg/ai.svg?raw'
  import { MemoryManager } from './manager'
  import { MemoryT } from './lang'
  import { AsideSetup } from '@/core/ASide'
  import type { AllAppModule } from '@/core/type'
  const supported = !!MCPSetup?.setToolsEnabled
  const switchChange = (value: boolean | string | number) => MemoryManager.setMcpEnabled(!!value)
  const enabledCount = computed(
    () =>
      ['search', 'get', 'store', 'update', 'forget'].filter((name) =>
        MCPSetup?.config.enabledTools.includes(`flyenv_memory_${name}`)
      ).length
  )
  const serviceFetching = computed(
    () =>
      !!MCPSetup?.starting ||
      !!MCPSetup?.loading ||
      MemoryManager.actions.connection?.status === 'running' ||
      MemoryManager.actions['mcp:switch']?.status === 'running'
  )
  const serviceRunning = computed(
    () => !!MCPSetup?.running && !!MCPSetup.config.transport.http && enabledCount.value > 0
  )
  onMounted(() => {
    void MemoryManager.loadConnection()
  })
  const { showItem, currentPage, nav } = AsideSetup('ai-memory' as AllAppModule)
</script>
