<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/python' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon
          style="padding: 5px"
          :svg="import('@/svg/python.svg?raw')"
          width="29"
          height="29"
        />
      </div>
      <span class="title">Python</span>
    </div>
    <LanguageProjectASide type-flag="python" :show-item="showItem" />
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from '@/core/ASide'
  import LanguageProjectASide from '@/components/LanguageProjects/ASide.vue'

  const { showItem, currentPage, nav } = AsideSetup('python')
</script>
