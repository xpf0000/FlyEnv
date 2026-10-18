<template>
  <li
    v-if="showItem !== false"
    :class="['non-draggable', { active: currentPage === '/command-shortcuts' }]"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon
          :svg="import('@/svg/terminal.svg?raw')"
          style="padding: 6px"
          width="30"
          height="30"
        />
      </div>
      <span class="title">{{ ShortcutsT('title') }}</span>
    </div>
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from '@/core/ASide'
  import type { AllAppModule } from '@/core/type'
  import { ShortcutsT } from './lang'

  const { showItem, currentPage, nav } = AsideSetup('command-shortcuts' as AllAppModule)
</script>
