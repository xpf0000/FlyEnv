<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/dotnet' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon
          style="padding: 0px"
          :svg="import('@/svg/dotnet.svg?raw')"
          width="28"
          height="28"
        />
      </div>
      <span class="title">.NET</span>
    </div>
    <LanguageProjectASide type-flag="dotnet" :show-item="showItem" />
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from '@/core/ASide'
  import LanguageProjectASide from '@/components/LanguageProjects/ASide.vue'

  const { showItem, currentPage, nav } = AsideSetup('dotnet')
</script>
