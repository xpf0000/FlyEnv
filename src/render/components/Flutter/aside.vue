<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/flutter' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon
          style="padding: 4px"
          :svg="import('@/svg/code-library.svg?raw')"
          width="29"
          height="29"
        />
      </div>
      <span class="title">Flutter</span>
    </div>

    <LanguageProjectASide type-flag="flutter" :show-item="showItem" />
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from '@/core/ASide'
  import LanguageProjectASide from '@/components/LanguageProjects/ASide.vue'

  const { showItem, currentPage, nav } = AsideSetup('flutter')
</script>
