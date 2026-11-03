<template>
  <li
    v-if="showItem !== false"
    :class="['non-draggable', { active: currentPage === '/ai-memory' }]"
    @click="nav"
  >
    <div class="left"><span class="title">AI Memory</span></div>
  </li>
</template>
<script lang="ts" setup>
  import { AsideSetup } from '@/core/ASide'
  import type { AllAppModule } from '@/core/type'
  const { showItem, currentPage, nav } = AsideSetup('ai-memory' as AllAppModule)
</script>
