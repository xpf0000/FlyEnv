<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/java' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon style="padding: 4px" :svg="import('@/svg/java.svg?raw')" width="28" height="28" />
      </div>
      <span class="title">Java</span>
    </div>
    <LanguageProjectToggle type-flag="java" page-path="/java" />
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from '@/core/ASide'
  import LanguageProjectToggle from '@/components/LanguageProjects/Toggle.vue'

  const { showItem, currentPage, nav } = AsideSetup('java')
</script>
