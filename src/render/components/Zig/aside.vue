<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/zig' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon style="padding: 0" :svg="import('@/svg/zig.svg?raw')" width="29" height="29" />
      </div>
      <span class="title">Zig</span>
    </div>
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from '@/core/ASide'

  const { showItem, currentPage, nav } = AsideSetup('zig')
</script>
