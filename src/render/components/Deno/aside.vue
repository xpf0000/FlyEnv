<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/deno' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block">
        <yb-icon style="padding: 3px" :svg="import('@/svg/deno.svg?raw')" width="29" height="29" />
      </div>
      <span class="title">Deno</span>
    </div>
  </li>
</template>

<script lang="ts" setup>
  import { AsideSetup } from '@/core/ASide'

  const { showItem, currentPage, nav } = AsideSetup('deno')
</script>
