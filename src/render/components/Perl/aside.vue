<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/perl' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon style="padding: 0px" :svg="import('@/svg/perl.svg?raw')" width="29" height="29" />
      </div>
      <span class="title">Perl</span>
    </div>

    <LanguageProjectASide type-flag="perl" :show-item="showItem" />
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from '@/core/ASide'
  import LanguageProjectASide from '@/components/LanguageProjects/ASide.vue'

  const { showItem, currentPage, nav } = AsideSetup('perl')
</script>
