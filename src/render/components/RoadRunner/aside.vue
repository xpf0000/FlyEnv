<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === '/roadrunner' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon
          :svg="import('@/svg/roadrunner.svg?raw')"
          style="padding: 0px"
          width="28"
          height="28"
        />
      </div>
      <span class="title">RoadRunner</span>
    </div>
    <LanguageProjectASide type-flag="roadrunner" :show-item="showItem" />
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from '@/core/ASide'
  import LanguageProjectASide from '@/components/LanguageProjects/ASide.vue'

  const { showItem, currentPage, nav } = AsideSetup('roadrunner')
</script>
