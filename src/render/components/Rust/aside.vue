<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/rust' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon style="padding: 6px" :svg="import('@/svg/rust.svg?raw')" width="29" height="29" />
      </div>
      <span class="title">Rust</span>
    </div>

    <LanguageProjectASide type-flag="rust" :show-item="showItem" />
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from '@/core/ASide'
  import LanguageProjectASide from '@/components/LanguageProjects/ASide.vue'

  const { showItem, currentPage, nav } = AsideSetup('rust')
</script>
