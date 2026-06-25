<template>
  <li
    v-if="showItem !== false"
    :class="'non-draggable' + (currentPage === '/kimi' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon :svg="import('@/svg/kimi.svg?raw')" style="padding: 0px" width="28" height="28" />
      </div>
      <span class="title">Kimi</span>
    </div>
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from './ASide'

  const { showItem, currentPage, nav } = AsideSetup()
</script>
