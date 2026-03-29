<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/node' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon :svg="import('@/svg/nodejs.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">NodeJS</span>
    </div>
    <LanguageProjectToggle type-flag="node" page-path="/node" />
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from '@/core/ASide'
  import LanguageProjectToggle from '@/components/LanguageProjects/Toggle.vue'

  const { showItem, currentPage, nav } = AsideSetup('node')
</script>
