<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/git' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon :svg="import('@/svg/github.svg?raw')" width="30" height="30" />
      </div>
      <span class="title">Git</span>
    </div>
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from '@/core/ASide'

  const { showItem, currentPage, nav } = AsideSetup('git')
</script>
