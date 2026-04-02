<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/golang' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon
          style="padding: 0px"
          :svg="import('@/svg/Golang.svg?raw')"
          width="29"
          height="29"
        />
      </div>
      <span class="title">Go</span>
    </div>
    <LanguageProjectASide type-flag="golang" :show-item="showItem" />
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from '@/core/ASide'
  import LanguageProjectASide from '@/components/LanguageProjects/ASide.vue'

  const { showItem, currentPage, nav } = AsideSetup('golang')
</script>
