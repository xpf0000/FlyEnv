<template>
  <li
    v-if="showItem !== false"
    :class="['non-draggable', { active: currentPage === '/ai-memory' }]"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon :svg="import('@/svg/tool.svg?raw')" style="padding: 5px" width="30" height="30" />
      </div>
      <span class="title">{{ MemoryT('title') }}</span>
    </div>
  </li>
</template>
<script lang="ts" setup>
  import { MemoryT } from './lang'
  import { AsideSetup } from '@/core/ASide'
  import type { AllAppModule } from '@/core/type'
  const { showItem, currentPage, nav } = AsideSetup('ai-memory' as AllAppModule)
</script>
