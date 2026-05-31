<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/php' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon :svg="import('@/svg/php.svg?raw')" style="padding: 4px" width="30" height="30" />
      </div>
      <span class="title">PHP</span>
    </div>
    <LanguageProjectASide type-flag="php" :show-item="showItem" />
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from '@/core/ASide'
  import LanguageProjectASide from '@/components/LanguageProjects/ASide.vue'

  const { showItem, currentPage, nav } = AsideSetup('php')
</script>
