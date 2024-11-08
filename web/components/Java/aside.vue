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
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from '@web/core/ASide'

  const { showItem, currentPage, nav } = AsideSetup('java')
</script>
