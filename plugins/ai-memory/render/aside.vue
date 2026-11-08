<template>
  <li
    v-if="showItem !== false"
    data-module="ai-memory"
    :class="['non-draggable', { active: currentPage === '/ai-memory' }]"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block run">
        <yb-icon :svg="memoryIcon" style="padding: 5px" width="30" height="30" />
      </div>
      <span class="title">{{ MemoryT('title') }}</span>
    </div>
  </li>
</template>
<script lang="ts" setup>
  import memoryIcon from '@/svg/ai.svg?raw'
  import { MemoryT } from './lang'
  import { AsideSetup } from '@/core/ASide'
  import type { AllAppModule } from '@/core/type'
  const { showItem, currentPage, nav } = AsideSetup('ai-memory' as AllAppModule)
</script>
